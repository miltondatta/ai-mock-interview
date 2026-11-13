"use client"

import React from "react"
import Link from "next/link"
import { GraduationCap, CalendarRange, ArrowRight } from "lucide-react"
import { STATUS_META, type StudyPlanSummary } from "./types"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function ProgressBar({ value, toneClass = "bg-primary" }: { value: number; toneClass?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full ${toneClass} transition-[width] duration-500`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

function PlanCard({ plan }: { plan: StudyPlanSummary }) {
  const status = STATUS_META[plan.status]
  const isActive = plan.status === "active"
  const isPaused = plan.status === "paused"
  const isCompleted = plan.status === "completed"
  const detailsHref = `/study-planner/${plan._id}`

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <GraduationCap className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-foreground" title={plan.title}>
            {plan.title}
          </h3>
          {plan.learningGoal && (
            <p className="truncate text-sm text-muted-foreground" title={plan.learningGoal}>
              {plan.learningGoal}
            </p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${status.badgeClass}`}>
          {status.label}
        </span>
      </div>

      {plan.description && <p className="line-clamp-2 text-sm text-muted-foreground">{plan.description}</p>}

      {(plan.startDate || plan.targetEndDate) && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarRange className="size-3.5 shrink-0" />
          <span>
            {plan.startDate ? formatDate(plan.startDate) : "No start date"}
            {" → "}
            {plan.targetEndDate ? formatDate(plan.targetEndDate) : "No target date"}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{plan.progress}% complete</span>
          <span>
            {plan.completedTasks}/{plan.totalTasks} tasks
          </span>
        </div>
        <ProgressBar value={plan.progress} toneClass={isCompleted ? "bg-success" : isPaused ? "bg-warning" : "bg-primary"} />
      </div>

      {plan.nextTask && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-foreground">
          <ArrowRight className="size-3.5 shrink-0 text-primary" />
          <span className="min-w-0 truncate">
            <span className="font-medium text-muted-foreground">Next: </span>
            {plan.nextTask.title}
          </span>
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 pt-1">
        <Link
          href={detailsHref}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-muted"
        >
          View Plan
        </Link>
        {isActive && (
          <Link
            href={detailsHref}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            Continue Learning <ArrowRight className="size-4" />
          </Link>
        )}
        {isPaused && (
          <Link
            href={detailsHref}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            Resume Plan
          </Link>
        )}
      </div>
    </div>
  )
}

export default PlanCard
