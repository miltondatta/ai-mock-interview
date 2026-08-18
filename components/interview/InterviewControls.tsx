"use client"

import { Mic, MicOff, PhoneOff } from "lucide-react"
import { Button } from "@/components/ui/button"

interface InterviewControlsProps {
    isMicMuted: boolean
    onToggleMicrophone: () => void
    onEndCall: () => void
    isEnding?: boolean
}

function InterviewControls({ isMicMuted, onToggleMicrophone, onEndCall, isEnding }: InterviewControlsProps) {
    return (
        <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onToggleMicrophone} disabled={isEnding}>
                {isMicMuted ? <MicOff /> : <Mic />}
                {isMicMuted ? "Unmute" : "Mute"}
            </Button>
            <Button variant="destructive" onClick={onEndCall} disabled={isEnding}>
                <PhoneOff />
                {isEnding ? "Ending..." : "End Call"}
            </Button>
        </div>
    )
}

export default InterviewControls
