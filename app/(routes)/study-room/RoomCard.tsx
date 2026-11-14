"use client"

import React from "react"
import Link from "next/link"
import { Bot, Clock, ArrowRight, Loader2 } from "lucide-react"
import { formatDateTime, type StudyRoomSummary } from "./types"

function RoomCard({
  room,
  starting,
  onContinue,
}: {
  room: StudyRoomSummary
  starting: boolean
  onContinue: () => void
}) {
  const detailsHref = `/study-room/${room._id}`

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bot className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-foreground" title={room.title}>
            {room.title}
          </h3>
          <p className="truncate text-sm text-muted-foreground" title={room.topic}>
            {room.topic}
          </p>
        </div>
        {room.hasActiveSession && (
          <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
            In Progress
          </span>
        )}
      </div>

      {room.objective && <p className="line-clamp-2 text-sm text-muted-foreground">{room.objective}</p>}

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="size-3.5 shrink-0" />
        <span>
          {room.lastAccessedAt ? `Last accessed ${formatDateTime(room.lastAccessedAt)}` : "Not started yet"}
        </span>
        <span>&middot;</span>
        <span>
          {room.totalSessions} session{room.totalSessions === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-auto flex items-center gap-2 pt-1">
        <Link
          href={detailsHref}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-muted"
        >
          Open Room
        </Link>
        <button
          type="button"
          onClick={onContinue}
          disabled={starting}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {starting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              Continue Learning <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}

export default RoomCard
