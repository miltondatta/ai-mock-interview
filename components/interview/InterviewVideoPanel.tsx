"use client"

import { UserIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import InterviewLoading from "./InterviewLoading"
import InterviewError from "./InterviewError"
import InterviewControls from "./InterviewControls"

interface InterviewVideoPanelProps {
    status: "disconnected" | "connecting" | "connected" | "error"
    isSpeaking: boolean
    isMuted: boolean
    onToggleMicrophone: () => void
    onEndCall: () => void
    isEnding?: boolean
}

function InterviewVideoPanel({
    status,
    isSpeaking,
    isMuted,
    onToggleMicrophone,
    onEndCall,
    isEnding,
}: InterviewVideoPanelProps) {
    // "disconnected" only shows as an error here because this panel only ever
    // renders once a session has started - an unexpected drop, not the initial
    // pre-connect state (that's InterviewSession's own "loading" screen).
    const isErrored = status === "error" || status === "disconnected"
    const isConnecting = status === "connecting"

    return (
        <div className="flex h-full w-full flex-col gap-4">
            <div className="relative flex-1 overflow-hidden rounded-2xl border border-border bg-muted">
                {isErrored ? (
                    <InterviewError message="Unable to connect to the interviewer. Please check your connection and try again." />
                ) : isConnecting ? (
                    <InterviewLoading message="Connecting to interviewer..." />
                ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
                        <div
                            className={cn(
                                "flex size-28 items-center justify-center rounded-full bg-primary/10 text-primary transition-shadow",
                                isSpeaking && "shadow-[0_0_0_8px_rgba(59,130,246,0.15)]"
                            )}
                        >
                            <UserIcon className="size-12" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {isSpeaking ? "Interviewer is speaking..." : "Interviewer"}
                        </p>
                    </div>
                )}
            </div>

            <div className="flex justify-center">
                <InterviewControls
                    isMicMuted={isMuted}
                    onToggleMicrophone={onToggleMicrophone}
                    onEndCall={onEndCall}
                    isEnding={isEnding}
                />
            </div>
        </div>
    )
}

export default InterviewVideoPanel
