"use client"

import { useEffect, useRef, useState } from "react"
import { ConversationProvider } from "@elevenlabs/react"
import TutorCall from "./TutorCall"
import type { RoomContext } from "./types"

interface StudyRoomTutorSessionProps {
  sessionId: string
  room: RoomContext
}

type ConnectionStatus = "loading" | "ready" | "error"

export interface TutorConnection {
  conversationToken: string
  dynamicVariables: Record<string, string>
  language: string
  firstMessage: string
  isResume: boolean
}

// Mirrors components/interview/InterviewSession.tsx's fetch-token-on-mount
// pattern exactly, scoped to the Study Room Tutor's own token endpoint
// (/api/study-room/tutor/start) - a completely separate ElevenLabs agent
// from the Interview feature's.
function StudyRoomTutorSession({ sessionId, room }: StudyRoomTutorSessionProps) {
  const [status, setStatus] = useState<ConnectionStatus>("loading")
  const [connection, setConnection] = useState<TutorConnection | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const currentRequestKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const requestKey = `${sessionId}:${retryKey}`
    if (currentRequestKeyRef.current === requestKey) return
    currentRequestKeyRef.current = requestKey

    async function startTutor() {
      try {
        const res = await fetch("/api/study-room/tutor/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        })
        const data = await res.json().catch(() => null)
        if (currentRequestKeyRef.current !== requestKey) return
        if (!res.ok) {
          setErrorMessage(data?.error ?? "Unable to start the AI Tutor. Please try again.")
          setStatus("error")
          return
        }
        setConnection(data.connection)
        setStatus("ready")
      } catch (e) {
        if (currentRequestKeyRef.current !== requestKey) return
        console.error(e)
        setErrorMessage("Unable to start the AI Tutor. Please try again.")
        setStatus("error")
      }
    }

    startTutor()
  }, [sessionId, retryKey])

  const handleRetry = () => {
    setStatus("loading")
    setErrorMessage(null)
    setRetryKey((k) => k + 1)
  }

  if (status === "loading") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Connecting to your AI Tutor...</p>
      </div>
    )
  }

  if (status === "error" || !connection) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-sm font-semibold text-destructive">{errorMessage ?? "Unable to start the AI Tutor."}</p>
        <button
          type="button"
          onClick={handleRetry}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <ConversationProvider>
      <TutorCall sessionId={sessionId} room={room} connection={connection} />
    </ConversationProvider>
  )
}

export default StudyRoomTutorSession
