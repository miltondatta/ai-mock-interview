"use client"

import React from "react"
import Link from "next/link"
import { addDays, isSameDay, getDisplayStatus, toDateKey, STATUS_META, type ScheduleTask } from "./types"

export function WeekView({ weekStart, tasks }: { weekStart: Date; tasks: ScheduleTask[] }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today = new Date()
  const todayKey = toDateKey(today)

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day) => {
        const dayKey = toDateKey(day)
        const dayTasks = tasks
          .filter((t) => t.scheduledDate === dayKey)
          .sort((a, b) => (a.scheduledTime ?? "99:99").localeCompare(b.scheduledTime ?? "99:99"))
        const isToday = isSameDay(day, today)

        return (
          <div
            key={dayKey}
            className={`flex flex-col gap-2 rounded-2xl border p-3 ${isToday ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}
          >
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {day.toLocaleDateString(undefined, { weekday: "short" })}
              </p>
              <p className={`text-sm font-bold ${isToday ? "text-primary" : "text-foreground"}`}>{day.getDate()}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              {dayTasks.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">No tasks</p>
              ) : (
                dayTasks.map((task) => {
                  const status = getDisplayStatus(task, todayKey)
                  const meta = STATUS_META[status]
                  return (
                    <Link
                      key={task._id}
                      href={`/study-planner/tasks/${task._id}`}
                      className="rounded-lg bg-muted/60 px-2.5 py-2 transition-colors hover:bg-muted"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`size-1.5 shrink-0 rounded-full ${meta.dot}`} />
                        <p
                          className={`truncate text-xs font-medium ${status === "completed" ? "text-muted-foreground line-through" : "text-foreground"}`}
                          title={task.title}
                        >
                          {task.title}
                        </p>
                      </div>
                      <p className="mt-0.5 truncate pl-3 text-[11px] text-muted-foreground">{task.planTitle}</p>
                    </Link>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default WeekView
