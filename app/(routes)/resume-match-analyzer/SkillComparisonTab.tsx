import React from "react"
import { Badge } from "@/components/ui/badge"
import { EmptyPanel, Panel, StatusBadge } from "./shared"
import type { AnalysisRequirement, RequirementStatus } from "@/utils/resumeMatchAnalysis"

const STATUS_SEGMENTS: { status: RequirementStatus | null; label: string; className: string }[] = [
  { status: "matched", label: "Matched", className: "bg-success" },
  { status: "partial", label: "Partially matched", className: "bg-warning" },
  { status: "unclear", label: "Needs review", className: "bg-sky-500" },
  { status: "not-evidenced", label: "Not evidenced", className: "bg-destructive" },
  { status: null, label: "Not assessed", className: "bg-muted-foreground/40" },
]

function SkillComparisonTab({ requirements }: { requirements: AnalysisRequirement[] }) {
  const skillRows = requirements.filter((r) => r.category === "requiredSkills" || r.category === "preferredSkills")
  // Fall back to every requirement if n8n didn't categorize any as skills.
  const rows = skillRows.length > 0 ? skillRows : requirements

  if (rows.length === 0) {
    return <EmptyPanel title="No skills to compare" description="The analysis didn't return any job requirements to compare against your resume." />
  }

  const segments = STATUS_SEGMENTS
    .map((segment) => ({ ...segment, count: rows.filter((r) => r.status === segment.status).length }))
    .filter((segment) => segment.count > 0)

  return (
    <Panel>
      <div>
        <h2 className="text-base font-semibold">Required vs. Evidenced Skills</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The skills this job asks for, and the evidence found for each in your selected resume.
        </p>
      </div>

      <div className="mt-4">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          {segments.map((segment) => (
            <div key={segment.label} className={segment.className} style={{ width: `${(segment.count / rows.length) * 100}%` }} />
          ))}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {segments.map((segment) => (
            <li key={segment.label} className="flex items-center gap-1.5">
              <span className={`size-2.5 rounded-full ${segment.className}`} />
              {segment.label}: <span className="font-medium text-foreground">{segment.count}</span> of {rows.length}
            </li>
          ))}
        </ul>
      </div>

      <ul className="mt-5 flex flex-col divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id} className="grid grid-cols-1 gap-2 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start md:gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">{row.requirement}</p>
              {row.importance && (
                <Badge variant="outline" className="mt-1">{row.importance === "required" ? "Required" : "Preferred"}</Badge>
              )}
            </div>
            <p className="text-sm text-foreground/75">
              {row.resumeEvidence ? <>&ldquo;{row.resumeEvidence}&rdquo;</> : <span className="text-muted-foreground">Not found in resume</span>}
            </p>
            <div className="md:w-36 md:text-right">
              <StatusBadge status={row.status} />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export default SkillComparisonTab
