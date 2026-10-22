"use client"

import React, { useState } from "react"
import { ArrowRight, CircleAlert, CircleCheck, CircleHelp, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AnalysisSkill } from "@/utils/resumeMatchAnalysis"

const TOP_COUNT = 5

interface SkillSummaryCardsProps {
  matchedSkills: AnalysisSkill[]
  missingSkills: AnalysisSkill[]
  unclearSkills: AnalysisSkill[]
  onShowRecommendations: () => void
  onShowAssessment: () => void
}

function SkillCard({
  icon: Icon,
  iconClassName,
  title,
  subtitle,
  subtitleClassName,
  headerClassName,
  children,
  linkLabel,
  onLinkClick,
}: {
  icon: React.ElementType
  iconClassName: string
  title: string
  subtitle: React.ReactNode
  subtitleClassName: string
  headerClassName: string
  children: React.ReactNode
  linkLabel?: string
  onLinkClick?: () => void
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <header className={cn("flex items-center gap-3 border-b border-border px-4 py-3", headerClassName)}>
        <Icon className={cn("size-7 shrink-0", iconClassName)} />
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className={cn("text-sm", subtitleClassName)}>{subtitle}</p>
        </div>
      </header>
      <div className="flex flex-1 flex-col px-4 py-3">
        {children}
        {linkLabel && onLinkClick && (
          <button
            type="button"
            onClick={onLinkClick}
            className="mt-auto flex w-fit items-center gap-1 pt-3 text-sm font-medium text-primary hover:underline"
          >
            {linkLabel}
            <ArrowRight className="size-3.5" />
          </button>
        )}
      </div>
    </section>
  )
}

function SkillList({ items, icon: Icon, iconClassName, showNotes }: {
  items: AnalysisSkill[]
  icon: React.ElementType
  iconClassName: string
  showNotes?: boolean
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">None identified.</p>
  }
  return (
    <ul className={cn("flex flex-col", showNotes ? "gap-3" : "gap-2")}>
      {items.map((item, i) => (
        <li key={`${item.name}-${i}`} className="text-sm">
          <span className="flex items-start gap-2.5">
            <Icon className={cn("mt-0.5 size-4 shrink-0", iconClassName)} />
            <span className={cn(showNotes && "font-medium")}>{item.name}</span>
          </span>
          {showNotes && item.note && <p className="mt-0.5 pl-6.5 text-xs text-muted-foreground">{item.note}</p>}
        </li>
      ))}
    </ul>
  )
}

function MoreCount({ total }: { total: number }) {
  return total > TOP_COUNT ? <p className="mt-2 text-xs text-muted-foreground">+{total - TOP_COUNT} more</p> : null
}

function SkillSummaryCards({ matchedSkills, missingSkills, unclearSkills, onShowRecommendations, onShowAssessment }: SkillSummaryCardsProps) {
  const [showAllMatched, setShowAllMatched] = useState(false)
  const [showUnclearDetails, setShowUnclearDetails] = useState(false)
  const unclearHasNotes = unclearSkills.some((item) => item.note)

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <SkillCard
        icon={CircleCheck}
        iconClassName="text-success"
        headerClassName="bg-success/5"
        title="Top Matched Skills"
        subtitle={<><span className="font-semibold">{matchedSkills.length}</span> matched</>}
        subtitleClassName="text-success"
        linkLabel={matchedSkills.length > TOP_COUNT ? (showAllMatched ? "Show top matched skills" : "View all matched skills") : undefined}
        onLinkClick={() => setShowAllMatched((v) => !v)}
      >
        <SkillList
          items={showAllMatched ? matchedSkills : matchedSkills.slice(0, TOP_COUNT)}
          icon={CircleCheck}
          iconClassName="text-success"
        />
      </SkillCard>

      <SkillCard
        icon={TriangleAlert}
        iconClassName="text-primary"
        headerClassName="bg-primary/5"
        title="Missing or Weak Skills"
        subtitle={`${missingSkills.length} ${missingSkills.length === 1 ? "gap" : "gaps"}`}
        subtitleClassName="text-primary"
        linkLabel={missingSkills.length > 0 ? "How to improve these skills" : undefined}
        onLinkClick={onShowRecommendations}
      >
        <SkillList items={missingSkills.slice(0, TOP_COUNT)} icon={CircleAlert} iconClassName="text-destructive" />
        <MoreCount total={missingSkills.length} />
      </SkillCard>

      <SkillCard
        icon={CircleHelp}
        iconClassName="text-sky-600"
        headerClassName="bg-sky-500/5"
        title="Unclear Skills"
        subtitle={`${unclearSkills.length} need review`}
        subtitleClassName="text-sky-600"
        linkLabel={unclearSkills.length === 0 ? undefined : unclearHasNotes && showUnclearDetails ? "Hide details" : "See details"}
        // Without per-skill notes from n8n, the details live in the Detailed Assessment tab.
        onLinkClick={unclearHasNotes ? () => setShowUnclearDetails((v) => !v) : onShowAssessment}
      >
        <SkillList
          items={showUnclearDetails ? unclearSkills : unclearSkills.slice(0, TOP_COUNT)}
          icon={CircleHelp}
          iconClassName="text-sky-600"
          showNotes={showUnclearDetails}
        />
        {!showUnclearDetails && <MoreCount total={unclearSkills.length} />}
      </SkillCard>
    </div>
  )
}

export default SkillSummaryCards
