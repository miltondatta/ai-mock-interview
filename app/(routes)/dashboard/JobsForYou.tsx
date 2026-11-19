"use client"

import React, { useContext } from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { BriefcaseBusiness, ChevronRight } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { UserDetailContext } from "@/context/UserDetailContext"
import { JobCard } from "@/app/(routes)/jobs/_components/JobCard"

const DASHBOARD_LIMIT = 3

// Dashboard "Jobs for you" (M7). Data comes from Convex GetJobsForUser, which
// is reactive and cached server-side. It recomputes only when the jobs or the
// user's profile change, so a profile edit refreshes it automatically.
//   - Profile complete: up to 3 jobs above the match threshold, with scores
//     and reasons, under "Jobs for you".
//   - Profile incomplete: the M6 invitation (ProfileSetupPrompt) is shown
//     above this section. This section is titled "Latest jobs", with no
//     scores and no claim of personalization.
//   - No jobs, or no matches: an honest empty state. Nothing is invented.
export default function JobsForYou() {
  const { userDetail } = useContext(UserDetailContext)
  const data = useQuery(
    api.Jobs.GetJobsForUser,
    userDetail?._id ? { userId: userDetail._id, limit: DASHBOARD_LIMIT, matchesOnly: true } : "skip"
  )

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
