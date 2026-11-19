import React from "react"
import { Building2, ExternalLink, MapPin, Wallet } from "lucide-react"
import type { FunctionReturnType } from "convex/server"
import type { api } from "@/convex/_generated/api"
import { cn } from "@/lib/utils"
import { applyHost, formatJobLocation, formatSalary } from "@/utils/jobs/format"

export type JobItem = FunctionReturnType<typeof api.Jobs.GetJobsForUser>["jobs"][number]

// One job listing. A match score and reasons are shown only when the server
// returned a personalized match (profile complete). Otherwise it's a plain
// listing with no score. Every field shown comes from the admin-entered job.
export function JobCard({ item, compact = false }: { item: JobItem; compact?: boolean }) {
  const { job, match } = item
  const salary = formatSalary(job)
  const location = formatJobLocation(job)
  const source = job.source || applyHost(job.applyUrl)

  return (
    <article className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-start", !compact && "sm:p-5")}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary" aria-hidden>
        {job.company.trim().charAt(0).toUpperCase() || "?"}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h3 className="text-sm font-semibold text-foreground sm:text-base">{job.title}</h3>
          {match && (
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                match.score >= 70 ? "bg-success/15 text-success" : "bg-primary/10 text-primary"
              )}
              title="How closely this job matches your profile"
            >
              {match.score}% match
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground sm:text-sm">
          <span className="inline-flex items-center gap-1"><Building2 className="size-3.5" />{job.company}</span>
          {location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{location}</span>}
          {salary && <span className="inline-flex items-center gap-1 font-medium text-foreground"><Wallet className="size-3.5" />{salary}</span>}
          {job.employmentType && !compact && <span>{job.employmentType}</span>}
        </div>

        {match && match.reasons.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {match.reasons.map(r => (
              <li key={r} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{r}</li>
            ))}
          </ul>
        )}

        {!compact && job.description && (
          <p className="mt-2 line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">{job.description}</p>
        )}

        {!compact && job.requiredSkills.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Required skills">
            {job.requiredSkills.map(s => {
              const have = match?.matchedSkills.includes(s)
              return (
                <li
                  key={s}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs",
                    have ? "bg-success/15 font-medium text-success" : "border border-border text-muted-foreground"
                  )}
                  title={match ? (have ? "In your profile" : "Not in your profile yet") : undefined}
                >
                  {s}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
        <a
          href={job.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
        >
          Apply <ExternalLink className="size-3.5" />
        </a>
        {source && <span className="text-xs text-muted-foreground">via {source}</span>}
      </div>
    </article>
  )
}
