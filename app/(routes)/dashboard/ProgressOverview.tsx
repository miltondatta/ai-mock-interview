"use client"

import React, { useContext } from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { MessagesSquare, GraduationCap, FileCheck, BriefcaseBusiness } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Doc } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import { formatLastRefreshed } from "@/utils/jobs/format"

// Dashboard Part 1 - Career Progress Overview (4 KPI cards). Every value
// below is read from an existing Convex query; nothing here is invented or
// hardcoded. See DASHBOARD_IMPLEMENTATION_PROGRESS.md for the exact source
// of each metric and the one documented data gap (Resume Readiness).
const JOB_MATCH_COUNT_LIMIT = 300 // same cap GetCandidateMatches/GetJobsForUser already enforce server-side

interface KpiCardProps {
  icon: React.ElementType
  label: string
  value: string | null
  href: string
  progress?: number | null
  sub?: string | null
  loading: boolean
}

function KpiCard({ icon: Icon, label, value, href, progress, sub, loading }: KpiCardProps) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight text-foreground">
          {loading ? <span className="inline-block h-7 w-12 animate-pulse rounded bg-muted align-middle" /> : value ?? "0"}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
      </div>
      {!loading && progress != null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
      {!loading && sub && <p className="text-xs font-medium text-muted-foreground">{sub}</p>}
    </Link>
  )
}

export default function ProgressOverview() {
  const { userDetail } = useContext(UserDetailContext)
  const userId = userDetail?._id

  const interviewList: Doc<'InterviewSessionTable'>[] | undefined = useQuery(
    api.Interview.GetUserInterviews,
    userId ? { userId } : "skip"
  )
  const studyStats = useQuery(api.StudyPlanner.GetDashboardStats, userId ? { userId } : "skip")
  const onboarding = useQuery(api.ProfessionalProfile.GetOnboardingStatus, userId ? { userId } : "skip")
  const resumes = useQuery(api.Resumes.GetUserResumes, userId ? { userId } : "skip")

  // Same persisted-matches-first, live-fallback pattern already used by
  // JobsForYou.tsx - reused here (not duplicated as new backend logic) to
  // get an accurate total match count rather than the display-limited
  // slice JobsForYou itself renders.
  const candidateMatches = useQuery(
    api.jobDiscovery.GetCandidateMatches,
    userId ? { userId, limit: JOB_MATCH_COUNT_LIMIT, matchesOnly: true } : "skip"
  )
  const needsLiveJobsFallback = candidateMatches === undefined || !candidateMatches.hasPersistedMatches
  const liveJobs = useQuery(
    api.Jobs.GetJobsForUser,
    userId && needsLiveJobsFallback ? { userId, limit: JOB_MATCH_COUNT_LIMIT, matchesOnly: true } : "skip"
  )
  const jobsData = candidateMatches?.hasPersistedMatches ? candidateMatches : liveJobs
  const lastRefreshedLabel = candidateMatches?.hasPersistedMatches
    ? formatLastRefreshed(candidateMatches.lastRefreshedAt)
    : null

  // Interview Practice
  const completedInterviews = interviewList?.filter((i) => i.status === "completed").length ?? 0
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const interviewsThisWeek = interviewList?.filter((i) => i._creationTime >= oneWeekAgo).length ?? 0

  // Resume Readiness - no resume-specific completeness score exists in the
  // data model, so this uses professional-profile completeness (the same
  // metric ProfileSetupPrompt and job matching already rely on) as the
  // closest real signal. Documented as a data gap in the progress file.
  const profilePercent = onboarding?.profileCompletionPercent ?? null
  const hasResume = (resumes?.length ?? 0) > 0

  return (
    <section className="mt-8">
      <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
        <KpiCard
          icon={MessagesSquare}
          label="Completed Interviews"
          value={String(completedInterviews)}
          sub={interviewsThisWeek > 0 ? `+${interviewsThisWeek} this week` : null}
          href="/mock-interview/history"
          loading={interviewList === undefined}
        />
        <KpiCard
          icon={GraduationCap}
          label="Study Plan Progress"
          value={studyStats ? `${studyStats.overallProgress}%` : null}
          progress={studyStats ? studyStats.overallProgress : null}
          sub={studyStats && studyStats.totalPlans === 0 ? "No study plans yet" : null}
          href="/study-planner"
          loading={studyStats === undefined}
        />
        <KpiCard
          icon={FileCheck}
          label="Resume Readiness"
          value={profilePercent != null ? `${profilePercent}%` : null}
          progress={profilePercent}
          sub={!hasResume ? "Upload a resume to get started" : null}
          href="/manage-resume"
          loading={onboarding === undefined || resumes === undefined}
        />
        <KpiCard
          icon={BriefcaseBusiness}
          label="New Job Matches"
          value={jobsData ? String(jobsData.jobs.length) : null}
          sub={jobsData && jobsData.jobs.length === 0 ? "No matches yet" : lastRefreshedLabel}
          href="/jobs"
          loading={jobsData === undefined}
        />
      </div>
    </section>
  )
}
