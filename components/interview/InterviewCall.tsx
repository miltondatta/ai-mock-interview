"use client"

import { useEffect, useReducer, useState } from "react"
import { useRouter } from "next/navigation"
import { useConversation } from "@elevenlabs/react"
import { MicIcon } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogClose,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import InterviewVideoPanel from "./InterviewVideoPanel"
import InterviewConversationPanel, { type TranscriptMessage } from "./InterviewConversationPanel"
import type { ElevenLabsConnection } from "./InterviewSession"

interface InterviewCallProps {
    interviewId: string
    connection: ElevenLabsConnection
}

let messageCounter = 0

function messagesReducer(state: TranscriptMessage[], message: TranscriptMessage): TranscriptMessage[] {
    return [...state, message]
}

function InterviewCall({ interviewId, connection }: InterviewCallProps) {
    const router = useRouter()
    const [messages, dispatchMessage] = useReducer(messagesReducer, [])
    const [isEnding, setIsEnding] = useState(false)
    const [showEndConfirm, setShowEndConfirm] = useState(false)
    const [hasJoined, setHasJoined] = useState(false)
    const [isJoining, setIsJoining] = useState(false)
    const [joinError, setJoinError] = useState<string | null>(null)

    // conversation.getId() throws once the SDK has cleared its active session
    // (always true by the time onDisconnect fires), so it can't be called
    // directly from these callbacks without an unhandled rejection.
    function getSafeConversationId() {
        try {
            return conversation.getId()
        } catch {
            return undefined
        }
    }

    const conversation = useConversation({
        onMessage: ({ message, role, event_id }) => {
            dispatchMessage({
                id: event_id !== undefined ? `${role}-${event_id}` : `${role}-${messageCounter++}`,
                role: role === "user" ? "candidate" : "agent",
                text: message,
            })
        },
        onError: (message, context) =>
            console.error("ElevenLabs conversation error:", message, context, "conversationId:", getSafeConversationId()),
        onDisconnect: (details) =>
            console.error(
                "ElevenLabs conversation disconnected:",
                details.reason,
                details.context,
                "conversationId:",
                getSafeConversationId()
            ),
    })

    // startSession() is only ever called from this click handler, never from a
    // mount effect: ConversationProvider itself has an unmount-cleanup effect
    // that unconditionally ends the active/pending session, and React Strict
    // Mode's dev-only mount->cleanup->mount cycle would fire that cleanup and
    // kill a session started during the first mount pass. A user gesture
    // handler is never double-invoked by Strict Mode, so this sidesteps that
    // entirely (and satisfies browsers that want a gesture before mic access).
    const handleJoin = async () => {
        if (isJoining) return
        setIsJoining(true)
        setJoinError(null)
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true })
            conversation.startSession({
                conversationToken: connection.conversationToken,
                dynamicVariables: connection.dynamicVariables,
            })
            setHasJoined(true)
        } catch (e) {
            console.error("Failed to join interview:", e)
            setJoinError("Unable to access your microphone. Please allow microphone access and try again.")
        } finally {
            setIsJoining(false)
        }
    }

    // Mark the interview ended if the candidate closes/refreshes the tab mid-call
    // instead of clicking End Call, so it doesn't stay "in_progress" forever.
    useEffect(() => {
        if (conversation.status !== "connected") return
        const handleUnload = () => {
            navigator.sendBeacon?.(
                "/api/interview/end",
                new Blob([JSON.stringify({ interviewId })], { type: "application/json" })
            )
        }
        window.addEventListener("beforeunload", handleUnload)
        return () => window.removeEventListener("beforeunload", handleUnload)
    }, [conversation.status, interviewId])

    const confirmEndCall = async () => {
        if (isEnding) return
        setShowEndConfirm(false)
        setIsEnding(true)
        try {
            conversation.endSession()
            const feedbackMessages = messages.map((message) => ({
                from: message.role === "candidate" ? "user" : "bot",
                text: message.text,
            }))
            await fetch("/api/interview/end", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ interviewId, messages: feedbackMessages }),
            })
        } catch (e) {
            console.error(e)
        } finally {
            router.push("/dashboard")
        }
    }

    if (!hasJoined) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card p-8 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <MicIcon className="size-6" />
                </div>
                <div>
                    <h2 className="text-base font-semibold">Ready to join?</h2>
                    <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                        You&apos;re about to join a live interview call. Make sure your microphone is ready.
                    </p>
                </div>
                {joinError && <p className="text-sm text-destructive">{joinError}</p>}
                <Button size="lg" onClick={handleJoin} disabled={isJoining}>
                    {isJoining ? "Joining..." : "Join Interview"}
                </Button>
            </div>
        )
    }

    return (
        <div className="flex h-full w-full flex-col gap-4 md:flex-row">
            <div className="min-h-[320px] flex-1 md:w-[60%] md:flex-none lg:w-[65%]">
                <InterviewVideoPanel
                    status={conversation.status}
                    isSpeaking={conversation.isSpeaking}
                    isMuted={conversation.isMuted}
                    onToggleMicrophone={() => conversation.setMuted(!conversation.isMuted)}
                    onEndCall={() => setShowEndConfirm(true)}
                    onReconnect={handleJoin}
                    isEnding={isEnding}
                />
            </div>
            <div className="min-h-[240px] flex-1 md:w-[40%] md:flex-none lg:w-[35%]">
                <InterviewConversationPanel messages={messages} />
            </div>

            <Dialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>End interview?</DialogTitle>
                        <DialogDescription>
                            This will end the call with the interviewer. You won&apos;t be able to resume this session.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <DialogClose>
                            <Button variant="ghost">Cancel</Button>
                        </DialogClose>
                        <Button variant="destructive" onClick={confirmEndCall}>
                            End Call
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

export default InterviewCall
