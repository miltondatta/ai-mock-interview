"use client"

import React, { useContext } from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { GraduationCap, MessagesSquare, ArrowRight, CheckCircle2 } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Doc } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"

// Dashboard Part 4 - Learning Activity + Interview Activity, side by side.
// Every field below comes straight from an existing Convex query; nothing
// is invented. See DASHBOARD_IMPLEMENTATION_PROGRESS.md for exact sources
// and the one documented gap (interview completion has no timestamp).

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

function CardShell({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">{children}</div>
}

function EmptyAction({ icon: Icon, text, action, href }: { icon: React.ElementType; text: string; action: string; href: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-4 text-center">
      <Icon className="size-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{text}</p>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {action} <ArrowRight className="size-4" />
      </Link>
    </div>
  )
}

function LearningActivityCard() {
  const { userDetail } = useContext(UserDetailContext)
  const userId = userDetail?._id
  const studyPlans = useQuery(api.StudyPlanner.GetUserStudyPlans, userId ? { userId } : "skip")

  if (studyPlans === undefined) {
    return (
      <CardShell>
        <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
      </CardShell>
    )
  }

  // Never a completed/paused/archived plan - only "active" counts as an
  // actual ongoing learning session, and only when it still has a pending
  // task to show as "next".
  const activePlan = studyPlans.find((p) => p.status === "active" && p.nextTask)

  return (
    <CardShell>
      <div className="flex items-center gap-2">
        <GraduationCap className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Learning Activity</h3>
      </div>

      {!activePlan ? (
        <EmptyAction
          icon={GraduationCap}
          text="No active study plan right now."
          action="Open Study Planner"
          href="/study-planner"
        />
      ) : (
        <>
          <div>
            <p className="text-base font-bold text-foreground">{activePlan.title}</p>
            {activePlan.learningGoal && <p className="mt-0.5 text-sm text-muted-foreground">{activePlan.learningGoal}</p>}
          </div>
          <div className="flex items-center gap-3">
            <ProgressBar value={activePlan.progress} />
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {activePlan.completedTasks}/{activePlan.totalTasks} tasks
            </span>
          </div>
          {activePlan.nextTask && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-foreground">
              <ArrowRight className="size-3.5 shrink-0 text-primary" />
              <span className="min-w-0 truncate">
                <span className="font-medium text-muted-foreground">Next: </span>
                {activePlan.nextTask.title}
              </span>
            </div>
          )}
          <Link
            href={activePlan.nextTask ? `/study-planner/tasks/${activePlan.nextTask.id}` : `/study-planner/${activePlan._id}`}
            className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Continue Learning <ArrowRight className="size-4" />
          </Link>
        </>
      )}
    </CardShell>
  )
}

// Minimal, read-only pull of a rating/score out of an interview's stored
// `feedback` - NOT a reuse of the full feedback parser in
// interview/[interviewId]/feedback/page.tsx (that function isn't exported),
// and it changes no interview evaluation logic. Returns null rather than
// guessing when nothing recognizable is present.
function extractInterviewRating(raw: unknown): string | null {
  if (raw == null) return null
  let data: unknown = raw
  if (typeof data === "string") {
    const text = data.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    try {
      data = JSON.parse(text)
    } catch {
      return null
    }
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const record = data as Record<string, unknown>
    const rating = record.rating ?? record.Rating ?? (record.feedback as Record<string, unknown> | undefined)?.rating
    if (rating != null && String(rating).trim()) return String(rating)
  }
  return null
}

function formatInterviewDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function InterviewActivityCard() {
  const { userDetail } = useContext(UserDetailContext)
  const userId = userDetail?._id
  const interviewList: Doc<'InterviewSessionTable'>[] | undefined = useQuery(
    api.Interview.GetUserInterviews,
    userId ? { userId } : "skip"
  )

  if (interviewList === undefined) {
    return (
      <CardShell>
        <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
      </CardShell>
    )
  }

  const latestCompleted = interviewList.find((i) => i.status === "completed")
  const rating = latestCompleted ? extractInterviewRating(latestCompleted.feedback) : null

  return (
    <CardShell>
      <div className="flex items-center gap-2">
        <MessagesSquare className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Interview Activity</h3>
      </div>

      {!latestCompleted ? (
        <EmptyAction
          icon={MessagesSquare}
          text="No completed interviews yet."
          action="Start Mock Interview"
          href="/create-interview"
        />
      ) : (
        <>
          <div>
            <p className="text-base font-bold text-foreground">{latestCompleted.jobTitle || "Resume-based Interview"}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{formatInterviewDate(latestCompleted._creationTime)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
              <CheckCircle2 className="size-3" /> Completed
            </span>
            {rating && <span className="text-sm font-semibold text-primary">{rating}</span>}
          </div>
          <Link
            href={`/interview/${latestCompleted._id}/feedback`}
            className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            View Results <ArrowRight className="size-4" />
          </Link>
        </>
      )}
    </CardShell>
  )
}

export default function ActivitySections() {
  return (
    <section className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
      <LearningActivityCard />
      <InterviewActivityCard />
    </section>
  )
}
