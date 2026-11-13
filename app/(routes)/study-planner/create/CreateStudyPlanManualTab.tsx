"use client"

import React, { useContext, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import { Save, CircleAlert, Loader2 } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import PlanStructureEditor from "./PlanStructureEditor"
import { emptyPlanDraft, type PhaseDraft, type MilestoneDraft } from "./types"

const inputClass =
  "w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-sm font-semibold text-foreground">{children}</label>
}

export function CreateStudyPlanManualTab() {
  const router = useRouter()
  const { userDetail } = useContext(UserDetailContext)
  const userId: Id<"UserTable"> | undefined = userDetail?._id
  const createStudyPlan = useMutation(api.StudyPlanner.CreateStudyPlan)

  const [draft, setDraft] = useState(emptyPlanDraft())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setPhases(phases: PhaseDraft[]) {
    setDraft((d) => ({ ...d, phases }))
  }
  function setMilestones(milestones: MilestoneDraft[]) {
    setDraft((d) => ({ ...d, milestones }))
  }

  async function handleSave() {
    if (saving || !userId) return
    setError(null)

    if (!draft.title.trim()) {
      setError("Please give your study plan a title.")
      return
    }
    if (!draft.startDate || !draft.targetEndDate) {
      setError("Please set a start date and a target completion date.")
      return
    }
    if (draft.targetEndDate < draft.startDate) {
      setError("The target completion date must be on or after the start date.")
      return
    }

    const phases = draft.phases
      .map((phase, index) => ({
        title: phase.title.trim() || `Phase ${index + 1}`,
        description: phase.description.trim() || undefined,
        order: index,
        startDate: phase.startDate || undefined,
        endDate: phase.endDate || undefined,
        objectives: phase.objectives.map((o) => o.trim()).filter(Boolean),
        tasks: phase.tasks
          .filter((t) => t.title.trim().length > 0)
          .map((t) => ({
            title: t.title.trim(),
            description: t.description.trim() || undefined,
            priority: t.priority,
            estimatedDuration: t.estimatedDuration || undefined,
            scheduledDate: t.scheduledDate || undefined,
            completionCriteria: t.completionCriteria.trim() || undefined,
          })),
      }))
      .filter((phase) => phase.tasks.length > 0)

    if (phases.length === 0) {
      setError("Please add at least one task with a title.")
      return
    }

    const milestones = draft.milestones
      .filter((m) => m.title.trim().length > 0)
      .map((m) => ({
        title: m.title.trim(),
        description: m.description.trim() || undefined,
        targetDate: m.targetDate || undefined,
        completionCriteria: m.completionCriteria.trim() || undefined,
      }))

    setSaving(true)
    try {
      const result = await createStudyPlan({
        userId,
        title: draft.title.trim(),
        description: draft.description.trim() || undefined,
        learningGoal: draft.learningGoal.trim() || undefined,
        currentLevel: draft.currentLevel ?? undefined,
        targetLevel: draft.targetLevel ?? undefined,
        startDate: draft.startDate,
        targetEndDate: draft.targetEndDate,
        generationMethod: "manual",
        phases,
        milestones,
      })
      router.push(`/study-planner?created=${result.studyPlanId}`)
    } catch (e) {
      setError("Unable to save this study plan right now. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-base font-bold text-foreground">Plan details</h3>
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <FieldLabel>Plan title</FieldLabel>
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="e.g. Prepare for AWS Cloud Practitioner"
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel>Description</FieldLabel>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              rows={2}
              placeholder="A short description of this study plan"
              className={`${inputClass} resize-none`}
            />
          </div>
          <div>
            <FieldLabel>Learning goal</FieldLabel>
            <input
              value={draft.learningGoal}
              onChange={(e) => setDraft((d) => ({ ...d, learningGoal: e.target.value }))}
              placeholder="What you want to achieve"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Start date</FieldLabel>
              <input
                type="date"
                value={draft.startDate}
                onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel>Target completion date</FieldLabel>
              <input
                type="date"
                value={draft.targetEndDate}
                onChange={(e) => setDraft((d) => ({ ...d, targetEndDate: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </div>

      <PlanStructureEditor
        phases={draft.phases}
        milestones={draft.milestones}
        onChangePhases={setPhases}
        onChangeMilestones={setMilestones}
      />

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <p className="flex-1">{error}</p>
        </div>
      )}

      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <button
          type="button"
          disabled={saving || !userId}
          onClick={handleSave}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saving ? "Saving..." : "Create Plan"}
        </button>
      </div>
    </div>
  )
}

export default CreateStudyPlanManualTab
