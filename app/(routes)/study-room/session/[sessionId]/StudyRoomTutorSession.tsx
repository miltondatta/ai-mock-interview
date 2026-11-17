"use client"

import { useCallback, useContext, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ConversationProvider } from "@elevenlabs/react"
import { useMutation } from "convex/react"
import { MonitorSmartphone } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import TutorCall from "./TutorCall"
import type { RoomContext } from "./types"

interface StudyRoomTutorSessionProps {
  sessionId: string
  room: RoomContext
}

type ConnectionStatus = "loading" | "ready" | "error"

// Phase 1 (C4) - single-active-tab ownership of the live Tutor.
//  - "acquiring": asking Convex for this session's Tutor lease
//  - "owned": this tab may run the live Tutor (fetches a token, renders TutorCall)
//  - "held_elsewhere": another tab owns it - no token, no microphone here
//  - "lost": this tab owned it but another tab took over - TutorCall is
//    unmounted, which makes ConversationProvider end this tab's conversation
type LeaseState = "acquiring" | "owned" | "held_elsewhere" | "lost"

export interface TutorConnection {
  conversationToken: string
  dynamicVariables: Record<string, string>
  language: string
  firstMessage: string
  isResume: boolean
}

// One id per browser tab (module scope = one JS realm per tab), stable across
// client-side navigations within the tab. Deliberately not sessionStorage:
// "Duplicate tab" copies sessionStorage, which would give two tabs one id.
const TAB_CLIENT_ID =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

const HEARTBEAT_MS = 20_000
const CHANNEL_NAME = "study-room-tutor"

type ChannelMessage =
  | { type: "takeover"; sessionId: string; clientId: string }
  | { type: "released"; sessionId: string; clientId: string }

class HeldElsewhereError extends Error {}

