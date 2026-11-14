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
  Send,
  X,
  Square,
  WifiOff,
  Wifi,
  PenTool,
  Code2,
  NotebookPen,
  Network,
} from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import type { RoomContext, TranscriptMessage } from "./types"
import type { TutorConnection } from "./StudyRoomTutorSession"
import Workspace, { type WorkspaceHandle } from "./Workspace"
import type { WorkspaceTool } from "./workspaceTypes"

type AgentLanguage = NonNullable<
  NonNullable<NonNullable<Parameters<ReturnType<typeof useConversation>["startSession"]>[0]>["overrides"]>["agent"]
>["language"]

const LANGUAGE_OVERRIDE_ENABLED = process.env.NEXT_PUBLIC_ELEVENLABS_LANGUAGE_OVERRIDE_ENABLED === "true"
const BAR_COUNT = 10

interface TutorCallProps {
  sessionId: string
  room: RoomContext
  connection: TutorConnection
}

function Waveform({ levels, active }: { levels: number[]; active: boolean }) {
  return (
    <div className="flex h-7 items-center justify-center gap-[3px]">
      {levels.map((level, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-primary transition-[height] duration-100"
          style={{ height: `${active ? Math.max(15, level) : 15}%` }}
        />
      ))}
    </div>
  )
}

