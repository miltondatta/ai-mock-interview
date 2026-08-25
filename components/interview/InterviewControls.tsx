"use client"

import { Mic, MicOff, PhoneOff } from "lucide-react"
import { cn } from "@/lib/utils"

interface InterviewControlsProps {
    isMicMuted: boolean
    onToggleMicrophone: () => void
    onEndCall: () => void
    isEnding?: boolean
}

function InterviewControls({ isMicMuted, onToggleMicrophone, onEndCall, isEnding }: InterviewControlsProps) {
    return (
        <div className="flex items-center gap-3 rounded-full border border-border bg-card px-3 py-2 shadow-sm">
            <button
                onClick={onToggleMicrophone}
                disabled={isEnding}
                aria-label={isMicMuted ? "Unmute microphone" : "Mute microphone"}
                aria-pressed={isMicMuted}
                className={cn(
                    "flex size-11 items-center justify-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-50",
                    isMicMuted
                        ? "bg-muted text-foreground hover:bg-muted/80"
                        : "bg-primary/10 text-primary hover:bg-primary/15"
                )}
            >
                {isMicMuted ? <MicOff className="size-[18px]" /> : <Mic className="size-[18px]" />}
            </button>
            <button
                onClick={onEndCall}
                disabled={isEnding}
                aria-label="End call"
                className="flex h-11 items-center gap-2 rounded-full bg-destructive px-5 text-sm font-medium text-white transition-colors hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50"
            >
                <PhoneOff className="size-[18px]" />
                {isEnding ? "Ending..." : "End Call"}
            </button>
        </div>
    )
}

export default InterviewControls
