"use client"

import React, { useContext } from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { MessagesSquare, FileSearch, GraduationCap, CheckCircle2, FolderOpen } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Doc } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"

const RECENT_ACTIVITY_LIMIT = 5

type ActivityIcon = "interview" | "resumeAnalysis" | "studyPlan" | "studyTask" | "resume"

interface ActivityEntry {
  id: string
  icon: ActivityIcon
  text: string
  timestamp: number
  href?: string
}

const ICONS: Record<ActivityIcon, React.ElementType> = {
  interview: MessagesSquare,
  resumeAnalysis: FileSearch,
  studyPlan: GraduationCap,
  studyTask: CheckCircle2,
  resume: FolderOpen,
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < minute) return "Just now"
  if (diffMs < hour) return `${Math.max(1, Math.round(diffMs / minute))}m ago`
  if (diffMs < day) return `${Math.round(diffMs / hour)}h ago`
  if (diffMs < 30 * day) return `${Math.round(diffMs / day)}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

// Dashboard Part 4 - Recent Activity. The application has no dedicated
// activity/event-tracking table, so - per the prompt's own instruction to
// "determine whether the required information can be derived safely from
// existing records" instead of building one - this merges real, already
//-recorded events from five existing queries, sorts them by their own
// real timestamp, and shows the most recent few. Nothing here is a
// fabricated record; an event that can't be sourced is left out entirely
// (see DASHBOARD_IMPLEMENTATION_PROGRESS.md for the one documented gap:
// interview *completion* has no timestamp field, so interview entries use
// their real *creation* time/event instead of pretending to know when the
// interview finished).
export default function RecentActivity() {
  const { userDetail } = useContext(UserDetailContext)
  const userId = userDetail?._id

  const interviewList: Doc<'InterviewSessionTable'>[] | undefined = useQuery(
    api.Interview.GetUserInterviews,
    userId ? { userId } : "skip"
  )
  const resumeAnalyses = useQuery(api.ResumeMatch.GetUserResumeMatchAnalyses, userId ? { userId } : "skip")
  const studyPlans = useQuery(api.StudyPlanner.GetUserStudyPlans, userId ? { userId } : "skip")
  const completedTasks = useQuery(
    api.StudyPlanner.GetRecentCompletedTasks,
    userId ? { userId, limit: RECENT_ACTIVITY_LIMIT } : "skip"
  )
  const resumes = useQuery(api.Resumes.GetUserResumes, userId ? { userId } : "skip")

  const loading =
    interviewList === undefined ||
    resumeAnalyses === undefined ||
    studyPlans === undefined ||
    completedTasks === undefined ||
    resumes === undefined

  if (loading) {
    return (
      <section className="mt-10">
        <h2 className="text-xl font-bold tracking-tight text-foreground">Recent Activity</h2>
        <div className="mt-4 h-40 animate-pulse rounded-2xl border border-border bg-muted/40" />
      </section>
    )
  }

  const entries: ActivityEntry[] = [
    ...interviewList!.map((i) => ({
      id: `interview-${i._id}`,
      icon: "interview" as const,
      text: `Started a mock interview: ${i.jobTitle || "Resume-based Interview"}`,
      timestamp: i._creationTime,
      href: `/interview/${i._id}/start`,
    })),
    ...resumeAnalyses!.map((a) => ({
      id: `resume-analysis-${a._id}`,
      icon: "resumeAnalysis" as const,
      text: `Resume analysis completed: ${a.jobTitle}`,
      timestamp: a.createdAt,
      href: `/resume-match-analyzer?analysisId=${a._id}`,
    })),
    ...studyPlans!.map((p) => ({
      id: `study-plan-${p._id}`,
      icon: "studyPlan" as const,
      text: `New study plan created: ${p.title}`,
      timestamp: p.createdAt,
      href: `/study-planner/${p._id}`,
    })),
    ...completedTasks!.map((t) => ({
      id: `study-task-${t._id}`,
      icon: "studyTask" as const,
      text: `Completed study topic: ${t.title} (${t.planTitle})`,
      timestamp: t.completedAt,
      href: `/study-planner/tasks/${t._id}`,
    })),
    ...resumes!.map((r) => ({
      id: `resume-${r.id}`,
      icon: "resume" as const,
      text: `Resume uploaded: ${r.fileName}`,
      timestamp: r.uploadedAt,
      href: "/manage-resume",
    })),
  ]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, RECENT_ACTIVITY_LIMIT)

  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold tracking-tight text-foreground">Recent Activity</h2>
      {entries.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/40 px-10 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing here yet - your interviews, study plans and resume activity will show up as you go.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
          {entries.map((entry) => {
            const Icon = ICONS[entry.icon]
            const row = (
              <>
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </div>
                <p className="min-w-0 flex-1 truncate text-sm text-foreground">{entry.text}</p>
                <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(entry.timestamp)}</span>
              </>
            )
            return entry.href ? (
              <Link
                key={entry.id}
                href={entry.href}
                className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                {row}
              </Link>
            ) : (
              <div key={entry.id} className="flex items-center gap-3 px-5 py-3.5">
                {row}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
