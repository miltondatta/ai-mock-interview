"use client"

import React, { useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  RotateCcw,
  ArrowRight,
  CircleAlert,
  Save,
} from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import PlanStructureEditor from "./PlanStructureEditor"
import {
  LEVELS,
  WEEK_DAYS,
  LEARNING_PREFERENCES,
  draftFromGeneratedPlan,
  type Level,
  type PlanDraft,
  type PhaseDraft,
  type MilestoneDraft,
  type GeneratedPlanResponse,
} from "./types"

type Stage = "form" | "generating" | "preview"

const GENERATION_STEPS = [
  "Understanding your learning goal...",
  "Structuring learning phases...",
  "Building weekly milestones & tasks...",
  "Finalizing your study plan...",
]

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-sm font-semibold text-foreground">{children}</label>
}

const inputClass =
  "w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"

function SegmentedSelect({
  value,
  onChange,
}: {
  value: Level | null
  onChange: (v: Level) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      {LEVELS.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex flex-col items-start gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors ${
              selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:bg-muted/50"
            }`}
          >
            <span className={`text-sm font-semibold ${selected ? "text-primary" : "text-foreground"}`}>{opt.label}</span>
            <span className="text-xs text-muted-foreground">{opt.hint}</span>
          </button>
        )
      })}
    </div>
  )
}

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
        selected ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/30"
      }`}
    >
      {label}
    </button>
  )
}

function GeneratingState({ topic }: { topic: string }) {
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, GENERATION_STEPS.length - 1))
    }, 1400)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-8 py-16 text-center shadow-sm">
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Loader2 className="size-7 animate-spin" />
      </div>
      <div>
        <p className="text-base font-semibold text-foreground">Generating your study plan</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {topic ? `Building a plan for "${topic}"` : "This can take up to a minute"}
        </p>
      </div>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm">
        {GENERATION_STEPS.map((step, i) => (
          <li key={step} className={`flex items-center gap-2 transition-colors ${i <= stepIndex ? "text-foreground" : "text-muted-foreground/50"}`}>
            {i < stepIndex ? (
              <CheckCircle2 className="size-4 shrink-0 text-success" />
            ) : i === stepIndex ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
            ) : (
              <span className="size-4 shrink-0 rounded-full border border-border" />
            )}
            {step}
          </li>
        ))}
      </ul>
    </div>
  )
}

const GENERATE_TIMEOUT_MS = 110000