// Mirrors components/interview/InterviewSession.tsx's fetch-token-on-mount
// pattern, scoped to the Study Room Tutor's own token endpoint
// (/api/study-room/tutor/start) - a completely separate ElevenLabs agent
// from the Interview feature's. Phase 1 adds lease ownership in front of it
// and exposes `requestFreshConnection` so TutorCall can genuinely reconnect
// with a brand-new token instead of reusing the consumed one.
function StudyRoomTutorSession({ sessionId, room }: StudyRoomTutorSessionProps) {
  const { userDetail } = useContext(UserDetailContext)
  const userId: Id<"UserTable"> | undefined = userDetail?._id
  const sid = sessionId as Id<"studyRoomSessions">

  const acquireLease = useMutation(api.StudyRoom.AcquireTutorLease)
  const renewLease = useMutation(api.StudyRoom.RenewTutorLease)
  const releaseLease = useMutation(api.StudyRoom.ReleaseTutorLease)

  const [lease, setLease] = useState<LeaseState>("acquiring")
  const [leaseAttempt, setLeaseAttempt] = useState(0)
  const [forceTakeover, setForceTakeover] = useState(false)
  const [status, setStatus] = useState<ConnectionStatus>("loading")
  const [connection, setConnection] = useState<TutorConnection | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const currentRequestKeyRef = useRef<string | null>(null)
  const leaseRef = useRef<LeaseState>("acquiring")
  const channelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    leaseRef.current = lease
  }, [lease])

  // --- Lease acquisition ---------------------------------------------------
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLease("acquiring")
    acquireLease({ userId, sessionId: sid, clientId: TAB_CLIENT_ID, force: forceTakeover || undefined })
      .then((result) => {
        if (cancelled) return
        if (result.ok) {
          setLease("owned")
          if (forceTakeover) {
            channelRef.current?.postMessage({ type: "takeover", sessionId, clientId: TAB_CLIENT_ID } satisfies ChannelMessage)
          }
        } else {
          // "session_ended" - the page's own live query switches to the
          // completion screen on its own; treat it like "not ours" meanwhile.
          setLease("held_elsewhere")
        }
      })
      .catch((e) => {
        if (cancelled) return
        console.error("Failed to acquire Study Room Tutor lease:", e)
        setLease("held_elsewhere")
      })
      .finally(() => {
        if (!cancelled) setForceTakeover(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, sessionId, leaseAttempt])

  const checkStillOwner = useCallback(async () => {
    if (!userId || leaseRef.current !== "owned") return
    try {
      const result = await renewLease({ userId, sessionId: sid, clientId: TAB_CLIENT_ID })
      if (!result.ok && leaseRef.current === "owned") setLease("lost")
    } catch (e) {
      // A transient network failure isn't proof another tab took over -
      // just try again on the next heartbeat.
      console.error("Failed to renew Study Room Tutor lease:", e)
    }
  }, [userId, sid, renewLease])

  // --- Heartbeat while owned ----------------------------------------------
  useEffect(() => {
    if (lease !== "owned") return
    const timer = setInterval(checkStillOwner, HEARTBEAT_MS)
    return () => clearInterval(timer)
  }, [lease, checkStillOwner])

  // --- Same-browser coordination (instant, complements the heartbeat) ------
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channelRef.current = channel
    channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      const msg = event.data
      if (!msg || msg.sessionId !== sessionId || msg.clientId === TAB_CLIENT_ID) return
      if (msg.type === "takeover" && leaseRef.current === "owned") void checkStillOwner()
      if (msg.type === "released" && leaseRef.current === "held_elsewhere") setLeaseAttempt((n) => n + 1)
    }
    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [sessionId, checkStillOwner])

  // --- Release: on unmount (in-app navigation) and on tab close ------------
  useEffect(() => {
    if (lease !== "owned" || !userId) return
    const announceRelease = () =>
      channelRef.current?.postMessage({ type: "released", sessionId, clientId: TAB_CLIENT_ID } satisfies ChannelMessage)
    const handlePageHide = (e: PageTransitionEvent) => {
      // A page kept in the back/forward cache isn't gone yet.
      if (e.persisted) return
      navigator.sendBeacon?.(
        "/api/study-room/tutor/release",
        new Blob([JSON.stringify({ sessionId, clientId: TAB_CLIENT_ID })], { type: "application/json" })
      )
      announceRelease()
    }
    window.addEventListener("pagehide", handlePageHide)
    return () => {
      window.removeEventListener("pagehide", handlePageHide)
      releaseLease({ userId, sessionId: sid, clientId: TAB_CLIENT_ID }).catch(() => undefined)
      announceRelease()
    }
  }, [lease, userId, sessionId, sid, releaseLease])

  // --- Token fetch (only once this tab owns the session) -------------------
  const fetchConnection = useCallback(async (): Promise<TutorConnection> => {
    const res = await fetch("/api/study-room/tutor/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, clientId: TAB_CLIENT_ID }),
    })
    const data = await res.json().catch(() => null)
    if (res.status === 409 && data?.code === "held_elsewhere") {
      throw new HeldElsewhereError(data.error)
    }
    if (!res.ok || !data?.connection) {
      throw new Error(data?.error ?? "Unable to start the AI Tutor. Please try again.")
    }
    return data.connection as TutorConnection
  }, [sessionId])

  useEffect(() => {
    if (lease !== "owned") return
    // leaseAttempt is part of the key so regaining ownership (e.g. "Use this
    // tab instead" after losing it) always fetches a new token rather than
    // remounting TutorCall with the previous, already-consumed one.
    const requestKey = `${sessionId}:${retryKey}:${leaseAttempt}`
    if (currentRequestKeyRef.current === requestKey) return
    currentRequestKeyRef.current = requestKey
    setStatus("loading")
    setConnection(null)

    fetchConnection()
      .then((conn) => {
        if (currentRequestKeyRef.current !== requestKey) return
        setConnection(conn)
        setStatus("ready")
      })
      .catch((e) => {
        if (currentRequestKeyRef.current !== requestKey) return
        if (e instanceof HeldElsewhereError) {
          setLease("held_elsewhere")
          return
        }
        console.error(e)
        setErrorMessage(e instanceof Error ? e.message : "Unable to start the AI Tutor. Please try again.")
        setStatus("error")
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lease, sessionId, retryKey, fetchConnection])

  // Handed to TutorCall for a genuine reconnect (C2): always a brand-new
  // token + freshly rebuilt dynamic variables (including the latest
  // conversation_history from Convex), never the consumed original token.
  const requestFreshConnection = useCallback(async (): Promise<TutorConnection> => {
    try {
      return await fetchConnection()
    } catch (e) {
      if (e instanceof HeldElsewhereError) setLease("held_elsewhere")
      throw e
    }
  }, [fetchConnection])

  const handleRetry = () => {
    setStatus("loading")
    setErrorMessage(null)
    setRetryKey((k) => k + 1)
  }

  function handleTakeover() {
    setForceTakeover(true)
    setLeaseAttempt((n) => n + 1)
  }

  if (lease === "held_elsewhere" || lease === "lost") {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MonitorSmartphone className="size-6" />
        </div>
        <div>
          <p className="text-xs font-semibold text-primary">{room.topic}</p>
          <h1 className="mt-1 text-lg font-bold text-foreground">
            {lease === "lost" ? "This session moved to another tab" : "This session is open in another tab"}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Nova can only be live in one tab at a time, so this tab isn&apos;t using your microphone. Continue in the
            other tab, or move the live session here - the other tab will disconnect.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={handleTakeover}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
          >
            Use this tab instead
          </button>
          {lease === "held_elsewhere" && (
            <button
              type="button"
              onClick={() => setLeaseAttempt((n) => n + 1)}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Check again
            </button>
          )}
        </div>
        <Link href={`/study-room/${room._id}`} className="text-sm font-medium text-primary hover:underline">
          View this room&apos;s sessions and saved materials
        </Link>
      </div>
    )
  }

  if (lease === "acquiring" || status === "loading") {
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
      <TutorCall
        sessionId={sessionId}
        room={room}
        connection={connection}
        clientId={TAB_CLIENT_ID}
        requestFreshConnection={requestFreshConnection}
      />
    </ConversationProvider>
  )
}

export default StudyRoomTutorSession
