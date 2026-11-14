"use client"

import React, { useContext, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { Plus, LayoutGrid, Radio, CheckCircle2, TrendingUp, Bot, Clock, History } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import RoomCard from "./RoomCard"
import SessionRow from "./SessionRow"
import type { DashboardStats, RecentSessionSummary, RoomStatus, StudyRoomSummary } from "./types"
import { formatDuration } from "./types"

type FilterValue = "all" | RoomStatus

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All Rooms" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
]

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType
  label: string
  value: string
  tone: "primary" | "success" | "warning" | "muted"
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    muted: "bg-muted text-muted-foreground",
  }[tone]

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className={`flex size-10 items-center justify-center rounded-lg ${toneClass}`}>
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function StatCardsSkeleton() {
  return (
    <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-[104px] animate-pulse rounded-2xl border border-border bg-muted/40" />
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/40 px-10 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Bot className="size-7" />
      </div>
      <h3 className="text-base font-semibold text-foreground">Welcome to your AI Study Room</h3>
      <p className="max-w-lg text-sm text-muted-foreground">
        Your AI tutor teaches any technical or non-technical topic through natural voice conversations, paired
        with an interactive whiteboard, live code practice and notes that write themselves - all tailored to
        your pace and goals.
      </p>
      <Link
        href="/study-room/create"
        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
      >
        <Plus className="size-4" /> Create Your First Study Room
      </Link>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-destructive/30 bg-destructive/5 px-10 py-14 text-center">
      <p className="text-sm font-semibold text-destructive">Something went wrong loading your Study Rooms.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
      >
        Try again
      </button>
    </div>
  )
}

function StudyRoomDashboardPage() {
  const router = useRouter()
  const { userDetail } = useContext(UserDetailContext)
  const userId: Id<"UserTable"> | undefined = userDetail?._id
  const [filter, setFilter] = useState<FilterValue>("all")
  const [startingRoomId, setStartingRoomId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  const rooms = useQuery(
    api.StudyRoom.GetUserStudyRooms,
    userId ? { userId } : "skip"
  ) as StudyRoomSummary[] | undefined

  const stats = useQuery(
    api.StudyRoom.GetDashboardStats,
    userId ? { userId } : "skip"
  ) as DashboardStats | undefined

  const recentSessions = useQuery(
    api.StudyRoom.GetRecentSessions,
    userId ? { userId, limit: 8 } : "skip"
  ) as RecentSessionSummary[] | undefined

  const startSession = useMutation(api.StudyRoom.StartStudyRoomSession)

  const counts = useMemo(() => {
    const base: Record<FilterValue, number> = {
      all: rooms?.length ?? 0,
      active: 0,
      archived: 0,
    }
    for (const room of rooms ?? []) base[room.status] += 1
    return base
  }, [rooms])

  const visibleRooms = useMemo(() => {
    if (!rooms) return []
    return filter === "all" ? rooms : rooms.filter((r) => r.status === filter)
  }, [rooms, filter])

  async function handleContinueLearning(studyRoomId: string) {
    if (!userId || startingRoomId) return
    setStartingRoomId(studyRoomId)
    try {
      const result = await startSession({ userId, studyRoomId: studyRoomId as Id<"studyRooms"> })
      router.push(`/study-room/session/${result.sessionId}`)
    } catch {
      setLoadError(true)
      setStartingRoomId(null)
    }
  }

  const isLoading = userId !== undefined && (rooms === undefined || stats === undefined)

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground sm:text-3xl">AI Study Room</h1>
          <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">
            Learn any topic with a voice-first AI tutor - whiteboard, code practice and notes, all in one
            adaptive session.
          </p>
        </div>
        <Link
          href="/study-room/create"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" /> Create Study Room
        </Link>
      </div>

      {loadError && <ErrorState onRetry={() => setLoadError(false)} />}

      {!loadError && isLoading && <StatCardsSkeleton />}

      {!loadError && rooms && stats && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-5">
            <StatCard icon={LayoutGrid} label="Total Study Rooms" value={String(stats.totalRooms)} tone="primary" />
            <StatCard icon={Radio} label="Active Sessions" value={String(stats.activeSessions)} tone="success" />
            <StatCard icon={CheckCircle2} label="Completed Sessions" value={String(stats.completedSessions)} tone="muted" />
            <StatCard
              icon={TrendingUp}
              label="Recent Learning Activity"
              value={`${stats.sessionsThisWeek} session${stats.sessionsThisWeek === 1 ? "" : "s"}`}
              tone="warning"
            />
            <StatCard icon={Clock} label="Total Learning Time" value={formatDuration(stats.totalLearningSeconds)} tone="primary" />
          </div>

          {stats.recentTopics.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Recently studied:</span>
              {stats.recentTopics.map((topic) => (
                <span key={topic} className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
                  {topic}
                </span>
              ))}
            </div>
          )}

          {rooms.length > 0 ? (
            <>
              <div className="mt-10 flex items-center justify-between">
                <h2 className="text-xl font-bold tracking-tight text-foreground">My Study Rooms</h2>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                {FILTERS.map((f) => {
                  const isFilterActive = filter === f.value
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFilter(f.value)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                        isFilterActive
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-transparent bg-muted text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {f.label}
                      <span className="text-xs font-semibold opacity-80">{counts[f.value]}</span>
                    </button>
                  )
                })}
              </div>

              {visibleRooms.length > 0 ? (
                <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
                  {visibleRooms.map((room) => (
                    <RoomCard
                      key={room._id}
                      room={room}
                      starting={startingRoomId === room._id}
                      onContinue={() => handleContinueLearning(room._id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
                  No rooms in this filter yet.
                </div>
              )}

              {recentSessions && recentSessions.length > 0 && (
                <>
                  <div className="mt-10 flex items-center justify-between">
                    <h2 className="text-xl font-bold tracking-tight text-foreground">Recent Sessions</h2>
                    <Link
                      href="/study-room/history"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                    >
                      <History className="size-4" /> View All Sessions
                    </Link>
                  </div>
                  <div className="mt-4 flex flex-col gap-3">
                    {recentSessions.map((session) => (
                      <SessionRow key={session._id} session={session} />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <EmptyState />
          )}
        </>
      )}
    </div>
  )
}

export default StudyRoomDashboardPage
