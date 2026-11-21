"use client"

import React, { useContext, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { BriefcaseBusiness, LoaderCircle, Search, SearchX } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { UserDetailContext } from "@/context/UserDetailContext"
import { MATCH_THRESHOLD } from "@/convex/jobMatching"
import { cn } from "@/lib/utils"
import { Pagination } from "@/components/ui/pagination"
import { JobCard } from "./_components/JobCard"
import {
  daysUntilDeadline,
  EXPERIENCE_LEVELS,
  formatLastRefreshed,
  jobExperienceLevelIds,
  WORK_MODE_FILTER_OPTIONS,
  WORK_MODE_LABELS,
  type WorkMode,
} from "@/utils/jobs/format"

const filterChipClass = (active: boolean) =>
  cn(
    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
    active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
  )

const PAGE_SIZE = 10

// Jobs page (M7): every active job posted by admins (/admin/jobs). With a
// complete profile, jobs are sorted by match score and can be filtered to
// strong matches. Otherwise they're listed newest first with no scores.
export default function JobsPage() {
  const { userDetail } = useContext(UserDetailContext)
  // (D5) Read persisted recommendations first (convex/jobDiscovery.ts's
  // GetCandidateMatches - same output shape as GetJobsForUser, so nothing
  // below this point needs to know which one actually supplied `data`).
  // GetJobsForUser is still subscribed in parallel from the start (so the
  // very first render's loading state is unchanged from before D5), but
  // once candidateData confirms it has persisted matches, its own args
  // evaluate to "skip" on the next render and Convex drops that
  // subscription - this candidate no longer pays for GetJobsForUser's live
  // recomputation once persisted data is actually available, which is the
  // whole point of the D2-D4 pipeline this page is now wired into.
  const candidateData = useQuery(api.jobDiscovery.GetCandidateMatches, userDetail?._id ? { userId: userDetail._id } : "skip")
  const needsLiveFallback = candidateData === undefined || !candidateData.hasPersistedMatches
  const liveData = useQuery(api.Jobs.GetJobsForUser, userDetail?._id && needsLiveFallback ? { userId: userDetail._id } : "skip")
  const data = candidateData?.hasPersistedMatches ? candidateData : liveData
  const freshnessLabel = candidateData?.hasPersistedMatches ? formatLastRefreshed(candidateData.lastRefreshedAt) : null
  const [search, setSearch] = useState("")
  const [matchesOnly, setMatchesOnly] = useState(false)
  const [closingSoonFirst, setClosingSoonFirst] = useState(false)
  // J8: work-mode and experience-level filters. Empty set = no filter
  // active (show everything, including jobs with no reliable value for
  // that field) - each is independent of the others and of search/sort, so
  // clearing or changing one never resets another.
  const [workModeFilter, setWorkModeFilter] = useState<ReadonlySet<WorkMode>>(new Set())
  const [experienceFilter, setExperienceFilter] = useState<ReadonlySet<string>>(new Set())

  const toggleWorkMode = (wm: WorkMode) =>
    setWorkModeFilter(prev => {
      const next = new Set(prev)
      if (next.has(wm)) next.delete(wm)
      else next.add(wm)
      return next
    })
  const toggleExperienceLevel = (id: string) =>
    setExperienceFilter(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const hasExtraFilters = workModeFilter.size > 0 || experienceFilter.size > 0

  const filtered = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    const matched = data.jobs.filter(({ job, match }) => {
      if (matchesOnly && (!match || match.score < MATCH_THRESHOLD)) return false
      // A job with no reliable workMode/experience data is excluded while
      // that filter is active, never guessed into a bucket it wasn't
      // confirmed to belong to - see utils/jobs/format.ts.
      if (workModeFilter.size > 0 && (!job.workMode || !workModeFilter.has(job.workMode))) return false
      if (experienceFilter.size > 0) {
        const levels = jobExperienceLevelIds(job)
        if (levels.length === 0 || !levels.some(l => experienceFilter.has(l))) return false
      }
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
  }, [data, search, matchesOnly, closingSoonFirst, workModeFilter, experienceFilter])

  // Pagination: a user-driven change to search/sort/filters always jumps
  // back to page 1 (otherwise they could land on a now-empty page); a
  // background data change alone does not force a jump, but `currentPage`
  // still clamps defensively so an out-of-range page never renders empty.
  const [page, setPage] = useState(1)
  useEffect(() => {
    setPage(1)
  }, [search, matchesOnly, closingSoonFirst, workModeFilter, experienceFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const paginatedJobs = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  )
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length)

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
        {/* (D5) Freshness indicator - only shown while actually displaying
            persisted recommendations (never during the live GetJobsForUser
            fallback, which isn't "generated" in the same sense). Always a
            real Convex timestamp (candidateJobMatches.generatedAt), never a
            hardcoded sample date. */}
        {freshnessLabel && <p className="text-xs text-muted-foreground">{freshnessLabel}</p>}
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Work mode</span>
            {WORK_MODE_FILTER_OPTIONS.map(wm => (
              <button
                key={wm}
                type="button"
                onClick={() => toggleWorkMode(wm)}
                aria-pressed={workModeFilter.has(wm)}
                className={filterChipClass(workModeFilter.has(wm))}
              >
                {WORK_MODE_LABELS[wm]}
              </button>
            ))}
            {workModeFilter.size > 0 && (
              <button type="button" onClick={() => setWorkModeFilter(new Set())} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                Clear
              </button>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Experience</span>
            {EXPERIENCE_LEVELS.map(level => (
              <button
                key={level.id}
                type="button"
                onClick={() => toggleExperienceLevel(level.id)}
                aria-pressed={experienceFilter.has(level.id)}
                className={filterChipClass(experienceFilter.has(level.id))}
              >
                {level.label}
              </button>
            ))}
            {experienceFilter.size > 0 && (
              <button type="button" onClick={() => setExperienceFilter(new Set())} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                Clear
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="mt-8 flex flex-col items-center px-6 py-12 text-center">
              <SearchX className="size-8 text-muted-foreground" />
              <p className="mt-3 font-medium text-foreground">No jobs match your filters</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a different search{matchesOnly || hasExtraFilters ? ", or clear some filters" : ""}.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-5 flex flex-col gap-3">
                {paginatedJobs.map(item => <JobCard key={item.job._id} item={item} />)}
              </div>
              <Pagination
                page={currentPage}
                pageCount={pageCount}
                onPageChange={setPage}
                summary={`Showing ${rangeStart}–${rangeEnd} of ${filtered.length}`}
                className="mt-6"
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
