"use client"

import React, { useContext, useMemo, useState } from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { BriefcaseBusiness, LoaderCircle, Search, SearchX } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { UserDetailContext } from "@/context/UserDetailContext"
import { MATCH_THRESHOLD } from "@/convex/jobMatching"
import { JobCard } from "./_components/JobCard"
import { daysUntilDeadline } from "@/utils/jobs/format"

// Jobs page (M7): every active job posted by admins (/admin/jobs). With a
// complete profile, jobs are sorted by match score and can be filtered to
// strong matches. Otherwise they're listed newest first with no scores.
export default function JobsPage() {
  const { userDetail } = useContext(UserDetailContext)
  const data = useQuery(api.Jobs.GetJobsForUser, userDetail?._id ? { userId: userDetail._id } : "skip")
  const [search, setSearch] = useState("")
  const [matchesOnly, setMatchesOnly] = useState(false)
  const [closingSoonFirst, setClosingSoonFirst] = useState(false)

  const filtered = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    const matched = data.jobs.filter(({ job, match }) => {
      if (matchesOnly && (!match || match.score < MATCH_THRESHOLD)) return false
      if (!q) return true
      return [job.title, job.company, job.location, ...job.requiredSkills].some(f => f?.toLowerCase().includes(q))
    })
    // Pure reordering of the same relevance-ranked results - never changes
    // which jobs are shown or their match scores, per "don't let application
    // deadlines fabricate job matching."
    if (!closingSoonFirst) return matched
    return [...matched].sort((a, b) => {
      const da = daysUntilDeadline(a.job.applicationDeadline)
      const db = daysUntilDeadline(b.job.applicationDeadline)
      if (da === null && db === null) return 0
      if (da === null) return 1
      if (db === null) return -1
      return da - db
    })
  }, [data, search, matchesOnly, closingSoonFirst])

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 md:py-12">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">Jobs</p>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          {data?.personalized ? "Jobs matched to your profile" : "Job openings"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {data?.personalized
            ? "Sorted by how well each job matches your role, skills, experience, location and qualifications."
            : "The latest openings, newest first."}
        </p>
      </div>

      {data && !data.personalized && data.totalActiveJobs > 0 && (
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Want jobs matched to you?</span> Complete your professional
            profile and we&apos;ll rank these openings by how well they fit.
          </p>
          <Link href="/profile/edit" className="shrink-0 font-medium text-primary hover:text-primary/80">Set Up My Profile →</Link>
        </div>
      )}

      {!data ? (
        <div className="flex items-center justify-center p-16 text-sm text-muted-foreground">
          <LoaderCircle className="mr-2 size-4 animate-spin" /> Loading jobs…
        </div>
      ) : data.totalActiveJobs === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <BriefcaseBusiness className="size-8 text-muted-foreground" />
          <p className="mt-3 font-medium text-foreground">No job openings yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">New openings are added regularly. Check back soon.</p>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by title, company, location or skill"
                aria-label="Search jobs"
                className="h-10 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            {data.personalized && (
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={matchesOnly} onChange={e => setMatchesOnly(e.target.checked)} className="size-4 accent-primary" />
                Strong matches only
              </label>
            )}
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={closingSoonFirst} onChange={e => setClosingSoonFirst(e.target.checked)} className="size-4 accent-primary" />
              Closing soon first
            </label>
          </div>

          {filtered.length === 0 ? (
            <div className="mt-8 flex flex-col items-center px-6 py-12 text-center">
              <SearchX className="size-8 text-muted-foreground" />
              <p className="mt-3 font-medium text-foreground">No jobs match your filters</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a different search{matchesOnly ? " or show all jobs" : ""}.</p>
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-3">
              {filtered.map(item => <JobCard key={item.job._id} item={item} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
