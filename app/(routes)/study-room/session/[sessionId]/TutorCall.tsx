"use client"

import React, { useContext, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useConversation } from "@elevenlabs/react"
import { useMutation, useQuery } from "convex/react"
import {
  ArrowLeft,
  Bot,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  MessageCircle,
  PhoneOff,
  Pause,
  Send,
  X,
  Square,
  WifiOff,
  Wifi,
  PenTool,
  Code2,
  NotebookPen,
  Network,
  Loader2,
  AlertTriangle,
  Info,
} from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import type { RoomContext, TranscriptMessage } from "./types"
import type { TutorConnection } from "./StudyRoomTutorSession"
import Workspace, { type WorkspaceHandle } from "./Workspace"
import TutorWaveform from "./TutorWaveform"
import type { WorkspaceTool } from "./workspaceTypes"

type HookProps = NonNullable<Parameters<typeof useConversation>[0]>
type DisconnectDetails = Parameters<NonNullable<HookProps["onDisconnect"]>>[0]
type AgentLanguage = NonNullable<
  NonNullable<NonNullable<Parameters<ReturnType<typeof useConversation>["startSession"]>[0]>["overrides"]>["agent"]
>["language"]

const LANGUAGE_OVERRIDE_ENABLED = process.env.NEXT_PUBLIC_ELEVENLABS_LANGUAGE_OVERRIDE_ENABLED === "true"
// A start/reconnect attempt that hasn't connected by then is treated as failed
// (also covers the SDK silently ignoring a start while an older one is pending).
const CONNECT_TIMEOUT_MS = 25_000
// After an Interrupt, Nova's audio stays silenced until her interrupted turn
// is over: the learner takes the floor (voice/text), the server reports an
// interruption, or she has been quiet ("listening") for this long.
const INTERRUPT_SETTLE_MS = 1_200
// M3 - hard ceiling on how long Interrupt may silence Nova's audio. The
// settle timer above only arms while `conversation.mode === "listening"`
// (see the effect below); mode is reported via LiveKit's active-speaker
// detection on the *published* agent track, which keeps tracking the
// server's own turn-taking regardless of our local setVolume(0) - it can
// swing straight from one "speaking" turn to the next without ever passing
// through "listening" (e.g. the agent starts its next reply before the
// interrupted one's audio has fully drained), in which case the settle
// timer never arms and nothing else would ever call finishInterrupt(). This
// fallback guarantees Nova's audio always comes back within a bounded time
// even in that case, instead of staying silenced for the rest of the session.
const INTERRUPT_HARD_TIMEOUT_MS = 8_000
const NOTICE_MS = 6_000
// M3 - see handleReconnect: a short grace period between ending the old
// conversation and starting the new one.
const RECONNECT_TEARDOWN_GRACE_MS = 250

// Phase 1 (C1/C3) - the Tutor's real connection lifecycle, tracked here
// instead of reading the SDK's `status`, which flips to "error" on *any* SDK
// error (even a non-fatal tool failure while audio keeps playing) and shows
// a dropped connection as plain "disconnected".
type LinkState = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected" | "failed"

interface TutorCallProps {
  sessionId: string
  room: RoomContext
  connection: TutorConnection
  // Phase 1 (C4) - this tab's Tutor lease id (see StudyRoomTutorSession).
  clientId: string
  // Phase 1 (C2) - fetches a brand-new token + rebuilt dynamic variables.
  requestFreshConnection: () => Promise<TutorConnection>
}

