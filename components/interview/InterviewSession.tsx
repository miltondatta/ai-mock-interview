"use client"

import { useEffect, useRef, useState } from "react"
import { ConversationProvider } from "@elevenlabs/react"
import InterviewCall from "./InterviewCall"
import InterviewLoading from "./InterviewLoading"
import InterviewError from "./InterviewError"

interface InterviewSessionProps {
    interviewId: string
}

type SessionStatus = "loading" | "active" | "error"

export interface ElevenLabsConnection {
    conversationToken: string
    dynamicVariables: Record<string, string>
}

function InterviewSession({ interviewId }: InterviewSessionProps) {
    const [status, setStatus] = useState<SessionStatus>("loading")
    const [connection, setConnection] = useState<ElevenLabsConnection | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [retryKey, setRetryKey] = useState(0)
    // Guards against React Strict Mode's dev-only double-invoke of this effect:
    // unlike a plain `ignore` flag (which only suppresses the *second*
    // invocation's state update, not its fetch call), this dedupes the fetch
    // itself so a mount never creates two ElevenLabs conversation tokens. Also
    // supersedes a genuinely stale in-flight request if interviewId/retryKey
    // changes again before it resolves.
    const currentRequestKeyRef = useRef<string | null>(null)

    useEffect(() => {
        const requestKey = `${interviewId}:${retryKey}`
        if (currentRequestKeyRef.current === requestKey) return
        currentRequestKeyRef.current = requestKey

        async function startInterview() {
            try {
                const res = await fetch("/api/interview/start", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ interviewId }),
                })
                const data = await res.json().catch(() => null)
                if (currentRequestKeyRef.current !== requestKey) return
                if (!res.ok) {
                    setErrorMessage(data?.error ?? "Unable to start the interview. Please try again.")
                    setStatus("error")
                    return
                }
                setConnection({
                    conversationToken: data.connection.conversationToken,
                    dynamicVariables: data.connection.dynamicVariables,
                })
                setStatus("active")
            } catch (e) {
                if (currentRequestKeyRef.current !== requestKey) return
                console.error(e)
                setErrorMessage("Unable to start the interview. Please try again.")
                setStatus("error")
            }
        }

        startInterview()
    }, [interviewId, retryKey])

    const handleRetry = () => {
        setStatus("loading")
        setErrorMessage(null)
        setRetryKey((k) => k + 1)
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
                ) : connection ? (
                    <ConversationProvider>
                        <InterviewCall interviewId={interviewId} connection={connection} />
                    </ConversationProvider>
                ) : null}
            </div>
        </div>
    )
}

export default InterviewSession