function TutorCall({ sessionId, room, connection }: TutorCallProps) {
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
  const [audioMuted, setAudioMuted] = useState(false)
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(15))
  const [hasOpenTools, setHasOpenTools] = useState(false)

  const messageCounter = useRef(0)
  const pendingTextSourceRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const workspaceRef = useRef<WorkspaceHandle>(null)

  // Seed the local transcript from persisted history exactly once (a
  // resumed session's prior turns), so new live turns append after it
  // instead of being overwritten by every Convex refetch.
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

  const conversation = useConversation({
    onMessage: ({ message, role }) => {
      const isLearner = role === "user"
      const source: "voice" | "text" | undefined = isLearner
        ? pendingTextSourceRef.current
          ? "text"
          : "voice"
        : undefined
      pendingTextSourceRef.current = false

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
    onError: (message, context) =>
      console.error("Study Room Tutor error:", message, context, "conversationId:", getSafeConversationId()),
    onDisconnect: (details) => {
      const log = details.reason === "error" ? console.error : console.log
      log(
        "Study Room Tutor disconnected:",
        details.reason,
        "context" in details ? details.context : undefined,
        "conversationId:",
        getSafeConversationId()
      )
    },
  })

  useEffect(() => {
    if (conversation.mode === "speaking") setThinking(false)
  }, [conversation.mode])

  // Real voice-activity bars from the SDK's own frequency data - input while
  // the learner is talking, output while the Tutor is talking. Not a fake
  // CSS animation.
  useEffect(() => {
    if (conversation.status !== "connected") {
      setLevels(Array(BAR_COUNT).fill(15))
      return
    }
    function tick() {
      const data =
        conversation.mode === "speaking" ? conversation.getOutputByteFrequencyData() : conversation.getInputByteFrequencyData()
      const step = Math.max(1, Math.floor(data.length / BAR_COUNT))
      const next: number[] = []
      for (let i = 0; i < BAR_COUNT; i++) {
        next.push(Math.round(((data[i * step] ?? 0) / 255) * 100))
      }
      setLevels(next)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // conversation's action methods (getInputByteFrequencyData etc.) are
    // documented as stable references, so only status/mode need to be
    // tracked here - including the whole `conversation` object would
    // restart this loop on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.status, conversation.mode])

  // Mark the session ended if the learner closes/refreshes the tab instead
  // of clicking End Session, mirroring InterviewCall's beforeunload handler.
  useEffect(() => {
    if (conversation.status !== "connected") return
    const handleUnload = () => {
      navigator.sendBeacon?.(
        "/api/study-room/tutor/end",
        new Blob([JSON.stringify({ sessionId })], { type: "application/json" })
      )
    }
    window.addEventListener("beforeunload", handleUnload)
    return () => window.removeEventListener("beforeunload", handleUnload)
  }, [conversation.status, sessionId])

  // Gesture-gated, like InterviewCall.tsx - getUserMedia must follow a real
  // click (not a mount effect) so React Strict Mode's dev-only double-mount
  // never starts and immediately tears down a session.
  const handleJoin = async () => {
    if (isJoining) return
    setIsJoining(true)
    setJoinError(null)
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      conversation.startSession({
        conversationToken: connection.conversationToken,
        dynamicVariables: connection.dynamicVariables,
        overrides: {
          agent: {
            firstMessage: connection.firstMessage,
            ...(LANGUAGE_OVERRIDE_ENABLED ? { language: connection.language as AgentLanguage } : {}),
          },
        },
      })
      setHasJoined(true)
    } catch (e) {
      console.error("Failed to join Study Room session:", e)
      setJoinError("Unable to access your microphone. Please allow microphone access and try again.")
    } finally {
      setIsJoining(false)
    }
  }

  function handleInterrupt() {
    if (conversation.isMuted) conversation.setMuted(false)
    conversation.sendUserActivity()
  }

  function handleSendText(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || conversation.status !== "connected") return
    pendingTextSourceRef.current = true
    conversation.sendUserMessage(text)
    setDraft("")
  }

  async function handleEndSession() {
    if (isEnding || !userId) return
    setIsEnding(true)
    try {
      conversation.endSession()
      await endSessionMutation({ userId, sessionId: sessionId as Id<"studyRoomSessions"> })
      router.push(`/study-room/session/${sessionId}`)
    } catch (e) {
      console.error(e)
    } finally {
      setIsEnding(false)
    }
  }

  const status = conversation.status
  const statusMeta =
    status === "connecting"
      ? { label: "Connecting", badge: "bg-muted text-muted-foreground" }
      : status === "error"
        ? { label: "Connection lost", badge: "bg-destructive/10 text-destructive" }
        : thinking
          ? { label: "Thinking", badge: "bg-muted text-muted-foreground" }
          : conversation.mode === "speaking"
            ? { label: "Speaking", badge: "bg-primary/10 text-primary" }
            : { label: "Listening to you", badge: "bg-success/15 text-success" }

  const isAnimated = status === "connected" && (conversation.mode === "speaking" || conversation.mode === "listening")

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

  // --- Connection-lost overlay ---------------------------------------------
  const showReconnectOverlay = status === "error"

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
        {showReconnectOverlay && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/90 backdrop-blur-sm">
            <div className="mx-4 flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center shadow-md">
              <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <WifiOff className="size-6" />
              </div>
              <h2 className="text-base font-bold text-foreground">Connection lost</h2>
              <p className="text-sm text-muted-foreground">
                Your progress is saved. Reconnect to continue this session with Nova.
              </p>
              <button
                type="button"
                onClick={handleJoin}
                disabled={isJoining}
                className="mt-1 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Wifi className="size-4" /> {isJoining ? "Reconnecting..." : "Reconnect"}
              </button>
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

              <Waveform levels={levels} active={isAnimated} />

              {messages.length === 0 && (
                <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                  {connection.isResume
                    ? "Reconnecting you with Nova to continue this session..."
                    : connection.firstMessage}
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
                disabled={status !== "connected"}
                className="flex-1 rounded-xl border border-border bg-background px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={status !== "connected" || !draft.trim()}
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
            {conversation.mode === "speaking" && status === "connected" && (
              <button
                type="button"
                onClick={handleInterrupt}
                className="inline-flex items-center gap-1.5 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-semibold text-warning-foreground hover:bg-warning/20"
              >
                <Square className="size-3.5" /> Interrupt
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
                conversation.setVolume({ volume: next ? 0 : 1 })
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
