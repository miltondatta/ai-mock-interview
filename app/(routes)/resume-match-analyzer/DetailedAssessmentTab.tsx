import React from "react"
import { Briefcase, Cpu, GraduationCap, ListChecks, Star } from "lucide-react"
import { Panel, StatusBadge } from "./shared"
import type { AnalysisRequirement, CategoryKey, CategoryScore } from "@/utils/resumeMatchAnalysis"

const SECTION_ICONS: Record<CategoryKey, React.ElementType> = {
  requiredSkills: Cpu,
  experience: Briefcase,
  responsibilities: ListChecks,
  education: GraduationCap,
  preferredSkills: Star,
}

function DetailedAssessmentTab({ categoryScores, requirements }: { categoryScores: CategoryScore[]; requirements: AnalysisRequirement[] }) {
  const uncategorized = requirements.filter((r) => r.category === null)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        A requirement-by-requirement assessment of your selected resume, grouped by category.
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {categoryScores.map((category) => {
          const Icon = SECTION_ICONS[category.key]
          const items = requirements.filter((r) => r.category === category.key)
          return (
            <Panel key={category.key} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-[18px]" />
                </span>
                <h2 className="flex-1 text-base font-semibold">{category.label}</h2>
                <span className="text-lg font-bold tabular-nums">
                  {category.score !== null ? `${category.score}%` : <span className="text-sm font-medium text-muted-foreground">N/A</span>}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                {category.score !== null && (
                  <div className="h-full rounded-full bg-primary" style={{ width: `${category.score}%` }} />
                )}
              </div>
              <AssessmentItems items={items} />
            </Panel>
          )
        })}
        {uncategorized.length > 0 && (
          <Panel className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">Other requirements</h2>
            <AssessmentItems items={uncategorized} />
          </Panel>
        )}
      </div>
    </div>
  )
}

function AssessmentItems({ items }: { items: AnalysisRequirement[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No requirements in this category.</p>
  }
  return (
    <ul className="flex flex-col divide-y divide-border">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium">{item.requirement}</p>
            <StatusBadge status={item.status} />
          </div>
          <p className="text-sm text-foreground/75">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Evidence: </span>
            {item.resumeEvidence ?? <span className="text-muted-foreground">Not found in resume</span>}
          </p>
          {item.explanation && (
            <p className="rounded-lg bg-muted/70 px-3 py-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Note: </span>
              {item.explanation}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

export default DetailedAssessmentTab