function describeDisconnect(details: DisconnectDetails): string {
  if (details.reason === "error") {
    if (details.context?.type === "max_duration_exceeded") {
      return "This conversation reached Nova's maximum length. Reconnect to keep going - everything so far is saved."
    }
    return details.message ? `The connection to Nova was lost (${details.message}).` : "The connection to Nova was lost."
  }
  if (details.reason === "agent") {
    const why = details.closeReason || details.context?.reason
    return why ? `Nova ended the conversation (${why}).` : "Nova ended the conversation."
  }
  return "The conversation was closed."
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Phase 1 (C9) - confirms microphone permission without leaving a stream
// running. If the browser already reports permission as granted, no stream
// is opened at all (avoids needlessly flipping Bluetooth headsets into their
// call profile); otherwise a short probe is opened and every track is
// stopped straight away. ElevenLabs opens and owns its own microphone stream
// inside startSession() and releases it on endSession().
async function ensureMicrophonePermission(): Promise<void> {
  try {
    const permission = await navigator.permissions?.query({ name: "microphone" as PermissionName })
    if (permission?.state === "granted") return
  } catch {
    // "microphone" isn't queryable in every browser (e.g. Firefox) - fall
    // through to the probe.
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  stream.getTracks().forEach((track) => track.stop())
}

function TutorCall({ sessionId, room, connection, clientId, requestFreshConnection }: TutorCallProps) {
  const router = useRouter()
  const { userDetail } = useContext(UserDetailContext)
  const userId: Id<"UserTable"> | undefined = userDetail?._id

  const history = useQuery(
    api.StudyRoom.GetStudyRoomMessages,
    userId ? { userId, sessionId: sessionId as Id<"studyRoomSessions"> } : "skip"
  )
  const appendMessage = useMutation(api.StudyRoom.AppendStudyRoomMessage)
  const endSessionMutation = useMutation(api.StudyRoom.EndStudyRoomSession)

  const [messages, setMessages] = useState<TranscriptMessage[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [hasJoined, setHasJoined] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [thinking, setThinking] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [isEnding, setIsEnding] = useState(false)
  const [isPausing, setIsPausing] = useState(false)
  const [audioMuted, setAudioMuted] = useState(false)
  const [hasOpenTools, setHasOpenTools] = useState(false)
  const [linkState, setLinkStateValue] = useState<LinkState>("idle")
  const [activeConnection, setActiveConnection] = useState<TutorConnection>(connection)
  const [connectionIssue, setConnectionIssue] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [interrupting, setInterrupting] = useState(false)

  const messageCounter = useRef(0)
  const pendingTextSourceRef = useRef(false)
  const workspaceRef = useRef<WorkspaceHandle>(null)
  // Refs mirror state that SDK callbacks read, so a callback firing between
  // renders never acts on a stale value.
  const linkStateRef = useRef<LinkState>("idle")
  const interruptingRef = useRef(false)
  const audioMutedRef = useRef(false)
  // True while *we* are ending a conversation (End Session, reconnect,
  // timeout, unmount) - its onDisconnect is then expected, not a failure.
  const intentionalEndRef = useRef(false)
  // Join/reconnect in flight - blocks double clicks from starting twice.
  const busyRef = useRef(false)
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // M3 - unconditional fallback for an Interrupt whose mode-gated settle
  // timer never arms (see INTERRUPT_HARD_TIMEOUT_MS above).
  const interruptHardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function setLinkState(next: LinkState) {
    linkStateRef.current = next
    setLinkStateValue(next)
  }

  function clearWatchdog() {
    if (watchdogRef.current) clearTimeout(watchdogRef.current)
    watchdogRef.current = null
  }

  function failConnection(message: string) {
    clearWatchdog()
    setThinking(false)
    setConnectionIssue(message)
    setLinkState("failed")
  }

  function showNotice(message: string) {
    setNotice(message)
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = setTimeout(() => setNotice(null), NOTICE_MS)
  }

  useEffect(() => {
    return () => {
      // Unmounting (navigation, or the tab lost its lease) - ConversationProvider
      // ends the conversation itself; its disconnect is expected.
      intentionalEndRef.current = true
      if (watchdogRef.current) clearTimeout(watchdogRef.current)
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
      if (interruptHardTimeoutRef.current) clearTimeout(interruptHardTimeoutRef.current)
    }
  }, [])

  // Seed the local transcript from persisted history exactly once (a
  // resumed session's prior turns), so new live turns append after it
  // instead of being overwritten by every Convex refetch. It also stays in
  // place across a reconnect, since this component isn't remounted.
  useEffect(() => {
    if (historyLoaded || history === undefined) return
    setMessages(
      history.map((m) => ({ id: m._id, role: m.role, text: m.text, createdAt: m.createdAt, source: m.source }))
    )
    setHistoryLoaded(true)
  }, [history, historyLoaded])

  function persistMessage(role: "tutor" | "learner", text: string, source?: "voice" | "text") {
    if (!userId) return
    appendMessage({ userId, sessionId: sessionId as Id<"studyRoomSessions">, role, text, source }).catch((e) =>
      console.error("Failed to save Study Room message:", e)
    )
  }

  function getSafeConversationId() {
    try {
      return conversation.getId()
    } catch {
      return undefined
    }
  }

  // --- Interrupt (C10) ------------------------------------------------------
  // The installed SDK (@elevenlabs/react 1.13 / @elevenlabs/client 1.21) has
  // no client call that cancels the agent's current response; the server
  // only cuts a response short when the learner takes the turn (barge-in by
  // voice or a typed message), which it reports as an `interruption` event.
  // So Interrupt = silence Nova's playback immediately (setVolume), make
  // sure the mic is live and signal learner activity (sendUserActivity) so
  // the learner can speak or type at once; audio is restored as soon as her
  // interrupted turn is over (see finishInterrupt's callers).
  function clearInterruptHardTimeout() {
    if (interruptHardTimeoutRef.current) clearTimeout(interruptHardTimeoutRef.current)
    interruptHardTimeoutRef.current = null
  }

  function handleInterrupt() {
    if (interruptingRef.current || linkStateRef.current !== "connected") return
    interruptingRef.current = true
    setInterrupting(true)
    conversation.setVolume({ volume: 0 })
    if (conversation.isMuted) conversation.setMuted(false)
    conversation.sendUserActivity()
    // M3 - see INTERRUPT_HARD_TIMEOUT_MS: guarantees audio comes back even
    // if mode never settles on "listening" and the learner never speaks.
    clearInterruptHardTimeout()
    interruptHardTimeoutRef.current = setTimeout(finishInterrupt, INTERRUPT_HARD_TIMEOUT_MS)
  }

  // Restores Nova's audio (respecting the learner's own "mute Tutor audio"
  // choice) for her next turn.
  function finishInterrupt() {
    clearInterruptHardTimeout()
    if (!interruptingRef.current) return
    interruptingRef.current = false
    setInterrupting(false)
    conversation.setVolume({ volume: audioMutedRef.current ? 0 : 1 })
  }

  // The conversation is gone - nothing to restore on it (a new conversation
  // starts at full volume; the mute preference is re-applied on connect).
  function resetInterrupt() {
    clearInterruptHardTimeout()
    interruptingRef.current = false
    setInterrupting(false)
  }

  const conversation = useConversation({
    onConnect: () => {
      clearWatchdog()
      setConnectionIssue(null)
      setLinkState("connected")
    },
    onMessage: ({ message, role }) => {
      const isLearner = role === "user"
      const source: "voice" | "text" | undefined = isLearner
        ? pendingTextSourceRef.current
          ? "text"
          : "voice"
        : undefined
      pendingTextSourceRef.current = false

      // The learner has taken the turn - Nova's next reply should be heard.
      if (isLearner) finishInterrupt()

      setMessages((prev) => [
        ...prev,
        {
          id: `live-${messageCounter.current++}`,
          role: isLearner ? "learner" : "tutor",
          text: message,
          createdAt: Date.now(),
          source,
        },
      ])
      setThinking(isLearner)
      persistMessage(isLearner ? "learner" : "tutor", message, source)
    },
    onInterruption: (event) => {
      console.log("Study Room Tutor interrupted - event:", event?.event_id, "conversationId:", getSafeConversationId())
      finishInterrupt()
    },
    // C1 - errors no longer imply a dead connection. While a start/reconnect
    // is in flight an error means that attempt failed; during a live
    // conversation it's logged and surfaced as a dismissable notice, and a
    // genuinely dropped connection is reported by onDisconnect instead.
    onError: (message, context) => {
      console.error("Study Room Tutor error:", message, context, "conversationId:", getSafeConversationId())
      const phase = linkStateRef.current
      if (phase === "connecting" || phase === "reconnecting") {
        failConnection(message ? `Couldn't connect to Nova (${message}).` : "Couldn't connect to Nova.")
        return
      }
      if (phase !== "connected") return
      const isToolError = !!context && typeof context === "object" && "clientToolName" in context
      showNotice(
        isToolError
          ? "A workspace action didn't complete. You can ask Nova to try again."
          : "Nova ran into a temporary problem, but the conversation is still active."
      )
    },
    // C3 - a real disconnect now changes what the learner sees.
    onDisconnect: (details) => {
      const log = details.reason === "error" ? console.error : console.log
      log(
        "Study Room Tutor disconnected:",
        details.reason,
        "context" in details ? details.context : undefined,
        "conversationId:",
        getSafeConversationId()
      )
      clearWatchdog()
      resetInterrupt()
      setThinking(false)
      if (intentionalEndRef.current) return
      const phase = linkStateRef.current
      if (phase === "failed") return
      if (phase === "connecting" || phase === "reconnecting") {
        failConnection(describeDisconnect(details))
        return
      }
      setConnectionIssue(describeDisconnect(details))
      setLinkState("disconnected")
    },
  })

  useEffect(() => {
    if (conversation.mode === "speaking") setThinking(false)
  }, [conversation.mode])

  // Interrupt fallback: once Nova has gone quiet after an Interrupt, give
  // her audio back for her next turn.
  useEffect(() => {
    if (!interrupting || conversation.mode !== "listening") return
    const timer = setTimeout(finishInterrupt, INTERRUPT_SETTLE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interrupting, conversation.mode])

  // A (re)connected conversation starts at full volume - re-apply the
  // learner's "mute Tutor audio" choice.
  useEffect(() => {
    if (linkState === "connected" && audioMutedRef.current) conversation.setVolume({ volume: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkState])

  // Phase 2 (C5) - the voice-activity bars now live in <TutorWaveform>,
  // which animates them via refs without any React state, so they no longer
  // re-render this component (and the Workspace under it) every frame.

  // Mark the session ended if the learner closes/refreshes the tab instead
  // of clicking End Session, mirroring InterviewCall's beforeunload handler.
  // Only this (lease-owning) tab ever renders TutorCall, and the request
  // carries its lease id - the server ignores it if another tab holds the
  // active lease (C4).
  useEffect(() => {
    if (linkState !== "connected") return
    const handleUnload = () => {
      navigator.sendBeacon?.(
        "/api/study-room/tutor/end",
        new Blob([JSON.stringify({ sessionId, clientId })], { type: "application/json" })
      )
    }
    window.addEventListener("beforeunload", handleUnload)
    return () => window.removeEventListener("beforeunload", handleUnload)
  }, [linkState, sessionId, clientId])

  function startConversation(conn: TutorConnection) {
    intentionalEndRef.current = false
    clearWatchdog()
    watchdogRef.current = setTimeout(() => {
      const phase = linkStateRef.current
      if (phase === "connecting" || phase === "reconnecting") {
        intentionalEndRef.current = true
        conversation.endSession()
        failConnection("Couldn't reach Nova. Check your connection and try again.")
      }
    }, CONNECT_TIMEOUT_MS)
    conversation.startSession({
      conversationToken: conn.conversationToken,
      dynamicVariables: conn.dynamicVariables,
      overrides: {
        agent: {
          firstMessage: conn.firstMessage,
          ...(LANGUAGE_OVERRIDE_ENABLED ? { language: conn.language as AgentLanguage } : {}),
        },
      },
    })
  }

  // Gesture-gated, like InterviewCall.tsx - the microphone must follow a real
  // click (not a mount effect) so React Strict Mode's dev-only double-mount
  // never starts and immediately tears down a session.
  const handleJoin = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setIsJoining(true)
    setJoinError(null)
    try {
      await ensureMicrophonePermission()
    } catch (e) {
      console.error("Failed to join Study Room session:", e)
      setJoinError("Unable to access your microphone. Please allow microphone access and try again.")
      busyRef.current = false
      setIsJoining(false)
      return
    }
    setLinkState("connecting")
    setHasJoined(true)
    startConversation(activeConnection)
    busyRef.current = false
    setIsJoining(false)
  }

  // C2 - a genuine reconnect: end what's left of the old conversation, get a
  // brand-new token (the original one is single-use), whose freshly rebuilt
  // dynamic variables carry the saved conversation history so Nova resumes
  // with context, then start exactly one new conversation.
  const handleReconnect = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setIsJoining(true)
    resetInterrupt()
    setThinking(false)
    setConnectionIssue(null)
    setLinkState("reconnecting")
    intentionalEndRef.current = true
    clearWatchdog()
    conversation.endSession()
    try {
      // M3 - the SDK's endSession() doesn't return a promise for its async
      // teardown (room.disconnect() + removing the old <audio> element from
      // the DOM), so that teardown can't be awaited directly here. This
      // grace period reduces the window where the old conversation's
      // teardown and the new one's startSession() below could overlap (e.g.
      // two audio elements briefly attached at once) - it's a best-effort
      // mitigation, not a guarantee, since the SDK exposes nothing to wait
      // on. ensureMicrophonePermission()/requestFreshConnection() usually
      // add further real delay of their own; this guarantees a minimum gap
      // even when permission is already granted and the token request is fast.
      await sleep(RECONNECT_TEARDOWN_GRACE_MS)
      await ensureMicrophonePermission()
      const fresh = await requestFreshConnection()
      if (linkStateRef.current !== "reconnecting") return
      setActiveConnection(fresh)
      startConversation(fresh)
    } catch (e) {
      console.error("Failed to reconnect Study Room Tutor:", e)
      failConnection(
        e instanceof Error && e.message ? e.message : "Couldn't reconnect to Nova. Please try again."
      )
    } finally {
      busyRef.current = false
      setIsJoining(false)
    }
  }

  function handleSendText(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || linkState !== "connected") return
    pendingTextSourceRef.current = true
    conversation.sendUserMessage(text)
    setDraft("")
  }

  async function handleEndSession() {
    if (isEnding || !userId) return
    setIsEnding(true)
    try {
      intentionalEndRef.current = true
      clearWatchdog()
      resetInterrupt()
      conversation.endSession()
      await endSessionMutation({ userId, sessionId: sessionId as Id<"studyRoomSessions">, clientId })
      router.push(`/study-room/session/${sessionId}`)
    } catch (e) {
      console.error(e)
    } finally {
      setIsEnding(false)
    }
  }

  // Pause - leaves the session row "in_progress" (unlike End Session), so
  // the lesson simply stops here rather than completing. Leaving it that way
  // is already how a resumable pause works elsewhere in this session (see
  // convex/StudyRoom.ts:StartStudyRoomSession) - this just disconnects the
  // live Tutor call and returns to the session page, where re-joining
  // resumes the same, still-"in_progress" lesson.
  function handlePause() {
    if (isPausing || isEnding) return
    setIsPausing(true)
    intentionalEndRef.current = true
    clearWatchdog()
    resetInterrupt()
    conversation.endSession()
    router.push(`/study-room/session/${sessionId}`)
  }

  const isConnected = linkState === "connected"
  const statusMeta =
    linkState === "connecting"
      ? { label: "Connecting", badge: "bg-muted text-muted-foreground" }
      : linkState === "reconnecting"
        ? { label: "Reconnecting", badge: "bg-muted text-muted-foreground" }
        : linkState === "disconnected"
          ? { label: "Disconnected", badge: "bg-destructive/10 text-destructive" }
          : linkState === "failed"
            ? { label: "Connection failed", badge: "bg-destructive/10 text-destructive" }
            : !isConnected
              ? { label: "Not connected", badge: "bg-muted text-muted-foreground" }
              : interrupting
                ? { label: "Your turn", badge: "bg-success/15 text-success" }
                : thinking
                  ? { label: "Thinking", badge: "bg-muted text-muted-foreground" }
                  : conversation.mode === "speaking"
                    ? { label: "Speaking", badge: "bg-primary/10 text-primary" }
                    : { label: "Listening to you", badge: "bg-success/15 text-success" }

  const isAnimated = isConnected && (conversation.mode === "speaking" || conversation.mode === "listening")

  // --- Join screen --------------------------------------------------------
  if (!hasJoined) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot className="size-6" />
        </div>
        <div>
          <p className="text-xs font-semibold text-primary">{room.topic}</p>
          <h1 className="mt-1 text-lg font-bold text-foreground">{room.title}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            You&apos;re about to start a live voice session with Nova, your AI tutor. Make sure your microphone is
            ready - you can also type instead of speaking at any time.
          </p>
        </div>
        {joinError && <p className="text-sm text-destructive">{joinError}</p>}
        <button
          type="button"
          onClick={handleJoin}
          disabled={isJoining}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isJoining ? "Joining..." : "Join Session"}
        </button>
      </div>
    )
  }

  // --- Connection overlay (reconnecting / disconnected / failed) -----------
  const showConnectionOverlay = linkState === "reconnecting" || linkState === "disconnected" || linkState === "failed"

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 flex-col gap-2 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/study-room")}
            aria-label="Return to dashboard"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-muted"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Network className="size-3.5" />
              <span className="truncate">{room.topic}</span>
            </div>
            <h1 className="truncate text-base font-bold text-foreground sm:text-lg">{room.title}</h1>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/study-room")}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-muted"
        >
          Exit to Dashboard
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {notice && isConnected && (
          <div className="absolute inset-x-0 top-3 z-10 flex justify-center px-4">
            <div className="flex max-w-md items-start gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-md">
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1">{notice}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Dismiss"
                className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        )}

        {showConnectionOverlay && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/90 backdrop-blur-sm">
            <div className="mx-4 flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center shadow-md">
              {linkState === "reconnecting" ? (
                <>
                  <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Loader2 className="size-6 animate-spin" />
                  </div>
                  <h2 className="text-base font-bold text-foreground">Reconnecting to Nova...</h2>
                  <p className="text-sm text-muted-foreground">
                    Getting a fresh connection. Your conversation so far is kept.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    {linkState === "failed" ? <AlertTriangle className="size-6" /> : <WifiOff className="size-6" />}
                  </div>
                  <h2 className="text-base font-bold text-foreground">
                    {linkState === "failed" ? "Couldn't connect to Nova" : "Nova is disconnected"}
                  </h2>
                  {connectionIssue && <p className="text-sm text-foreground">{connectionIssue}</p>}
                  <p className="text-sm text-muted-foreground">
                    Nova isn&apos;t listening or speaking right now. Your progress is saved - reconnect to continue this
                    session.
                  </p>
                  <button
                    type="button"
                    onClick={handleReconnect}
                    disabled={isJoining}
                    className="mt-1 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Wifi className="size-4" /> {linkState === "failed" ? "Try again" : "Reconnect"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          style={{ display: hasOpenTools ? "none" : "flex" }}
          className="min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6 lg:px-10"
        >
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
            <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6 text-center">
              <div className="flex size-24 items-center justify-center rounded-full bg-card ring-4 ring-primary/30 sm:size-28">
                <div className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground sm:size-20">
                  <Bot className="size-8 sm:size-9" />
                </div>
              </div>

              <div>
                <p className="text-lg font-bold text-foreground">Nova &middot; AI Tutor</p>
                <span className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.badge}`}>
                  <span className="size-1.5 rounded-full bg-current" />
                  {statusMeta.label}
                </span>
              </div>

              {/* Real voice-activity bars from the SDK's own frequency data -
                  input while the learner is talking, output while the Tutor
                  is talking. Not a fake CSS animation. */}
              <TutorWaveform
                animated={isAnimated}
                visible={!hasOpenTools}
                speaking={conversation.mode === "speaking"}
                interrupting={interrupting}
                getInputData={conversation.getInputByteFrequencyData}
                getOutputData={conversation.getOutputByteFrequencyData}
              />

              {messages.length === 0 && (
                <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                  {activeConnection.isResume
                    ? "Reconnecting you with Nova to continue this session..."
                    : activeConnection.firstMessage}
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              {(
                [
                  { id: "whiteboard" as WorkspaceTool, icon: PenTool, label: "Whiteboard" },
                  { id: "code" as WorkspaceTool, icon: Code2, label: "Code" },
                  { id: "notes" as WorkspaceTool, icon: NotebookPen, label: "Notes" },
                ]
              ).map((tool) => (
                <button
                  key={tool.label}
                  type="button"
                  onClick={() => workspaceRef.current?.openTool(tool.id)}
                  className="flex flex-1 flex-col items-start gap-2.5 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5 sm:p-5"
                >
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <tool.icon className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{tool.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Open the {tool.label}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="h-28 shrink-0 sm:h-24" />
          </div>
        </div>

        <div style={{ display: hasOpenTools ? "flex" : "none" }} className="min-h-0 flex-1 overflow-hidden">
          {userId && (
            <Workspace ref={workspaceRef} sessionId={sessionId} userId={userId} onOpenToolsChange={setHasOpenTools} />
          )}
        </div>
        </main>

        {chatOpen && (
          <aside className="flex w-full max-w-sm shrink-0 flex-col border-l border-border bg-card sm:max-w-xs lg:max-w-sm">
            <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
              <p className="text-sm font-bold text-foreground">Conversation with Nova</p>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                aria-label="Close conversation"
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "tutor" ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      m.role === "tutor" ? "rounded-tl-sm bg-muted text-foreground" : "rounded-tr-sm bg-primary text-primary-foreground"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-muted px-3 py-2">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <form onSubmit={handleSendText} className="flex items-center gap-2 border-t border-border p-3">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type your message..."
                disabled={!isConnected}
                className="flex-1 rounded-xl border border-border bg-background px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!isConnected || !draft.trim()}
                aria-label="Send message"
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="size-4" />
              </button>
            </form>
          </aside>
        )}
      </div>

      <footer className="shrink-0 border-t border-border bg-card/95 px-3 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Bot className="size-4.5" />
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-semibold text-foreground">Nova</p>
              <p className="truncate text-xs text-muted-foreground">{statusMeta.label}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isConnected && (conversation.mode === "speaking" || interrupting) && (
              <button
                type="button"
                onClick={handleInterrupt}
                disabled={interrupting}
                className="inline-flex items-center gap-1.5 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-semibold text-warning-foreground hover:bg-warning/20 disabled:cursor-default disabled:opacity-70"
              >
                <Square className="size-3.5" /> {interrupting ? "Stopped - your turn" : "Interrupt"}
              </button>
            )}

            <button
              type="button"
              onClick={() => setChatOpen((v) => !v)}
              aria-pressed={chatOpen}
              className={`flex size-10 items-center justify-center rounded-xl border transition-colors ${
                chatOpen ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-background text-foreground hover:bg-muted"
              }`}
              aria-label="Toggle chat"
            >
              <MessageCircle className="size-4.5" />
            </button>

            <button
              type="button"
              onClick={() => conversation.setMuted(!conversation.isMuted)}
              aria-pressed={conversation.isMuted}
              className={`flex size-10 items-center justify-center rounded-xl border transition-colors ${
                conversation.isMuted ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-background text-foreground hover:bg-muted"
              }`}
              aria-label={conversation.isMuted ? "Unmute microphone" : "Mute microphone"}
            >
              {conversation.isMuted ? <MicOff className="size-4.5" /> : <Mic className="size-4.5" />}
            </button>

            <button
              type="button"
              onClick={() => {
                const next = !audioMuted
                setAudioMuted(next)
                audioMutedRef.current = next
                // While an Interrupt is silencing Nova, just record the
                // choice - finishInterrupt applies it when audio comes back.
                if (!interruptingRef.current) conversation.setVolume({ volume: next ? 0 : 1 })
              }}
              aria-pressed={audioMuted}
              className={`hidden size-10 items-center justify-center rounded-xl border transition-colors sm:flex ${
                audioMuted ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-background text-foreground hover:bg-muted"
              }`}
              aria-label={audioMuted ? "Unmute Tutor audio" : "Mute Tutor audio"}
              title="Toggle Tutor audio output"
            >
              {audioMuted ? <VolumeX className="size-4.5" /> : <Volume2 className="size-4.5" />}
            </button>

            <button
              type="button"
              onClick={handlePause}
              disabled={isPausing || isEnding}
              className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary shadow-xs transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Pause className="size-4" />
              <span className="hidden sm:inline">{isPausing ? "Pausing..." : "Pause"}</span>
            </button>

            <button
              type="button"
              onClick={handleEndSession}
              disabled={isEnding}
              className="inline-flex items-center gap-2 rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <PhoneOff className="size-4" />
              <span className="hidden sm:inline">{isEnding ? "Ending..." : "End Session"}</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default TutorCall