export function CreateStudyPlanAITab() {
  const router = useRouter()
  const { userDetail } = useContext(UserDetailContext)
  const userId: Id<"UserTable"> | undefined = userDetail?._id
  const createStudyPlan = useMutation(api.StudyPlanner.CreateStudyPlan)

  const [subject, setSubject] = useState("")
  const [learningGoal, setLearningGoal] = useState("")
  const [currentLevel, setCurrentLevel] = useState<Level | null>("beginner")
  const [targetLevel, setTargetLevel] = useState<Level | null>("intermediate")
  const [startDate, setStartDate] = useState("")
  const [targetEndDate, setTargetEndDate] = useState("")
  const [hoursPerDay, setHoursPerDay] = useState("1.5")
  const [selectedDays, setSelectedDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"])
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>(["Hands-on practice"])
  const [additionalInstructions, setAdditionalInstructions] = useState("")

  const [stage, setStage] = useState<Stage>("form")
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<PlanDraft | null>(null)
  const [saving, setSaving] = useState(false)

  function toggleDay(day: string) {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
  }
  function togglePreference(pref: string) {
    setSelectedPreferences((prev) => (prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]))
  }

  function setPhases(phases: PhaseDraft[]) {
    setDraft((d) => (d ? { ...d, phases } : d))
  }
  function setMilestones(milestones: MilestoneDraft[]) {
    setDraft((d) => (d ? { ...d, milestones } : d))
  }

  async function handleGenerate() {
    setError(null)
    if (!subject.trim()) {
      setError("Please describe what you want to learn.")
      return
    }
    if (!currentLevel || !targetLevel) {
      setError("Please select your current and target knowledge level.")
      return
    }
    if (!startDate || !targetEndDate) {
      setError("Please set a start date and a target completion date.")
      return
    }
    if (targetEndDate < startDate) {
      setError("The target completion date must be on or after the start date.")
      return
    }
    const hours = Number(hoursPerDay)
    if (!Number.isFinite(hours) || hours <= 0) {
      setError("Please enter a valid number of study hours per day.")
      return
    }

    setStage("generating")
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS)
    try {
      const res = await fetch("/api/study-planner/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          learningGoal,
          currentLevel,
          targetLevel,
          startDate,
          targetEndDate,
          availableHoursPerDay: hours,
          preferredStudyDays: selectedDays,
          learningPreferences: selectedPreferences,
          additionalInstructions,
        }),
        signal: controller.signal,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.plan) {
        setError(data?.error ?? "Unable to generate a study plan right now. Please try again.")
        setStage("form")
        return
      }
      setDraft(draftFromGeneratedPlan(data.plan as GeneratedPlanResponse))
      setStage("preview")
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "AbortError"
          ? "Generation took too long to complete. Please try again."
          : "Unable to reach the server. Please check your connection and try again."
      )
      setStage("form")
    } finally {
      clearTimeout(timer)
    }
  }

  async function handleSave() {
    if (!draft || !userId || saving) return
    setSaving(true)
    setError(null)
    try {
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
        setError("The plan needs at least one task. Add one below or regenerate.")
        setSaving(false)
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

      const result = await createStudyPlan({
        userId,
        title: draft.title.trim() || subject.trim(),
        description: draft.description.trim() || undefined,
        learningGoal: draft.learningGoal.trim() || undefined,
        currentLevel: draft.currentLevel ?? undefined,
        targetLevel: draft.targetLevel ?? undefined,
        startDate: draft.startDate,
        targetEndDate: draft.targetEndDate,
        availableHoursPerDay: Number(hoursPerDay) || undefined,
        preferredStudyDays: selectedDays,
        learningPreferences: selectedPreferences,
        additionalInstructions: additionalInstructions.trim() || undefined,
        generationMethod: "ai",
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

  if (stage === "generating") return <GeneratingState topic={subject} />

  if (stage === "preview" && draft) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3 rounded-2xl border border-success/30 bg-success/5 px-5 py-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
          <div>
            <p className="text-sm font-semibold text-foreground">Your study plan is ready</p>
            <p className="text-sm text-muted-foreground">
              Review and edit anything below, then save it - or regenerate for a different plan.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <FieldLabel>Plan title</FieldLabel>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className={inputClass}
          />
          <div className="mt-4">
            <FieldLabel>Description</FieldLabel>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={2}
              className={`${inputClass} resize-none`}
            />
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
            onClick={() => {
              setDraft(null)
              setStage("form")
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
          >
            <RotateCcw className="size-4" /> Edit answers &amp; regenerate
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !userId}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {saving ? "Saving..." : "Save Study Plan"}
            {!saving && <ArrowRight className="size-4" />}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <FieldLabel>Subject or topic</FieldLabel>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Python Programming"
          className={inputClass}
        />
      </div>

      <div>
        <FieldLabel>Learning goal (optional)</FieldLabel>
        <input
          value={learningGoal}
          onChange={(e) => setLearningGoal(e.target.value)}
          placeholder="What should you be able to do by the end?"
          className={inputClass}
        />
      </div>

      <div>
        <FieldLabel>Current knowledge level</FieldLabel>
        <SegmentedSelect value={currentLevel} onChange={setCurrentLevel} />
      </div>
      <div>
        <FieldLabel>Target knowledge level</FieldLabel>
        <SegmentedSelect value={targetLevel} onChange={setTargetLevel} />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <FieldLabel>Start date</FieldLabel>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <FieldLabel>Target completion</FieldLabel>
          <input
            type="date"
            value={targetEndDate}
            onChange={(e) => setTargetEndDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel>Study hours / day</FieldLabel>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={hoursPerDay}
            onChange={(e) => setHoursPerDay(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <FieldLabel>Preferred study days</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {WEEK_DAYS.map((day) => (
            <Chip key={day} label={day} selected={selectedDays.includes(day)} onClick={() => toggleDay(day)} />
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>Learning preferences</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {LEARNING_PREFERENCES.map((pref) => (
            <Chip key={pref} label={pref} selected={selectedPreferences.includes(pref)} onClick={() => togglePreference(pref)} />
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>Additional instructions (optional)</FieldLabel>
        <textarea
          value={additionalInstructions}
          onChange={(e) => setAdditionalInstructions(e.target.value)}
          rows={2}
          placeholder="Anything else the AI should know, e.g. focus more on practical projects than theory."
          className={`${inputClass} resize-none`}
        />
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <p className="flex-1">{error}</p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!userId}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Sparkles className="size-4" /> Generate My Study Plan
        </button>
      </div>
    </div>
  )
}

export default CreateStudyPlanAITab
