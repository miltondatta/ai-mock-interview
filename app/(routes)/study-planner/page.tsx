"use client"

import React, { useContext, useMemo, useState } from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { Plus, ListChecks, Sparkles, CheckCircle2, TrendingUp, GraduationCap, CalendarDays } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import PlanCard from "./PlanCard"
import type { DashboardStats, PlanStatus, StudyPlanSummary } from "./types"

type FilterValue = "all" | PlanStatus

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All Plans" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "paused", label: "Paused" },
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

function EmptyState() {
  return (
    <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/40 px-10 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <GraduationCap className="size-7" />
      </div>
      <h3 className="text-base font-semibold text-foreground">No study plans yet</h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        The Study Planner helps you organize any learning goal into a schedule you can follow - a new
        skill, a certification, or interview preparation. Create your first plan to get started.
      </p>
      <Link
        href="/study-planner/create"
        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
      >
        <Plus className="size-4" /> Create Study Plan
      </Link>
    </div>
  )
}

function StudyPlannerPage() {
  const { userDetail } = useContext(UserDetailContext)
  const userId: Id<"UserTable"> | undefined = userDetail?._id
  const [filter, setFilter] = useState<FilterValue>("all")

  const plans = useQuery(
    api.StudyPlanner.GetUserStudyPlans,
    userId ? { userId } : "skip"
  ) as StudyPlanSummary[] | undefined

  const stats = useQuery(
    api.StudyPlanner.GetDashboardStats,
    userId ? { userId } : "skip"
  ) as DashboardStats | undefined

  const counts = useMemo(() => {
    const base: Record<FilterValue, number> = {
      all: plans?.length ?? 0,
      active: stats?.activePlans ?? 0,
      completed: stats?.completedPlans ?? 0,
      paused: stats?.pausedPlans ?? 0,
      archived: stats?.archivedPlans ?? 0,
    }
    return base
  }, [plans, stats])

  const visiblePlans = useMemo(() => {
    if (!plans) return []
    return filter === "all" ? plans : plans.filter((p) => p.status === filter)
  }, [plans, filter])

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground sm:text-3xl">Study Planner</h1>
          <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">
            Plan your learning journey, organize your study schedule and track your progress.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <Link
            href="/study-planner/schedule"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            <CalendarDays className="size-4" /> Schedule
          </Link>
          <Link
            href="/study-planner/create"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            <Plus className="size-4" /> Create Study Plan
          </Link>
        </div>
      </div>

      {plans && stats && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
            <StatCard icon={ListChecks} label="Total Study Plans" value={String(stats.totalPlans)} tone="primary" />
            <StatCard icon={Sparkles} label="Active Plans" value={String(stats.activePlans)} tone="success" />
            <StatCard icon={CheckCircle2} label="Completed Plans" value={String(stats.completedPlans)} tone="muted" />
            <StatCard
              icon={TrendingUp}
              label="Overall Learning Progress"
              value={`${stats.overallProgress}%`}
              tone="warning"
            />
          </div>

          {plans.length > 0 && (
            <>
              <div className="mt-10 flex items-center justify-between">
                <h2 className="text-xl font-bold tracking-tight text-foreground">Your Study Plans</h2>
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

              {visiblePlans.length > 0 ? (
                <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
                  {visiblePlans.map((plan) => (
                    <PlanCard key={plan._id} plan={plan} />
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
                  No plans in this filter yet.
                </div>
              )}
            </>
          )}

          {plans.length === 0 && <EmptyState />}
        </>
      )}
    </div>
  )
}

export default StudyPlannerPage
