"use client"

import React, { useContext, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import { Bot, Repeat } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import { SESSION_STATUS_META, formatDateTime, formatDuration, type RecentSessionSummary } from "./types"

function SessionRow({ session }: { session: RecentSessionSummary }) {
  const router = useRouter()
  const { userDetail } = useContext(UserDetailContext)
  const userId: Id<"UserTable"> | undefined = userDetail?._id
  // M2 - "Repeat" starts a brand-new attempt under this session's own room
  // (StartStudyRoomSession, same call "Continue"/"Repeat Lesson" use
  // everywhere else in Study Room) instead of reactivating-and-wiping this
  // exact session row in place, so this past session's transcript/summary/
  // completion timestamp is never touched.
  const startSession = useMutation(api.StudyRoom.StartStudyRoomSession)
  const [isRepeating, setIsRepeating] = useState(false)

  const status = SESSION_STATUS_META[session.status]
  const isInProgress = session.status === "in_progress"
  const isCompleted = session.status === "completed"

  async function handleRepeat() {
    if (!userId || isRepeating) return
    setIsRepeating(true)
    try {
      const { sessionId } = await startSession({ userId, studyRoomId: session.studyRoomId as Id<"studyRooms"> })
      router.push(`/study-room/session/${sessionId}`)
    } catch (e) {
      console.error(e)
      setIsRepeating(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:gap-4">
      <div className="flex items-center gap-3 sm:min-w-0 sm:flex-1">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bot className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{session.roomTitle}</p>
          <p className="truncate text-xs text-muted-foreground">
            {session.roomTopic} &middot; {formatDateTime(session.startedAt)}
            {session.durationSeconds ? ` · ${formatDuration(session.durationSeconds)}` : ""}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${status.badgeClass}`}>
          {status.label}
        </span>
        {isCompleted && (
          <button
            type="button"
            onClick={handleRepeat}
            disabled={isRepeating}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Repeat className="size-4" /> {isRepeating ? "Restarting..." : "Repeat"}
          </button>
        )}
        <Link
          href={isInProgress ? `/study-room/session/${session._id}` : `/study-room/${session.studyRoomId}`}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-muted"
        >
          {isInProgress ? "Continue" : "View Room"}
        </Link>
      </div>
    </div>
  )
}

export default SessionRow
