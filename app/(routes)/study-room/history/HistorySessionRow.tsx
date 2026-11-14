"use client"

import Link from "next/link"
import { Bot, FileText } from "lucide-react"
import { SESSION_STATUS_META, formatDateTime, formatDuration, type SessionHistoryEntry } from "../types"

// M4 - unlike the Dashboard's SessionRow (which sends a completed session
// to its room's page), this links directly to the session itself for every
// status, since the session page now IS the Session Completion/history
// view (see session/[sessionId]/page.tsx).
function HistorySessionRow({ session }: { session: SessionHistoryEntry }) {
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
            {session.roomTopic}
            {session.roomCategory ? ` · ${session.roomCategory}` : ""} · {formatDateTime(session.startedAt)}
            {session.durationSeconds ? ` · ${formatDuration(session.durationSeconds)}` : ""}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        {session.summaryStatus === "ready" && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary" title="Lesson summary available">
            <FileText className="size-3.5" /> Summary
          </span>
        )}
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${status.badgeClass}`}>
          {status.label}
        </span>
        <Link
          href={`/study-room/session/${session._id}`}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-muted"
        >
          {isInProgress ? "Continue" : "View"}
        </Link>
      </div>
    </div>
  )
}

export default HistorySessionRow
