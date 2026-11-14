"use client"

import React from "react"
import Link from "next/link"
import { Bot } from "lucide-react"
import { SESSION_STATUS_META, formatDateTime, formatDuration, type RecentSessionSummary } from "./types"

function SessionRow({ session }: { session: RecentSessionSummary }) {
  const status = SESSION_STATUS_META[session.status]
  const isInProgress = session.status === "in_progress"

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
