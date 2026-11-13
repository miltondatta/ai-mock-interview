"use client"

import React, { useState } from "react"
import { ChevronDown, Plus, X, Flag } from "lucide-react"
import {
  PRIORITY_META,
  emptyPhase,
  emptyTask,
  emptyMilestone,
  type MilestoneDraft,
  type PhaseDraft,
  type Priority,
  type TaskDraft,
} from "./types"

interface PlanStructureEditorProps {
  phases: PhaseDraft[]
  milestones: MilestoneDraft[]
  onChangePhases: (phases: PhaseDraft[]) => void
  onChangeMilestones: (milestones: MilestoneDraft[]) => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"

function TaskRow({
  task,
  onChange,
  onRemove,
}: {
  task: TaskDraft
  onChange: (patch: Partial<TaskDraft>) => void
  onRemove: () => void
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border p-3">
      <div className="flex items-center gap-2">
        <input
          value={task.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Task title"
          className={inputClass}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove task"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"
        >
          <X className="size-4" />
        </button>
      </div>
      <textarea
        value={task.description}
        onChange={(e) => onChange({ description: e.target.value })}
        rows={2}
        placeholder="Task description (optional)"
        className={`${inputClass} resize-none`}
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Duration
          <input
            type="number"
            min={5}
            step={5}
            value={task.estimatedDuration}
            onChange={(e) => onChange({ estimatedDuration: Number(e.target.value) })}
            className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/40"
          />
          min
        </label>
        <input
          type="date"
          value={task.scheduledDate}
          onChange={(e) => onChange({ scheduledDate: e.target.value })}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/40"
        />
        <div className="ml-auto flex items-center gap-1.5">
          {(Object.keys(PRIORITY_META) as Priority[]).map((p) => {
            const meta = PRIORITY_META[p]
            const selected = task.priority === p
            return (
              <button
                key={p}
                type="button"
                onClick={() => onChange({ priority: p })}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-opacity ${meta.className} ${
                  selected ? "opacity-100 ring-1 ring-current" : "opacity-50"
                }`}
              >
                {meta.label}
              </button>
            )
          })}
        </div>
      </div>
      <input
        value={task.completionCriteria}
        onChange={(e) => onChange({ completionCriteria: e.target.value })}
        placeholder="Completion criteria (optional) - what does done look like?"
        className={inputClass}
      />
    </div>
  )
}

function PhaseCard({
  phase,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  phase: PhaseDraft
  index: number
  onChange: (patch: Partial<PhaseDraft>) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const [open, setOpen] = useState(index === 0)

  function updateTask(taskId: string, patch: Partial<TaskDraft>) {
    onChange({ tasks: phase.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) })
  }
  function removeTask(taskId: string) {
    onChange({ tasks: phase.tasks.filter((t) => t.id !== taskId) })
  }
  function addTask() {
    onChange({ tasks: [...phase.tasks, emptyTask()] })
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 px-5 py-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Collapse phase" : "Expand phase"}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <input
          value={phase.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={`Phase ${index + 1} title`}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 text-sm font-bold text-foreground outline-none hover:border-border focus:border-border focus:bg-background focus:px-3 focus:py-1.5"
        />
        <span className="shrink-0 text-xs text-muted-foreground">{phase.tasks.length} tasks</span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove phase"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-4 border-t border-border px-5 py-4">
          <textarea
            value={phase.description}
            onChange={(e) => onChange({ description: e.target.value })}
            rows={2}
            placeholder="What does this phase cover? (optional)"
            className={`${inputClass} resize-none`}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Phase start date">
              <input
                type="date"
                value={phase.startDate}
                onChange={(e) => onChange({ startDate: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Phase end date">
              <input
                type="date"
                value={phase.endDate}
                onChange={(e) => onChange({ endDate: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Learning objectives (one per line, optional)">
            <textarea
              value={phase.objectives.join("\n")}
              onChange={(e) => onChange({ objectives: e.target.value.split("\n") })}
              rows={2}
              placeholder={"e.g. Understand core syntax\nBuild a small script"}
              className={`${inputClass} resize-none`}
            />
          </Field>

          <div className="flex flex-col gap-2.5">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tasks</p>
            {phase.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onChange={(patch) => updateTask(task.id, patch)}
                onRemove={() => removeTask(task.id)}
              />
            ))}
            <button
              type="button"
              onClick={addTask}
              className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary hover:underline"
            >
              <Plus className="size-3.5" /> Add task
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function PlanStructureEditor({ phases, milestones, onChangePhases, onChangeMilestones }: PlanStructureEditorProps) {
  function updatePhase(id: string, patch: Partial<PhaseDraft>) {
    onChangePhases(phases.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }
  function removePhase(id: string) {
    onChangePhases(phases.filter((p) => p.id !== id))
  }
  function addPhase() {
    onChangePhases([...phases, emptyPhase(phases.length)])
  }

  function updateMilestone(id: string, patch: Partial<MilestoneDraft>) {
    onChangeMilestones(milestones.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }
  function removeMilestone(id: string) {
    onChangeMilestones(milestones.filter((m) => m.id !== id))
  }
  function addMilestone() {
    onChangeMilestones([...milestones, emptyMilestone()])
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">Learning phases</h3>
      </div>
      <div className="flex flex-col gap-3">
        {phases.map((phase, i) => (
          <PhaseCard
            key={phase.id}
            phase={phase}
            index={i}
            canRemove={phases.length > 1}
            onChange={(patch) => updatePhase(phase.id, patch)}
            onRemove={() => removePhase(phase.id)}
          />
        ))}
        <button
          type="button"
          onClick={addPhase}
          className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary hover:underline"
        >
          <Plus className="size-3.5" /> Add phase
        </button>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">Milestones</h3>
      </div>
      <div className="flex flex-col gap-2.5">
        {milestones.length === 0 && (
          <p className="text-sm text-muted-foreground">No milestones added yet.</p>
        )}
        {milestones.map((m) => (
          <div key={m.id} className="flex flex-col gap-2.5 rounded-xl border border-border p-3">
            <div className="flex items-center gap-2">
              <Flag className="size-4 shrink-0 text-primary" />
              <input
                value={m.title}
                onChange={(e) => updateMilestone(m.id, { title: e.target.value })}
                placeholder="Milestone title"
                className={inputClass}
              />
              <input
                type="date"
                value={m.targetDate}
                onChange={(e) => updateMilestone(m.id, { targetDate: e.target.value })}
                className="w-44 shrink-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/40"
              />
              <button
                type="button"
                onClick={() => removeMilestone(m.id)}
                aria-label="Remove milestone"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <X className="size-4" />
              </button>
            </div>
            <input
              value={m.completionCriteria}
              onChange={(e) => updateMilestone(m.id, { completionCriteria: e.target.value })}
              placeholder="Completion criteria (optional)"
              className={inputClass}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addMilestone}
          className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary hover:underline"
        >
          <Plus className="size-3.5" /> Add milestone
        </button>
      </div>
    </div>
  )
}

export default PlanStructureEditor
