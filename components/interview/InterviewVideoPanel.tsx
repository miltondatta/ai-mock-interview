"use client"

import { useEffect } from "react"
import { DailyAudioTrack, DailyVideo, useDaily, useMeetingState, useVideoTrack } from "@daily-co/daily-react"
import { useCVICall } from "@/components/cvi/hooks/use-cvi-call"
import { useReplicaIDs } from "@/components/cvi/hooks/use-replica-ids"
import { useLocalMicrophone } from "@/components/cvi/hooks/use-local-microphone"
import InterviewLoading from "./InterviewLoading"
import InterviewError from "./InterviewError"
import InterviewControls from "./InterviewControls"

interface InterviewVideoPanelProps {
    conversationUrl: string
    onEndCall: () => void
    isEnding?: boolean
}

function InterviewVideoPanel({ conversationUrl, onEndCall, isEnding }: InterviewVideoPanelProps) {
    const daily = useDaily()
    const { joinCall, leaveCall } = useCVICall()
    const meetingState = useMeetingState()
    const replicaIds = useReplicaIDs()
    const replicaId = replicaIds[0]
    const videoState = useVideoTrack(replicaId)
    const { isMicMuted, onToggleMicrophone } = useLocalMicrophone()

    useEffect(() => {
        // DailyProvider creates its call object in its own effect, which (as a
        // parent) runs after this effect on first mount - `daily` is still null
        // the first time this fires. Wait for it, otherwise joinCall's internal
        // `daily?.join(...)` silently no-ops and the call never starts.
        if (!daily) return

        joinCall({ url: conversationUrl })
        // Release the singleton call on unmount, otherwise a remount's join() is
        // rejected ("already joined meeting").
        return () => {
            leaveCall()
        }
    }, [daily, conversationUrl, joinCall, leaveCall])

    const isErrored = meetingState === "error"
    const isConnecting = !isErrored && (!replicaId || videoState.state !== "playable")

    return (
        <div className="flex h-full w-full flex-col gap-4">
            <div className="relative flex-1 overflow-hidden rounded-2xl border border-border bg-muted">
                {isErrored ? (
                    <InterviewError message="Unable to connect to the interviewer. Please check your connection and try again." />
                ) : isConnecting ? (
                    <InterviewLoading message="Connecting to interviewer..." />
                ) : (
                    <>
                        <DailyVideo
                            automirror
                            sessionId={replicaId}
                            type="video"
                            fit="cover"
                            className="h-full w-full object-cover"
                        />
                        <DailyAudioTrack sessionId={replicaId} />
                    </>
                )}
            </div>

            <div className="flex justify-center">
                <InterviewControls
                    isMicMuted={isMicMuted}
                    onToggleMicrophone={onToggleMicrophone}
                    onEndCall={onEndCall}
                    isEnding={isEnding}
                />
            </div>
        </div>
    )
}

export default InterviewVideoPanel
