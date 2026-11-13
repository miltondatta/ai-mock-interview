"use client"

import React, { useEffect, useState } from "react"
import { useMutation } from "convex/react"
import { Loader2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { PRIORITY_META, TASK_STATUS_META, type Priority, type TaskDetail, type TaskStatus } from "./types"

interface TaskFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: Id<"UserTable">
  studyPlanId: Id<"studyPlans">
  phaseId?: Id<"studyPlanPhases">
  // "order" is never read by this dialog (only the task list that renders it
  // cares about ordering), so callers that don't have it on hand - like the
  // standalone Task Details page - can still reuse this component as-is.
  task?: Omit<TaskDetail, "order">
}

const PRIORITIES: Priority[] = ["low", "medium", "high"]
const STATUSES: TaskStatus[] = ["pending", "in_progress", "completed", "skipped"]

function TaskFormDialog({ open, onOpenChange, userId, studyPlanId, phaseId, task }: TaskFormDialogProps) {
  const createTask = useMutation(api.StudyPlanner.CreateTask)
  const updateTask = useMutation(api.StudyPlanner.UpdateTask)
  const isEdit = !!task

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<Priority>("medium")
  const [status, setStatus] = useState<TaskStatus>("pending")
  const [estimatedDuration, setEstimatedDuration] = useState("30")
  const [scheduledDate, setScheduledDate] = useState("")
  const [scheduledTime, setScheduledTime] = useState("")
  const [completionCriteria, setCompletionCriteria] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(task?.title ?? "")
    setDescription(task?.description ?? "")
    setPriority(task?.priority ?? "medium")
    setStatus(task?.status ?? "pending")
    setEstimatedDuration(task?.estimatedDuration ? String(task.estimatedDuration) : "30")
    setScheduledDate(task?.scheduledDate ?? "")
    setScheduledTime(task?.scheduledTime ?? "")
    setCompletionCriteria(task?.completionCriteria ?? "")
    setError(null)
  }, [open, task])

  async function handleSave() {
    if (saving) return
    setError(null)
    if (!title.trim()) {
      setError("Please give this task a title.")
      return
    }
    const duration = Number(estimatedDuration)

    setSaving(true)
    try {
      if (isEdit && task) {
        await updateTask({
          userId,
          taskId: task._id as Id<"studyPlanTasks">,
          title: title.trim(),
          description: description.trim(),
          status,
          priority,
          estimatedDuration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
          // null (not undefined) explicitly clears a date/time that was removed.
          scheduledDate: scheduledDate ? scheduledDate : null,
          scheduledTime: scheduledDate && scheduledTime ? scheduledTime : null,
          completionCriteria: completionCriteria.trim(),
        })
      } else {
        await createTask({
          userId,
          studyPlanId,
          phaseId,
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          estimatedDuration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
          scheduledDate: scheduledDate || undefined,
          scheduledTime: scheduledDate && scheduledTime ? scheduledTime : undefined,
          completionCriteria: completionCriteria.trim() || undefined,
        })
      }
      onOpenChange(false)
    } catch (e) {
      setError("Unable to save this task right now. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit task" : "Add task"}</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto py-1">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">Task title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Build a CLI expense tracker" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="resize-none" />
          </div>

          {isEdit && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">Status</label>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => {
                  const meta = TASK_STATUS_META[s]
                  const selected = status === s
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity ${meta.className} ${selected ? "opacity-100 ring-1 ring-current" : "opacity-50"}`}
                    >
                      {meta.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">Priority</label>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITIES.map((p) => {
                const meta = PRIORITY_META[p]
                const selected = priority === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity ${meta.className} ${selected ? "opacity-100 ring-1 ring-current" : "opacity-50"}`}
                  >
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">Duration (min)</label>
              <Input type="number" min={5} step={5} value={estimatedDuration} onChange={(e) => setEstimatedDuration(e.target.value)} />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-sm font-semibold text-foreground">Scheduled date</label>
                {scheduledDate && (
                  <button
                    type="button"
                    onClick={() => {
                      setScheduledDate("")
                      setScheduledTime("")
                    }}
                    className="text-xs font-medium text-muted-foreground hover:text-destructive"
                  >
                    Clear
                  </button>
                )}
              </div>
              <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            </div>
          </div>

          {scheduledDate && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">Scheduled time (optional)</label>
              <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">Completion criteria</label>
            <Input
              value={completionCriteria}
              onChange={(e) => setCompletionCriteria(e.target.value)}
              placeholder="What does done look like?"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose disabled={saving} render={(props) => <Button {...props} variant="outline" />}>
            Cancel
          </DialogClose>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2Icon className="animate-spin" />}
            {saving ? "Saving..." : isEdit ? "Save changes" : "Add task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default TaskFormDialog
