"use client"

import React, { useContext } from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { ArrowRight, MessagesSquare, Bot, GraduationCap, CircleUserRound } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Doc } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"

// Dashboard Part 2 - "Continue Your Journey". Picks ONE recommendation from
// real session/record state (never fabricated) using a fixed priority
// order documented in DASHBOARD_IMPLEMENTATION_PROGRESS.md:
//   1. An interview actually mid-session (status "in_progress")
//   2. A drafted interview not yet started (status "draft")
//   3. A Study Room session still open (status "in_progress")
//   4. An active Study Plan with a pending task
//   5. An incomplete professional profile
//   6. Getting-started fallback
interface Journey {
  kicker: string
  title: string
  description: string
  icon: React.ElementType
  progress?: number
  progressLabel?: string
  action: string
  href: string
}

function JourneyCard({ item }: { item: Journey }) {
  const Icon = item.icon
  return (
    <div className="mt-4 flex flex-col gap-5 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-card p-6 sm:flex-row sm:items-center">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Icon className="size-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{item.kicker}</p>
        <h3 className="mt-1 text-lg font-bold text-foreground">{item.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
        {item.progress != null && (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }} />
            </div>
            {item.progressLabel && <span className="shrink-0 text-xs font-medium text-muted-foreground">{item.progressLabel}</span>}
          </div>
        )}
      </div>
      <Link
        href={item.href}
        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {item.action} <ArrowRight className="size-4" />
      </Link>
    </div>
  )
}

function LoadingCard() {
  return (
    <div className="mt-4 h-[124px] animate-pulse rounded-2xl border border-border bg-muted/40" />
  )
}

export default function ContinueJourney() {
  const { userDetail } = useContext(UserDetailContext)
  const userId = userDetail?._id

  const interviewList: Doc<'InterviewSessionTable'>[] | undefined = useQuery(
    api.Interview.GetUserInterviews,
    userId ? { userId } : "skip"
  )
  const studyRoomSessions = useQuery(
    api.StudyRoom.GetRecentSessions,
    userId ? { userId, limit: 5 } : "skip"
  )
  const studyPlans = useQuery(api.StudyPlanner.GetUserStudyPlans, userId ? { userId } : "skip")
  const onboarding = useQuery(api.ProfessionalProfile.GetOnboardingStatus, userId ? { userId } : "skip")

  const loading =
    interviewList === undefined ||
    studyRoomSessions === undefined ||
    studyPlans === undefined ||
    onboarding === undefined

  if (loading) {
    return (
      <section className="mt-10">
        <h2 className="text-xl font-bold tracking-tight text-foreground">Continue Your Journey</h2>
        <LoadingCard />
      </section>
    )
  }

  let item: Journey | null = null

  const inProgressInterview = interviewList!.find((i) => i.status === "in_progress")
  const draftInterview = interviewList!.find((i) => i.status === "draft")

  if (inProgressInterview) {
    item = {
      kicker: "Mock Interview In Progress",
      title: inProgressInterview.jobTitle || "Resume-based Interview",
      description: "You're part-way through this interview. Rejoin the live session to finish it.",
      icon: MessagesSquare,
      action: "Resume Interview",
      href: `/interview/${inProgressInterview._id}/start`,
    }
  } else if (draftInterview) {
    item = {
      kicker: "Unfinished Mock Interview",
      title: draftInterview.jobTitle || "Resume-based Interview",
      description: draftInterview.qno
        ? `Your ${draftInterview.qno}-question interview is ready whenever you are.`
        : "Your interview questions are ready whenever you are.",
      icon: MessagesSquare,
      action: "Resume Interview",
      href: `/interview/${draftInterview._id}/start`,
    }
  } else {
    const openStudyRoomSession = studyRoomSessions!.find((s) => s.status === "in_progress")
    const activeStudyPlan = studyPlans!.find((p) => p.status === "active" && p.nextTask)

    if (openStudyRoomSession) {
      item = {
        kicker: "AI Study Room Session Open",
        title: openStudyRoomSession.roomTitle,
        description: openStudyRoomSession.roomTopic || "Your tutor session is still open - jump back in.",
        icon: Bot,
        action: "Enter Study Room",
        href: `/study-room/session/${openStudyRoomSession._id}`,
      }
    } else if (activeStudyPlan) {
      item = {
        kicker: "Study Plan In Progress",
        title: activeStudyPlan.title,
        description: activeStudyPlan.nextTask
          ? `Next up: ${activeStudyPlan.nextTask.title}`
          : "Continue working through this plan.",
        icon: GraduationCap,
        progress: activeStudyPlan.progress,
        progressLabel: `${activeStudyPlan.completedTasks}/${activeStudyPlan.totalTasks} tasks`,
        action: "Continue Learning",
        href: `/study-planner/${activeStudyPlan._id}`,
      }
    } else if (!onboarding!.isProfileComplete) {
      item = {
        kicker: "Profile Incomplete",
        title: "Finish setting up your professional profile",
        description: "A complete profile unlocks personalized job matches and better interview questions.",
        icon: CircleUserRound,
        progress: onboarding!.profileCompletionPercent,
        progressLabel: `${onboarding!.profileCompletionPercent}% complete`,
        action: "Complete Profile",
        href: "/profile/edit",
      }
    } else if (interviewList!.length === 0) {
      item = {
        kicker: "Get Started",
        title: "Take your first mock interview",
        description: "Upload a resume or paste a job description to generate your first set of interview questions.",
        icon: MessagesSquare,
        action: "Start Mock Interview",
        href: "/create-interview",
      }
    } else {
      item = {
        kicker: "Keep Going",
        title: "Ready for another round?",
        description: "Start a new mock interview to keep your interview skills sharp.",
        icon: MessagesSquare,
        action: "Start Mock Interview",
        href: "/create-interview",
      }
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold tracking-tight text-foreground">Continue Your Journey</h2>
      <JourneyCard item={item} />
    </section>
  )
}
