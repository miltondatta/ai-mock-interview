"use client"

import React, { useState } from "react"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"

// Shared by DayView, WeekView and PhaseCard's task rows. Manually moving a
// task's date/time here marks it scheduleLockedByUser, so the Study Planner's
// "Regenerate Schedule" distribution engine (convex/StudyPlanner.ts
// RedistributeSchedule) leaves it alone on future runs unless the candidate
// explicitly opts back in.
export function RescheduleControl({
  task,
  userId,
  onDone,
}: {
  task: { _id: string; scheduledDate?: string; scheduledTime?: string }
  userId: Id<"UserTable">
  onDone: () => void
}) {
  const updateTask = useMutation(api.StudyPlanner.UpdateTask)
  const [date, setDate] = useState(task.scheduledDate ?? "")
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
            scheduleLockedByUser: true,
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

export default RescheduleControl
