"use client"

import React, { useContext, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Check,
  Clock,
  CalendarClock,
  BookOpen,
  Layers,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
} from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import TaskFormDialog from "../../[studyPlanId]/TaskFormDialog"
import ConfirmDialog from "../../[studyPlanId]/ConfirmDialog"
import { PRIORITY_META, TASK_STATUS_META, formatDate, formatDuration } from "../../[studyPlanId]/types"

interface TaskDetailsResult {
  task: {
    _id: string
    title: string
    description?: string
    status: "pending" | "in_progress" | "completed" | "skipped"
    priority: "low" | "medium" | "high"
    estimatedDuration?: number
    scheduledDate?: string
    scheduledTime?: string
    completionCriteria?: string
    completedAt?: number
    createdAt: number
  }
  plan: { _id: string; title: string; status: string } | null
  phase: { _id: string; title: string; objectives: string[] } | null
}

function TaskDetailsPage() {
  const { taskId } = useParams() as { taskId: string }
  const router = useRouter()
  const { userDetail } = useContext(UserDetailContext)
  const userId: Id<"UserTable"> | undefined = userDetail?._id

  const data = useQuery(
    api.StudyPlanner.GetTaskDetails,
    userId ? { userId, taskId } : "skip"
  ) as TaskDetailsResult | null | undefined

  const updateTask = useMutation(api.StudyPlanner.UpdateTask)
  const deleteTask = useMutation(api.StudyPlanner.DeleteTask)

  // M5 - optional, read-only: any AI Study Room sessions already started
  // from this task ("show relevant Study Room session references within
  // the corresponding Study Planner task"). Study Planner never writes to
  // Study Room's tables - this is a one-directional read of Study Room's
  // own public query.
  const studyRoomLinks = useQuery(
    api.StudyRoom.GetStudyRoomsForStudyTask,
    userId && data?.task._id ? { userId, studyTaskId: data.task._id as Id<"studyPlanTasks"> } : "skip"
  )

  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (data === null) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14 text-center md:px-10">
        <AlertTriangle className="mx-auto size-10 text-muted-foreground" />
        <h1 className="mt-4 text-lg font-semibold text-foreground">This task could not be found</h1>
        <p className="mt-1 text-sm text-muted-foreground">It may have been deleted, or it doesn&apos;t belong to your account.</p>
        <Link href="/study-planner" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="size-4" /> Back to Study Planner
        </Link>
      </div>
    )
  }

  if (!data || !userId) {
    return <div className="mx-auto max-w-2xl px-6 py-14 md:px-10" />
  }

  const { task, plan, phase } = data
  const statusMeta = TASK_STATUS_META[task.status]
  const priorityMeta = PRIORITY_META[task.priority]
  const isDone = task.status === "completed"
  const backHref = plan ? `/study-planner/${plan._id}` : "/study-planner"

  const studyRoomParams = new URLSearchParams({
    source: "studyPlanner",
    topic: task.title,
    ...(task.description ? { description: task.description } : {}),
    ...(plan ? { studyPlanId: plan._id, planTitle: plan.title } : {}),
    studyTaskId: task._id,
  })

  async function toggleDone() {
    await updateTask({
      userId: userId!,
      taskId: task._id as Id<"studyPlanTasks">,
      status: isDone ? "pending" : "completed",
    })
  }

  async function handleDelete() {
    setBusy(true)
    try {
      await deleteTask({ userId: userId!, taskId: task._id as Id<"studyPlanTasks"> })
      router.push(backHref)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 md:px-10 md:py-14">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to {plan ? plan.title : "Study Planner"}
      </Link>

      <div className="mt-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}>{statusMeta.label}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityMeta.className}`}>{priorityMeta.label} priority</span>
          {plan ? (
            <Link href={`/study-planner/${plan._id}`} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              <BookOpen className="size-3.5" /> {plan.title}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <BookOpen className="size-3.5" /> Parent plan unavailable
            </span>
          )}
          {phase && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Layers className="size-3.5" /> {phase.title}
            </span>
          )}
        </div>

        <h1 className={`mt-3 text-xl font-bold tracking-tight sm:text-2xl ${isDone ? "text-muted-foreground line-through" : "text-foreground"}`}>
          {task.title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
          {task.estimatedDuration !== undefined && (
            <span className="flex items-center gap-1.5">
              <Clock className="size-4" /> {formatDuration(task.estimatedDuration)}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <CalendarClock className="size-4" />
            {task.scheduledDate ? (
              <>
                {formatDate(task.scheduledDate)}
                {task.scheduledTime && ` at ${task.scheduledTime}`}
              </>
            ) : (
              "Not scheduled"
            )}
          </span>
        </div>

        {task.description && <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{task.description}</p>}

        {phase && phase.objectives.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Learning objectives (from {phase.title})</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm text-foreground">
              {phase.objectives.map((o) => (
                <li key={o} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                  {o}
                </li>
              ))}
            </ul>
          </div>
        )}

        {task.completionCriteria && (
          <div className="mt-5 rounded-xl bg-muted/50 p-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Completion criteria</p>
            <p className="mt-1.5 text-sm text-foreground">{task.completionCriteria}</p>
          </div>
        )}

        {isDone && task.completedAt && (
          <p className="mt-4 flex items-center gap-1.5 text-xs font-medium text-success">
            <CheckCircle2 className="size-3.5" /> Completed on {new Date(task.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Want a tutor to walk you through it?</p>
            <p className="text-sm text-muted-foreground">
              Optional &middot; Opens the AI Study Room in a new tab with this task&apos;s context. You can also complete this task
              on your own without it, and decide whether to mark it complete when you&apos;re done.
            </p>
          </div>
        </div>
        <a
          href={`/study-room/create?${studyRoomParams.toString()}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-primary/40 bg-card px-4 py-2.5 text-sm font-semibold text-primary shadow-xs transition-colors hover:bg-primary/10"
        >
          <Sparkles className="size-4" /> Start Learning in AI Study Room
        </a>

        {studyRoomLinks && studyRoomLinks.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-primary/20 pt-3">
            <p className="text-xs font-semibold text-muted-foreground">Study Room sessions started from this task</p>
            {studyRoomLinks.map((link) => (
              <a
                key={link.studyRoomId}
                href={link.latestSession ? `/study-room/session/${link.latestSession._id}` : `/study-room/${link.studyRoomId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <ExternalLink className="size-3.5" /> {link.roomTitle}
                {link.latestSession?.status === "in_progress" ? " (in progress)" : ""}
                {link.latestSession?.summaryStatus === "ready" ? " - summary ready" : ""}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            disabled={!plan}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Pencil className="size-4" /> Edit Task
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-4" /> Delete Task
          </button>
        </div>

        <button
          type="button"
          onClick={toggleDone}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90 ${
            isDone ? "bg-success text-success-foreground" : "bg-primary text-primary-foreground"
          }`}
        >
          <Check className="size-4" /> {isDone ? "Completed – Reopen Task" : "Mark Task Complete"}
        </button>
      </div>

      <div className="h-10" />

      {plan && (
        <TaskFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          userId={userId}
          studyPlanId={plan._id as Id<"studyPlans">}
          task={task}
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this task?"
        description="This can't be undone."
        confirmLabel="Delete"
        busy={busy}
        onConfirm={handleDelete}
      />
    </div>
  )
}

export default TaskDetailsPage
