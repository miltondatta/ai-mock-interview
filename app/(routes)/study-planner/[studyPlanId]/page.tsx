"use client"

import React, { useContext, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import {
  ArrowLeft,
  Pencil,
  Pause,
  Play,
  RotateCcw,
  Archive,
  MoreHorizontal,
  Trash2,
  Plus,
  Flag,
  CalendarRange,
  ListChecks,
  Clock,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Layers,
} from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import PhaseCard, { TaskRow } from "./PhaseCard"
import EditPlanDialog from "./EditPlanDialog"
import PhaseFormDialog from "./PhaseFormDialog"
import TaskFormDialog from "./TaskFormDialog"
import MilestoneFormDialog from "./MilestoneFormDialog"
import ConfirmDialog from "./ConfirmDialog"
import {
  LEVEL_LABELS,
  PLAN_STATUS_META,
  formatDate,
  formatDuration,
  type MilestoneDetail,
  type PhaseDetail,
  type PlanStatus,
  type StudyPlanDetails,
  type TaskDetail,
} from "./types"

type ConfirmTarget =
  | { kind: "plan" }
  | { kind: "phase"; phase: PhaseDetail }
  | { kind: "task"; task: TaskDetail }
  | { kind: "milestone"; milestone: MilestoneDetail }

function StatTile({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-lg font-bold text-foreground">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function StudyPlanDetailsPage() {
  const { studyPlanId } = useParams() as { studyPlanId: string }
  const router = useRouter()
  const { userDetail } = useContext(UserDetailContext)
  const userId: Id<"UserTable"> | undefined = userDetail?._id

  const data = useQuery(
    api.StudyPlanner.GetStudyPlanDetails,
    userId ? { userId, studyPlanId } : "skip"
  ) as StudyPlanDetails | null | undefined

  const setStudyPlanStatus = useMutation(api.StudyPlanner.SetStudyPlanStatus)
  const deleteStudyPlan = useMutation(api.StudyPlanner.DeleteStudyPlan)
  const deletePhase = useMutation(api.StudyPlanner.DeletePhase)
  const deleteTask = useMutation(api.StudyPlanner.DeleteTask)
  const deleteMilestone = useMutation(api.StudyPlanner.DeleteMilestone)
  const updateMilestone = useMutation(api.StudyPlanner.UpdateMilestone)
  const updateTask = useMutation(api.StudyPlanner.UpdateTask)

  const [menuOpen, setMenuOpen] = useState(false)
  const [editPlanOpen, setEditPlanOpen] = useState(false)
  const [phaseDialog, setPhaseDialog] = useState<{ open: boolean; phase?: PhaseDetail }>({ open: false })
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; phaseId?: string; task?: TaskDetail }>({ open: false })
  const [milestoneDialog, setMilestoneDialog] = useState<{ open: boolean; milestone?: MilestoneDetail }>({ open: false })
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null)
  const [busy, setBusy] = useState(false)

  if (data === null) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-14 text-center md:px-10">
        <AlertTriangle className="mx-auto size-10 text-muted-foreground" />
        <h1 className="mt-4 text-lg font-semibold text-foreground">This study plan could not be found</h1>
        <p className="mt-1 text-sm text-muted-foreground">It may have been deleted, or it doesn&apos;t belong to your account.</p>
        <Link href="/study-planner" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="size-4" /> Back to Study Planner
        </Link>
      </div>
    )
  }

  if (!data || !userId) {
    return <div className="mx-auto max-w-5xl px-6 py-14 md:px-10" />
  }

  const { plan, stats, phases, unassignedTasks, milestones } = data
  const statusMeta = PLAN_STATUS_META[plan.status as PlanStatus]
  const canPauseResume = plan.status === "active" || plan.status === "paused"
  const canArchive = plan.status !== "archived"

  async function handleConfirm() {
    if (!confirmTarget || !userId) return
    setBusy(true)
    try {
      if (confirmTarget.kind === "plan") {
        await deleteStudyPlan({ userId, studyPlanId: plan._id as Id<"studyPlans"> })
        router.push("/study-planner")
        return
      }
      if (confirmTarget.kind === "phase") {
        await deletePhase({ userId, phaseId: confirmTarget.phase._id as Id<"studyPlanPhases"> })
      } else if (confirmTarget.kind === "task") {
        await deleteTask({ userId, taskId: confirmTarget.task._id as Id<"studyPlanTasks"> })
      } else if (confirmTarget.kind === "milestone") {
        await deleteMilestone({ userId, milestoneId: confirmTarget.milestone._id as Id<"studyPlanMilestones"> })
      }
      setConfirmTarget(null)
    } finally {
      setBusy(false)
    }
  }

  function confirmCopy(): { title: string; description: React.ReactNode } {
    if (!confirmTarget) return { title: "", description: "" }
    if (confirmTarget.kind === "plan") {
      const totalTasks = phases.reduce((s, p) => s + p.totalTasks, 0) + unassignedTasks.length
      return {
        title: "Delete this study plan?",
        description: `This permanently deletes "${plan.title}" along with its ${phases.length} phase(s), ${totalTasks} task(s) and ${milestones.length} milestone(s). This can't be undone.`,
      }
    }
    if (confirmTarget.kind === "phase") {
      return {
        title: "Delete this phase?",
        description: `This also permanently deletes its ${confirmTarget.phase.totalTasks} task(s). This can't be undone.`,
      }
    }
    if (confirmTarget.kind === "task") {
      return {
        title: "Delete this task?",
        description: "This can't be undone.",
      }
    }
    return {
      title: "Delete this milestone?",
      description: "This can't be undone.",
    }
  }

  const { title: confirmTitle, description: confirmDescription } = confirmCopy()

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 md:px-10 md:py-14">
      <Link href="/study-planner" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to Study Planner
      </Link>

      <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{plan.title}</h1>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}>{statusMeta.label}</span>
            {plan.generationMethod && (
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {plan.generationMethod === "ai" ? "AI generated" : "Manually created"}
              </span>
            )}
          </div>
          {plan.learningGoal && <p className="mt-1 text-sm font-medium text-muted-foreground">{plan.learningGoal}</p>}
          {plan.description && <p className="mt-2 max-w-xl text-sm text-muted-foreground">{plan.description}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarRange className="size-3.5" />
              {formatDate(plan.startDate)} &rarr; {formatDate(plan.targetEndDate)}
            </span>
            {plan.currentLevel && plan.targetLevel && (
              <span>
                {LEVEL_LABELS[plan.currentLevel]} &rarr; {LEVEL_LABELS[plan.targetLevel]}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setEditPlanOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
          >
            <Pencil className="size-4" /> Edit Plan
          </button>

          {canPauseResume && (
            <button
              type="button"
              onClick={() => setStudyPlanStatus({ userId, studyPlanId: plan._id as Id<"studyPlans">, status: plan.status === "paused" ? "active" : "paused" })}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
            >
              {plan.status === "paused" ? (
                <>
                  <Play className="size-4" /> Resume
                </>
              ) : (
                <>
                  <Pause className="size-4" /> Pause
                </>
              )}
            </button>
          )}

          {plan.status === "archived" && (
            <button
              type="button"
              onClick={() => setStudyPlanStatus({ userId, studyPlanId: plan._id as Id<"studyPlans">, status: "active" })}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
            >
              <RotateCcw className="size-4" /> Restore
            </button>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More actions"
              className="flex size-9 items-center justify-center rounded-xl border border-border bg-card text-foreground hover:bg-muted"
            >
              <MoreHorizontal className="size-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-10 mt-2 w-44 rounded-xl border border-border bg-popover p-1.5 shadow-lg">
                {canArchive && (
                  <button
                    type="button"
                    onClick={() => {
                      setStudyPlanStatus({ userId, studyPlanId: plan._id as Id<"studyPlans">, status: "archived" })
                      setMenuOpen(false)
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground hover:bg-muted"
                  >
                    <Archive className="size-4" /> Archive Plan
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setConfirmTarget({ kind: "plan" })
                    setMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" /> Delete Plan
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatTile icon={TrendingUp} label="Overall progress" value={`${plan.progress}%`} />
        <StatTile icon={CheckCircle2} label="Completed" value={String(stats.completedTasks)} />
        <StatTile icon={ListChecks} label="Not started" value={String(stats.pendingTasks)} />
        <StatTile icon={Layers} label="In progress" value={String(stats.inProgressTasks)} />
        <StatTile icon={Clock} label="Overdue" value={String(stats.overdueTasks)} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {formatDuration(stats.totalEstimatedMinutes)} of study time total
        {stats.skippedTasks > 0 && <> &middot; {stats.skippedTasks} task(s) skipped</>}
      </p>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight text-foreground">Learning phases</h2>
        <button
          type="button"
          onClick={() => setPhaseDialog({ open: true })}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Plus className="size-3.5" /> Add phase
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {phases.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No phases yet. Add one to start organizing this plan.
          </div>
        )}
        {phases.map((phase, i) => (
          <PhaseCard
            key={phase._id}
            phase={phase}
            userId={userId}
            defaultOpen={phase.status !== "completed"}
            isFirst={i === 0}
            isLast={i === phases.length - 1}
            onEditPhase={() => setPhaseDialog({ open: true, phase })}
            onDeletePhase={() => setConfirmTarget({ kind: "phase", phase })}
            onAddTask={() => setTaskDialog({ open: true, phaseId: phase._id })}
            onEditTask={(task) => setTaskDialog({ open: true, task })}
            onDeleteTask={(task) => setConfirmTarget({ kind: "task", task })}
          />
        ))}
      </div>

      {unassignedTasks.length > 0 && (
        <>
          <div className="mt-8 flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-foreground">Other tasks</h2>
            <button
              type="button"
              onClick={() => setTaskDialog({ open: true })}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Plus className="size-3.5" /> Add task
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-2.5">
            {unassignedTasks.map((task) => (
              <TaskRow
                key={task._id}
                task={task}
                onEdit={() => setTaskDialog({ open: true, task })}
                onDelete={() => setConfirmTarget({ kind: "task", task })}
                onToggleDone={() =>
                  updateTask({
                    userId,
                    taskId: task._id as Id<"studyPlanTasks">,
                    status: task.status === "completed" ? "pending" : "completed",
                  })
                }
              />
            ))}
          </div>
        </>
      )}

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight text-foreground">Milestones</h2>
        <button
          type="button"
          onClick={() => setMilestoneDialog({ open: true })}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Plus className="size-3.5" /> Add milestone
        </button>
      </div>
      <div className="mt-4 flex flex-col divide-y divide-border rounded-2xl border border-border bg-card shadow-sm">
        {milestones.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">No milestones yet.</p>}
        {milestones.map((m) => {
          const achieved = m.status === "achieved"
          return (
            <div key={m._id} className="flex items-center gap-3 px-5 py-3.5">
              <button
                type="button"
                onClick={() => updateMilestone({ userId, milestoneId: m._id as Id<"studyPlanMilestones">, status: achieved ? "pending" : "achieved" })}
                aria-label={achieved ? "Reopen milestone" : "Mark milestone achieved"}
                className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                  achieved ? "bg-success/15 text-success" : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
                }`}
              >
                <Flag className="size-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${achieved ? "text-muted-foreground line-through" : "text-foreground"}`}>{m.title}</p>
                <p className="text-xs text-muted-foreground">
                  Target: {formatDate(m.targetDate)}
                  {m.completionCriteria && <> &middot; {m.completionCriteria}</>}
                </p>
              </div>
              {achieved && <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">Achieved</span>}
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMilestoneDialog({ open: true, milestone: m })}
                  aria-label="Edit milestone"
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmTarget({ kind: "milestone", milestone: m })}
                  aria-label="Delete milestone"
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="h-10" />

      <EditPlanDialog open={editPlanOpen} onOpenChange={setEditPlanOpen} userId={userId} plan={plan} />

      <PhaseFormDialog
        open={phaseDialog.open}
        onOpenChange={(open) => setPhaseDialog({ open })}
        userId={userId}
        studyPlanId={plan._id as Id<"studyPlans">}
        phase={phaseDialog.phase}
      />

      <TaskFormDialog
        open={taskDialog.open}
        onOpenChange={(open) => setTaskDialog({ open })}
        userId={userId}
        studyPlanId={plan._id as Id<"studyPlans">}
        phaseId={taskDialog.phaseId as Id<"studyPlanPhases"> | undefined}
        task={taskDialog.task}
      />

      <MilestoneFormDialog
        open={milestoneDialog.open}
        onOpenChange={(open) => setMilestoneDialog({ open })}
        userId={userId}
        studyPlanId={plan._id as Id<"studyPlans">}
        milestone={milestoneDialog.milestone}
      />

      <ConfirmDialog
        open={!!confirmTarget}
        onOpenChange={(open) => { if (!open) setConfirmTarget(null) }}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={handleConfirm}
      />
    </div>
  )
}

export default StudyPlanDetailsPage
