"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useMutation } from "convex/react"
import { Clock, CalendarClock, CheckCircle2, ExternalLink } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import {
  PRIORITY_META,
  STATUS_META,
  formatDayLabel,
  getDisplayStatus,
  toDateKey,
  type ScheduleTask,
} from "./types"

function RescheduleControl({
  task,
  userId,
  onDone,
}: {
  task: ScheduleTask
  userId: Id<"UserTable">
  onDone: () => void
}) {
  const updateTask = useMutation(api.StudyPlanner.UpdateTask)
  const [date, setDate] = useState(task.scheduledDate)
  const [time, setTime] = useState(task.scheduledTime ?? "")

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/40"
      />
      <input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/40"
      />
      <button
        type="button"
        onClick={async () => {
          await updateTask({
            userId,
            taskId: task._id as Id<"studyPlanTasks">,
            scheduledDate: date || null,
            scheduledTime: date && time ? time : null,
          })
          onDone()
        }}
        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
      >
        Save
      </button>
      <button type="button" onClick={onDone} className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
        Cancel
      </button>
    </div>
  )
}

export function DayView({ anchorDate, tasks, userId }: { anchorDate: Date; tasks: ScheduleTask[]; userId: Id<"UserTable"> }) {
  const dayKey = toDateKey(anchorDate)
  const todayKey = toDateKey(new Date())
  const [reschedulingId, setReschedulingId] = useState<string | null>(null)
  const dayTasks = tasks
    .filter((t) => t.scheduledDate === dayKey)
    .sort((a, b) => (a.scheduledTime ?? "99:99").localeCompare(b.scheduledTime ?? "99:99"))

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-base font-bold text-foreground">{formatDayLabel(anchorDate)}</h3>

      {dayTasks.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 py-10 text-center">
          <CheckCircle2 className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Nothing scheduled</p>
          <p className="text-sm text-muted-foreground">Enjoy the day off, or schedule a task to get ahead.</p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {dayTasks.map((task) => {
            const status = getDisplayStatus(task, todayKey)
            const statusMeta = STATUS_META[status]
            const priorityMeta = PRIORITY_META[task.priority]
            return (
              <div key={task._id} className="rounded-xl border border-border p-3.5">
                <div className="flex items-center gap-3">
                  <span className={`size-2.5 shrink-0 rounded-full ${statusMeta.dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-medium ${status === "completed" ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {task.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {task.planTitle}
                      {task.phaseTitle && <> &middot; {task.phaseTitle}</>}
                    </p>
                  </div>
                  {task.scheduledTime && (
                    <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex">{task.scheduledTime}</span>
                  )}
                  {task.estimatedDuration !== undefined && (
                    <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex">
                      <Clock className="size-3.5" /> {task.estimatedDuration} min
                    </span>
                  )}
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${priorityMeta.className}`}>{priorityMeta.label}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${statusMeta.badge}`}>{statusMeta.label}</span>
                  <button
                    type="button"
                    onClick={() => setReschedulingId((id) => (id === task._id ? null : task._id))}
                    aria-label="Reschedule task"
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <CalendarClock className="size-4" />
                  </button>
                  <Link
                    href={`/study-planner/tasks/${task._id}`}
                    aria-label="View task details"
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ExternalLink className="size-4" />
                  </Link>
                </div>
                {reschedulingId === task._id && (
                  <RescheduleControl task={task} userId={userId} onDone={() => setReschedulingId(null)} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default DayView
