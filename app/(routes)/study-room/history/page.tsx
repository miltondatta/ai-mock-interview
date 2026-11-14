"use client"

import React, { useContext, useMemo, useState } from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { ArrowLeft, Search } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import HistorySessionRow from "./HistorySessionRow"
import type { SessionHistoryEntry, SessionStatus } from "../types"

type StatusFilter = "all" | SessionStatus
type DateFilter = "all" | "7d" | "30d"

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "abandoned", label: "Abandoned" },
]

const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
]

// M4 - full Study Room session history: every session across every room,
// searchable by topic/title and filterable by status/date. Everything is
// loaded once via GetSessionHistory and filtered client-side, the same
// convention the Dashboard's own All/Active/Archived room filter already
// uses - this app has never paginated these small, per-user lists.
function StudyRoomHistoryPage() {
  const { userDetail } = useContext(UserDetailContext)
  const userId: Id<"UserTable"> | undefined = userDetail?._id

  const sessions = useQuery(api.StudyRoom.GetSessionHistory, userId ? { userId } : "skip") as
    | SessionHistoryEntry[]
    | undefined

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [dateFilter, setDateFilter] = useState<DateFilter>("all")

  const filtered = useMemo(() => {
    if (!sessions) return []
    const query = search.trim().toLowerCase()
    const now = Date.now()
    const cutoff = dateFilter === "7d" ? now - 7 * 86_400_000 : dateFilter === "30d" ? now - 30 * 86_400_000 : 0

    return sessions.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false
      if (cutoff && s.startedAt < cutoff) return false
      if (query) {
        const haystack = `${s.roomTitle} ${s.roomTopic} ${s.roomCategory ?? ""}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [sessions, search, statusFilter, dateFilter])

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 md:px-10 md:py-14">
      <Link
        href="/study-room"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to AI Study Room
      </Link>

      <h1 className="mt-4 text-[26px] font-bold tracking-tight text-foreground sm:text-3xl">Session History</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Every learning session across all your Study Rooms, searchable and filterable.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by topic or room title..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
          />
        </div>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as DateFilter)}
          className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground outline-none focus:border-primary"
        >
          {DATE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {STATUS_FILTERS.map((f) => {
          const isActive = statusFilter === f.value
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={`inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-transparent bg-muted text-muted-foreground hover:border-primary/30"
              }`}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {sessions === undefined && (
        <div className="mt-8 flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-2xl border border-border bg-muted/40" />
          ))}
        </div>
      )}

      {sessions !== undefined && sessions.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          You haven't started any sessions yet.
        </div>
      )}

      {sessions !== undefined && sessions.length > 0 && filtered.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          No sessions match your search/filters.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          {filtered.map((session) => (
            <HistorySessionRow key={session._id} session={session} />
          ))}
        </div>
      )}
    </div>
  )
}

export default StudyRoomHistoryPage
