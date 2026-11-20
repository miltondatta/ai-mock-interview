// Display helpers for job listings (M7), shared by /jobs, the dashboard and
// /admin/jobs. Client-safe.

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
