// Display helpers for job listings (M7), shared by /jobs, the dashboard and
// /admin/jobs. Client-safe.

// Himalayas/Jobicy-sourced jobs store `description` as plain text going
// forward (stripped at sync time in convex/himalayasSync.ts and
// convex/jobicy.ts), but any job synced before that fix still has raw HTML
// in storage (e.g. "<h3>Who We Are</h3><p>..."), which otherwise renders as
// literal tag text in JobCard's preview. Stripping again here is a no-op on
// already-clean text, so this is safe to apply unconditionally and fixes
// both the historical data and any future lapse, without needing a
// database backfill. Mirrors convex/jobSyncShared.ts's stripHtmlToText() -
// duplicated rather than imported, since this module is used by client
// components and that one lives in convex/.
export function stripHtmlToText(html: string): string {
  return html
    .replace(/<\/?(p|div|br|li|ul|ol|h[1-6]|blockquote|tr|table|section|article)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
}

// Personalized Job Discovery (D5) freshness indicator. `timestamp` is
// candidateJobMatches' own `generatedAt` (the oldest one among a
// candidate's current recommendations, from convex/jobDiscovery.ts's
// GetCandidateMatches) - a real timestamp read from Convex, never a
// hardcoded sample date. Returns null when there's nothing to show (the
// caller is expected to only call this when it has persisted matches to
// display in the first place - see app/(routes)/jobs/page.tsx and
// app/(routes)/dashboard/JobsForYou.tsx).
export function formatLastRefreshed(timestamp: number | null): string | null {
  if (timestamp === null) return null
  return `Last updated: ${new Date(timestamp).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

interface SalaryFields {
  salaryMin?: number
  salaryMax?: number
  salaryCurrency?: string
  salaryPeriod?: "hour" | "month" | "year"
}

const PERIOD_SUFFIX = { hour: "/hr", month: "/mo", year: "/yr" } as const

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      notation: amount >= 100_000 ? "compact" : "standard",
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount}`
  }
}

// "$50–$60/hr", "From $80K/yr", "Up to €4,000/mo", or null when no salary was posted.
export function formatSalary(job: SalaryFields): string | null {
  const { salaryMin: min, salaryMax: max } = job
  if (min === undefined && max === undefined) return null
  const currency = job.salaryCurrency || "USD"
  const suffix = PERIOD_SUFFIX[job.salaryPeriod ?? "year"]
  if (min !== undefined && max !== undefined) {
    return min === max ? `${money(min, currency)}${suffix}` : `${money(min, currency)}–${money(max, currency)}${suffix}`
  }
  if (min !== undefined) return `From ${money(min, currency)}${suffix}`
  return `Up to ${money(max as number, currency)}${suffix}`
}

export const WORK_MODE_LABELS = { onsite: "On-site", remote: "Remote", hybrid: "Hybrid" } as const
export type WorkMode = keyof typeof WORK_MODE_LABELS
// Display/filter order requested for the Jobs page (J8): Remote, Hybrid, Onsite.
export const WORK_MODE_FILTER_OPTIONS: readonly WorkMode[] = ["remote", "hybrid", "onsite"]

// Experience-level filter buckets (J8). Neither Himalayas nor Jobicy
// currently supplies a numeric experience range (see
// JOB_SEARCH_IMPLEMENTATION_PROGRESS.md - their adapters deliberately leave
// minYearsExperience/maxYearsExperience unset rather than inventing a
// number from a seniority label), so in practice this filter only ever
// matches admin-created jobs today. That's the correct, honest behavior
// given the current data, not a bug - a job with neither bound set simply
// has no assignable level and is excluded whenever this filter is active
// (jobExperienceLevelIds returns []), never guessed at.
export interface ExperienceLevel {
  id: string
  label: string
  min: number
  max: number
}
export const EXPERIENCE_LEVELS: readonly ExperienceLevel[] = [
  { id: "entry", label: "Entry level", min: 0, max: 2 },
  { id: "mid", label: "Mid level", min: 3, max: 5 },
  { id: "senior", label: "Senior", min: 6, max: 9 },
  { id: "lead", label: "Lead / Principal", min: 10, max: Infinity },
]

// Every bucket a job's [minYearsExperience, maxYearsExperience] range
// overlaps - a job can span more than one bucket (e.g. "3-8 years" overlaps
// Mid and Senior), and an open-ended bound (only one of the two set) only
// overlaps buckets consistent with that open end, rather than every bucket.
// Returns [] when the job states no experience range at all.
export function jobExperienceLevelIds(job: { minYearsExperience?: number; maxYearsExperience?: number }): string[] {
  const { minYearsExperience, maxYearsExperience } = job
  if (minYearsExperience === undefined && maxYearsExperience === undefined) return []
  const lo = minYearsExperience ?? 0
  const hi = maxYearsExperience ?? Infinity
  return EXPERIENCE_LEVELS.filter(level => lo <= level.max && hi >= level.min).map(level => level.id)
}

// "Berlin, Germany · Hybrid", "Remote", or null.
export function formatJobLocation(job: { location?: string; workMode?: "onsite" | "remote" | "hybrid" }): string | null {
  const parts = [job.location, job.workMode ? WORK_MODE_LABELS[job.workMode] : undefined].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : null
}

// Host name of the application link, e.g. "careers.example.com". Used as the
// visible source when no source name was entered.
export function applyHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

// Whole days until an "YYYY-MM-DD" application deadline, or null when there
// isn't one. GetJobsForUser already excludes jobs whose deadline has fully
// passed, so a non-null result here is always 0 (today) or more.
export function daysUntilDeadline(applicationDeadline: string | undefined): number | null {
  if (!applicationDeadline) return null
  const [y, m, d] = applicationDeadline.split("-").map(Number)
  const deadline = new Date(y, (m ?? 1) - 1, d ?? 1)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((deadline.getTime() - today.getTime()) / 86_400_000)
}

export const CLOSING_SOON_DAYS = 7

// "Apply today", "Closes tomorrow", "Closes in 5 days", or null.
export function formatDeadline(applicationDeadline: string | undefined): string | null {
  const days = daysUntilDeadline(applicationDeadline)
  if (days === null) return null
  if (days <= 0) return "Apply today"
  if (days === 1) return "Closes tomorrow"
  return `Closes in ${days} days`
}
