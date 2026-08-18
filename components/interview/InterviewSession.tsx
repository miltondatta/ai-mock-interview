"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CVIProvider } from "@/components/cvi/components/cvi-provider"
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
import InterviewConversationPanel from "./InterviewConversationPanel"
import InterviewLoading from "./InterviewLoading"
import InterviewError from "./InterviewError"

interface InterviewSessionProps {
    interviewId: string
}

type SessionStatus = "loading" | "active" | "completed" | "error"

function InterviewSession({ interviewId }: InterviewSessionProps) {
    const router = useRouter()
    const [status, setStatus] = useState<SessionStatus>("loading")
    const [conversationUrl, setConversationUrl] = useState<string | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isEnding, setIsEnding] = useState(false)
    const [showEndConfirm, setShowEndConfirm] = useState(false)
    const [retryKey, setRetryKey] = useState(0)

    useEffect(() => {
        let ignore = false

        async function startInterview() {
            try {
                const res = await fetch("/api/interview/start", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ interviewId }),
                })
                const data = await res.json().catch(() => null)
                if (ignore) return
                if (!res.ok) {
                    setErrorMessage(data?.error ?? "Unable to start the interview. Please try again.")
                    setStatus("error")
                    return
                }
                setConversationUrl(data.conversationUrl)
                setStatus("active")
            } catch (e) {
                if (ignore) return
                console.error(e)
                setErrorMessage("Unable to start the interview. Please try again.")
                setStatus("error")
            }
        }

        startInterview()
        return () => {
            ignore = true
        }
    }, [interviewId, retryKey])

    const handleRetry = () => {
        setStatus("loading")
        setErrorMessage(null)
        setRetryKey((k) => k + 1)
    }

    // Mark the interview ended if the candidate closes/refreshes the tab mid-call
    // instead of clicking End Call, so it doesn't stay "in_progress" forever.
    useEffect(() => {
        if (status !== "active") return
        const handleUnload = () => {
            navigator.sendBeacon?.(
                "/api/interview/end",
                new Blob([JSON.stringify({ interviewId })], { type: "application/json" })
            )
        }
        window.addEventListener("beforeunload", handleUnload)
        return () => window.removeEventListener("beforeunload", handleUnload)
    }, [status, interviewId])

    const confirmEndCall = async () => {
        if (isEnding) return
        setShowEndConfirm(false)
        setIsEnding(true)
        try {
            await fetch("/api/interview/end", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ interviewId }),
            })
        } catch (e) {
            console.error(e)
        } finally {
            setStatus("completed")
            router.push(`/interview/${interviewId}/start`)
        }
    }

    return (
        <div className="flex h-screen flex-col gap-4 p-4 md:p-6">
            <h1 className="text-xl font-semibold">Interview Sessions</h1>

            <div className="flex flex-1 overflow-hidden">
                {status === "error" ? (
                    <InterviewError
                        message={errorMessage ?? "Unable to start the interview. Please try again."}
                        onRetry={handleRetry}
                    />
                ) : status === "loading" ? (
                    <InterviewLoading message="Starting interview..." />
                ) : conversationUrl ? (
                    <CVIProvider>
                        <div className="flex h-full w-full flex-col gap-4 md:flex-row">
                            <div className="min-h-[320px] flex-1 md:w-[60%] md:flex-none lg:w-[65%]">
                                <InterviewVideoPanel
                                    conversationUrl={conversationUrl}
                                    onEndCall={() => setShowEndConfirm(true)}
                                    isEnding={isEnding}
                                />
                            </div>
                            <div className="min-h-[240px] flex-1 md:w-[40%] md:flex-none lg:w-[35%]">
                                <InterviewConversationPanel />
                            </div>
                        </div>
                    </CVIProvider>
                ) : null}
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

export default InterviewSession
