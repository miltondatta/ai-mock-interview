"use client"

import React, { useContext, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import {
  ArrowLeft,
  Bot,
  Pencil,
  Archive,
  RotateCcw,
  Trash2,
  MoreHorizontal,
  Clock,
  CheckCircle2,
  Loader2,
  Sparkles,
  Link2,
} from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import ConfirmDialog from "./ConfirmDialog"
import RenameRoomDialog from "./RenameRoomDialog"
import { DIFFICULTY_LABELS, SESSION_STATUS_META, formatDateTime, formatDuration, type Difficulty, type SessionStatus } from "../types"

interface RoomDetail {
  _id: string
  title: string
  topic: string
  objective?: string
  category?: string
  difficulty?: Difficulty
  learningPreferences?: string[]
  additionalInstructions?: string
  status: "active" | "archived"
  createdAt: number
  lastAccessedAt?: number
  linkedSources?: { type: string; label: string; href?: string; available: boolean }[]
}

interface SessionDetail {
  _id: string
  status: SessionStatus
  startedAt: number
  endedAt?: number
  durationSeconds?: number
}

function StudyRoomDetailPage() {
  const params = useParams<{ studyRoomId: string }>()
  const router = useRouter()
  const { userDetail } = useContext(UserDetailContext)
  const userId: Id<"UserTable"> | undefined = userDetail?._id
  const studyRoomId = params.studyRoomId as Id<"studyRooms">

  const [menuOpen, setMenuOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [starting, setStarting] = useState(false)

  const data = useQuery(
    api.StudyRoom.GetStudyRoomDetails,
    userId ? { userId, studyRoomId } : "skip"
  ) as { room: RoomDetail; sessions: SessionDetail[] } | null | undefined

  const setStatus = useMutation(api.StudyRoom.SetStudyRoomStatus)
  const deleteRoom = useMutation(api.StudyRoom.DeleteStudyRoom)
  const startSession = useMutation(api.StudyRoom.StartStudyRoomSession)

  async function handleArchiveToggle() {
    if (!userId || !data) return
    setBusy(true)
    try {
      await setStatus({ userId, studyRoomId, status: data.room.status === "active" ? "archived" : "active" })
      setArchiveConfirmOpen(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!userId) return
    setBusy(true)
    try {
      await deleteRoom({ userId, studyRoomId })
      router.push("/study-room")
    } finally {
      setBusy(false)
    }
  }

  async function handleStartSession() {
    if (!userId || starting) return
    setStarting(true)
    try {
      const { sessionId } = await startSession({ userId, studyRoomId })
      router.push(`/study-room/session/${sessionId}`)
    } catch {
      setStarting(false)
    }
  }

  if (data === undefined) {
    return <div className="mx-auto max-w-4xl px-6 py-14 text-center text-sm text-muted-foreground">Loading...</div>
  }

  if (data === null) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-14 text-center">
        <p className="text-sm font-semibold text-foreground">This study room could not be found.</p>
        <Link href="/study-room" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="size-4" /> Back to AI Study Room
        </Link>
      </div>
    )
  }

  const { room, sessions } = data
  const isArchived = room.status === "archived"

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 md:px-10 md:py-14">
      <Link href="/study-room" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to AI Study Room
      </Link>

      <div className="mt-5 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bot className="size-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-foreground sm:text-2xl">{room.title}</h1>
              {isArchived && (
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">Archived</span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{room.topic}</p>
            {room.linkedSources && room.linkedSources.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {room.linkedSources.map((src, i) =>
                  src.available && src.href ? (
                    <Link
                      key={i}
                      href={src.href}
                      className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                    >
                      <Link2 className="size-3" /> {src.label}
                    </Link>
                  ) : (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                    >
                      <Link2 className="size-3" /> {src.label}
                    </span>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleStartSession}
            disabled={starting || isArchived}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {starting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {starting ? "Starting..." : "Start New Session"}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More actions"
              className="flex size-9 items-center justify-center rounded-xl border border-border bg-card text-foreground hover:bg-muted"
            >
              <MoreHorizontal className="size-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-10 mt-2 w-48 rounded-xl border border-border bg-popover p-1.5 shadow-lg">
                <button
                  type="button"
                  onClick={() => { setRenameOpen(true); setMenuOpen(false) }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground hover:bg-muted"
                >
                  <Pencil className="size-4" /> Rename Room
                </button>
                <button
                  type="button"
                  onClick={() => { setArchiveConfirmOpen(true); setMenuOpen(false) }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground hover:bg-muted"
                >
                  {isArchived ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}
                  {isArchived ? "Unarchive Room" : "Archive Room"}
                </button>
                <button
                  type="button"
                  onClick={() => { setDeleteConfirmOpen(true); setMenuOpen(false) }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" /> Delete Room
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
        {room.objective && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Learning objective</p>
            <p className="mt-1 text-sm text-foreground">{room.objective}</p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {room.category && (
            <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
              {room.category}
            </span>
          )}
          {room.difficulty && (
            <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
              {DIFFICULTY_LABELS[room.difficulty]}
            </span>
          )}
          {(room.learningPreferences ?? []).map((pref) => (
            <span key={pref} className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
              {pref}
            </span>
          ))}
        </div>
        {room.additionalInstructions && (
          <p className="mt-4 text-sm italic text-muted-foreground">&ldquo;{room.additionalInstructions}&rdquo;</p>
        )}
      </div>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-foreground">Sessions</h2>
      </div>

      {sessions.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3">
          {sessions.map((session) => {
            const status = SESSION_STATUS_META[session.status]
            const isInProgress = session.status === "in_progress"
            return (
              <div key={session._id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {isInProgress ? <Bot className="size-4.5" /> : <CheckCircle2 className="size-4.5" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{formatDateTime(session.startedAt)}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="size-3 shrink-0" /> {formatDuration(session.durationSeconds)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.badgeClass}`}>{status.label}</span>
                  <Link
                    href={`/study-room/session/${session._id}`}
                    className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                  >
                    {isInProgress ? "Continue" : "View"}
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No sessions yet. Start your first session above.
        </div>
      )}

      <RenameRoomDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        userId={userId as Id<"UserTable">}
        studyRoomId={studyRoomId}
        currentTitle={room.title}
      />

      <ConfirmDialog
        open={archiveConfirmOpen}
        onOpenChange={setArchiveConfirmOpen}
        title={isArchived ? "Unarchive this study room?" : "Archive this study room?"}
        description={
          isArchived
            ? "This room will move back to your active list."
            : "This room will be hidden from your active list, but its session history is kept. You can unarchive it anytime."
        }
        confirmLabel={isArchived ? "Unarchive" : "Archive"}
        destructive={false}
        busy={busy}
        onConfirm={handleArchiveToggle}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete this study room?"
        description="This permanently deletes the room and all of its sessions. This cannot be undone."
        confirmLabel="Delete"
        destructive
        busy={busy}
        onConfirm={handleDelete}
      />
    </div>
  )
}

export default StudyRoomDetailPage
