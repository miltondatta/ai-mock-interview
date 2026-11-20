"use client"

import React, { useState } from "react"
import { ChevronDown, GraduationCap } from "lucide-react"
import TopicRow, { type RoomCardAction } from "./TopicRow"
import type { StudyRoomDashboardItem, StudyRoomPlanGroup } from "./types"

// M5 - mirrors app/(routes)/study-planner/[studyPlanId]/PhaseCard.tsx's
// collapsible-phase pattern (chevron + title + progress summary in the
// header, content below) so a phase here looks and behaves like its Study
// Planner counterpart instead of introducing a new visual language.
function PhaseSection({
  phase,
  defaultOpen,
  busyKey,
  onAction,
}: {
  phase: StudyRoomPlanGroup["phaseGroups"][number]
  defaultOpen: boolean
  busyKey: string | null
  onAction: (item: StudyRoomDashboardItem, action: RoomCardAction) => void
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
      >
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{phase.phaseTitle}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {phase.completedTopics}/{phase.totalTopics} topic{phase.totalTopics === 1 ? "" : "s"} &middot; {phase.progress}%
            complete
            {phase.inProgressTopics > 0 && <> &middot; {phase.inProgressTopics} in progress</>}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          {phase.totalTopics}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-border p-3">
          {phase.topics.map((topic) => (
            <TopicRow key={topic.key} item={topic} busy={busyKey === topic.key} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  )
}

function PlanSection({
  plan,
  busyKey,
  onAction,
}: {
  plan: StudyRoomPlanGroup
  busyKey: string | null
  onAction: (item: StudyRoomDashboardItem, action: RoomCardAction) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <GraduationCap className="size-4 shrink-0 text-primary" />
        <h3 className="truncate text-sm font-bold text-foreground" title={plan.planTitle}>
          {plan.planTitle}
        </h3>
        <span className="shrink-0 text-xs text-muted-foreground">
          {plan.completedTopics}/{plan.totalTopics} topics complete
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {plan.phaseGroups.map((phase) => (
          <PhaseSection key={phase.key} phase={phase} defaultOpen={false} busyKey={busyKey} onAction={onAction} />
        ))}
      </div>
    </div>
  )
}

export default PlanSection
