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
    const isConnected = status === "connected"

    return (
        <div className="flex h-full w-full flex-col gap-4">
            <div className="relative flex-1 overflow-hidden rounded-2xl bg-neutral-950">
                {isErrored ? (
                    <InterviewError
                        dark
                        message="Unable to connect to the interviewer. Please check your connection and try again."
                    />
                ) : isConnecting ? (
                    <InterviewLoading dark message="Connecting to interviewer..." />
                ) : (
                    <>
                        <div className="pointer-events-none absolute top-[30%] left-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />

                        <div className="absolute top-4 left-4 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                            <span className="size-1.5 rounded-full bg-primary" />
                            AI Interviewer
                        </div>

                        <div className="absolute top-4 right-4 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                            <span
                                className={cn(
                                    "size-1.5 rounded-full",
                                    isConnected ? "bg-emerald-400" : "bg-neutral-400"
                                )}
                            />
                            {isConnected ? "Live" : "Idle"}
                        </div>

                        <div className="flex h-full w-full flex-col items-center justify-center gap-4">
                            <div className="relative flex items-center justify-center">
                                <div
                                    className={cn(
                                        "absolute rounded-full bg-primary/25 transition-all duration-500",
                                        isSpeaking ? "size-36 animate-ping opacity-75" : "size-28 opacity-0"
                                    )}
                                />
                                <div
                                    className={cn(
                                        "relative flex size-28 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-primary ring-1 ring-white/10 transition-all duration-300",
                                        isSpeaking && "ring-2 ring-primary/60"
                                    )}
                                >
                                    <UserIcon className="size-12" />
                                </div>
                            </div>
                            <p className="text-sm text-neutral-300">
                                {isSpeaking ? "Interviewer is speaking..." : "Waiting for your response..."}
                            </p>
                        </div>
                    </>
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
