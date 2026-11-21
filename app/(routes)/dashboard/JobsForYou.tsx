"use client"

import React, { useContext } from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { BriefcaseBusiness, ChevronRight } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { UserDetailContext } from "@/context/UserDetailContext"
import { JobCard, type JobItem } from "@/app/(routes)/jobs/_components/JobCard"
import { formatLastRefreshed } from "@/utils/jobs/format"

// Explicit shape for `data` below, pinned regardless of whatever
// candidateData/liveData actually infer to. This is a deliberate, direct
// fix (not just style) - see PERSONALIZED_JOB_DISCOVERY_IMPLEMENTATION_PROGRESS.md's
// "recurring implicitly-any build errors" entries: letting `data`'s type be
// inferred purely from the candidateData/liveData ternary turned out not to
// reliably produce a concrete array element type for later `.map()` calls,
// even after removing the circular import between convex/ProfessionalProfile.ts
// and convex/jobDiscovery.ts that caused the same symptom elsewhere. Pinning
// the type here removes any dependency on how that inference chain resolves.
type JobsViewData = { personalized: boolean; totalActiveJobs: number; jobs: JobItem[] }

const DASHBOARD_LIMIT = 3

// Dashboard "Jobs for you" (M7, read path updated in D5). Data comes from
// Convex - either persisted recommendations (convex/jobDiscovery.ts's
// GetCandidateMatches, kept fresh by D3's profile-save trigger and D4's
// daily cron) when available, or the original live-scored GetJobsForUser
// otherwise - see candidateData/liveData below. Both are reactive, so a
// profile edit or a job becoming inactive still refreshes this section
// automatically either way.
//   - Profile complete: up to 3 jobs above the match threshold, with scores
//     and reasons, under "Jobs for you".
//   - Profile incomplete: the M6 invitation (ProfileSetupPrompt) is shown
//     above this section. This section is titled "Latest jobs", with no
//     scores and no claim of personalization.
//   - No jobs, or no matches: an honest empty state. Nothing is invented.
export default function JobsForYou() {
  const { userDetail } = useContext(UserDetailContext)
  // (D5) Same pattern as app/(routes)/jobs/page.tsx: both queries start
  // together so the first render's loading behavior is unchanged, but
  // GetJobsForUser's subscription is dropped (args become "skip") once
  // candidateData confirms persisted matches exist.
  const candidateData = useQuery(
    api.jobDiscovery.GetCandidateMatches,
    userDetail?._id ? { userId: userDetail._id, limit: DASHBOARD_LIMIT, matchesOnly: true } : "skip"
  )
  const needsLiveFallback = candidateData === undefined || !candidateData.hasPersistedMatches
  const liveData = useQuery(
    api.Jobs.GetJobsForUser,
    userDetail?._id && needsLiveFallback ? { userId: userDetail._id, limit: DASHBOARD_LIMIT, matchesOnly: true } : "skip"
  )
  const data: JobsViewData | undefined = candidateData?.hasPersistedMatches ? candidateData : liveData
  const freshnessLabel = candidateData?.hasPersistedMatches ? formatLastRefreshed(candidateData.lastRefreshedAt) : null

  if (!data) return null

  const personalized = data.personalized
  const title = personalized ? "Jobs for you" : "Latest jobs"

  return (
    <section aria-labelledby="jobs-for-you-title" className="mt-10 rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="jobs-for-you-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
          <BriefcaseBusiness className="size-4 text-primary" /> {title}
        </h2>
        {data.totalActiveJobs > 0 && (
          <Link href="/jobs" className="inline-flex items-center gap-0.5 text-sm font-medium text-primary hover:text-primary/80">
            See all <ChevronRight className="size-4" />
          </Link>
        )}
      </div>
      {!personalized && data.totalActiveJobs > 0 && (
        <p className="mt-1 text-sm text-muted-foreground">Complete your profile to see jobs matched to your skills and experience.</p>
      )}
      {/* (D5) Only shown while actually displaying persisted recommendations,
          never during the live GetJobsForUser fallback. Always a real
          Convex timestamp, never hardcoded. */}
      {freshnessLabel && <p className="mt-1 text-xs text-muted-foreground">{freshnessLabel}</p>}

      {data.totalActiveJobs === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No job openings have been posted yet. Check back soon.
        </p>
      ) : data.jobs.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No strong matches right now</p>
          <p className="mt-1">
            Adding more skills to your <Link href="/profile/edit" className="text-primary hover:text-primary/80">profile</Link> can
            improve matches, or <Link href="/jobs" className="text-primary hover:text-primary/80">browse all {data.totalActiveJobs} openings</Link>.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {data.jobs.map(item => <JobCard key={item.job._id} item={item} compact />)}
        </div>
      )}
    </section>
  )
}
