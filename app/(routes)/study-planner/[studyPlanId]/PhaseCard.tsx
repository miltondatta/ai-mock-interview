"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useMutation } from "convex/react"
import { ChevronDown, ArrowUp, ArrowDown, Pencil, Trash2, Plus, Check, Clock, CalendarClock, ExternalLink } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import {
  PHASE_STATUS_META,
  PRIORITY_META,
  TASK_STATUS_META,
  formatDate,
  type PhaseDetail,
  type TaskDetail,
} from "./types"

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

export function TaskRow({
  task,
  onEdit,
  onDelete,
  onToggleDone,
}: {
  task: TaskDetail
  onEdit: () => void
  onDelete: () => void
  onToggleDone: () => void
}) {
  const statusMeta = TASK_STATUS_META[task.status]
  const priorityMeta = PRIORITY_META[task.priority]
  const isDone = task.status === "completed"
  const isOverdue = task.status === "pending" || task.status === "in_progress"
    ? !!task.scheduledDate && task.scheduledDate < todayKey()
    : false

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border p-3">
      <button
        type="button"
        onClick={onToggleDone}
        aria-label={isDone ? "Mark task incomplete" : "Mark task complete"}
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
          isDone ? "border-success bg-success text-success-foreground" : "border-border hover:border-primary"
        }`}
      >
        {isDone && <Check className="size-3.5" />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${isDone ? "text-muted-foreground line-through" : "text-foreground"}`}>
          {task.title}
        </p>
        {task.description && <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {task.estimatedDuration !== undefined && (
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" /> {task.estimatedDuration} min
            </span>
          )}
          {task.scheduledDate && (
            <span className={`flex items-center gap-1 ${isOverdue ? "font-medium text-destructive" : ""}`}>
              <CalendarClock className="size-3.5" /> {formatDate(task.scheduledDate)}
              {task.scheduledTime && ` · ${task.scheduledTime}`}
              {isOverdue && " · Overdue"}
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 font-semibold ${priorityMeta.className}`}>{priorityMeta.label}</span>
          <span className={`rounded-full px-2 py-0.5 font-semibold ${statusMeta.className}`}>{statusMeta.label}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Link
          href={`/study-planner/tasks/${task._id}`}
          aria-label="View task details"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="size-3.5" />
        </Link>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit task"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete task"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

interface PhaseCardProps {
  phase: PhaseDetail
  userId: Id<"UserTable">
  defaultOpen?: boolean
  isFirst: boolean
  isLast: boolean
  onEditPhase: () => void
  onDeletePhase: () => void
  onAddTask: () => void
  onEditTask: (task: TaskDetail) => void
  onDeleteTask: (task: TaskDetail) => void
}

function PhaseCard({ phase, userId, defaultOpen, isFirst, isLast, onEditPhase, onDeletePhase, onAddTask, onEditTask, onDeleteTask }: PhaseCardProps) {
  const [open, setOpen] = useState(!!defaultOpen)
  const updateTask = useMutation(api.StudyPlanner.UpdateTask)
  const reorderPhase = useMutation(api.StudyPlanner.ReorderPhase)
  const statusMeta = PHASE_STATUS_META[phase.status]

  function toggleTaskDone(task: TaskDetail) {
    updateTask({
      userId,
      taskId: task._id as Id<"studyPlanTasks">,
      status: task.status === "completed" ? "pending" : "completed",
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start gap-3 px-5 py-4">
        <div className="flex flex-col items-center gap-0.5 pt-0.5">
          <button
            type="button"
            disabled={isFirst}
            onClick={() => reorderPhase({ userId, phaseId: phase._id as Id<"studyPlanPhases">, direction: "up" })}
            aria-label="Move phase up"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
          >
            <ArrowUp className="size-3.5" />
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={() => reorderPhase({ userId, phaseId: phase._id as Id<"studyPlanPhases">, direction: "down" })}
            aria-label="Move phase down"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
          >
            <ArrowDown className="size-3.5" />
          </button>
        </div>

        <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <ChevronDown className={`mt-1 size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">{phase.title}</p>
            <p className="text-xs text-muted-foreground">
              {phase.completedTasks}/{phase.totalTasks} tasks &middot; {phase.progress}%
              {(phase.startDate || phase.endDate) && (
                <> &middot; {formatDate(phase.startDate)} &rarr; {formatDate(phase.endDate)}</>
              )}
            </p>
          </div>
        </button>

        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}>{statusMeta.label}</span>

        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onEditPhase} aria-label="Edit phase" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
            <Pencil className="size-3.5" />
          </button>
          <button type="button" onClick={onDeletePhase} aria-label="Delete phase" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border px-5 py-4">
          {phase.description && <p className="text-sm text-muted-foreground">{phase.description}</p>}

          {phase.objectives.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Learning objectives</p>
              <ul className="mt-1.5 flex flex-col gap-1 text-sm text-foreground">
                {phase.objectives.map((o) => (
                  <li key={o} className="flex items-start gap-2">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2.5">
            {phase.tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks in this phase yet.</p>}
            {phase.tasks.map((task) => (
              <TaskRow
                key={task._id}
                task={task}
                onEdit={() => onEditTask(task)}
                onDelete={() => onDeleteTask(task)}
                onToggleDone={() => toggleTaskDone(task)}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={onAddTask}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <Plus className="size-3.5" /> Add task to this phase
          </button>
        </div>
      )}
    </div>
  )
}

export default PhaseCard
