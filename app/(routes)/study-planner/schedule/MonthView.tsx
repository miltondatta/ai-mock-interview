"use client"

import React from "react"
import { addDays, isSameDay, getDisplayStatus, toDateKey, STATUS_META, type ScheduleTask } from "./types"

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function MonthView({
  anchorDate,
  tasks,
  onSelectDay,
}: {
  anchorDate: Date
  tasks: ScheduleTask[]
  onSelectDay: (date: Date) => void
}) {
  const year = anchorDate.getFullYear()
  const month = anchorDate.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7
  const gridStart = addDays(firstOfMonth, -firstWeekday)
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const today = new Date()
  const todayKey = toDateKey(today)

  const tasksByDay = new Map<string, ScheduleTask[]>()
  for (const task of tasks) {
    const list = tasksByDay.get(task.scheduledDate)
    if (list) list.push(task)
    else tasksByDay.set(task.scheduledDate, [task])
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="grid grid-cols-7 gap-2 pb-2 text-center text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {WEEKDAY_LABELS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {cells.map((day) => {
          const inMonth = day.getMonth() === month
          const isToday = isSameDay(day, today)
          const dayKey = toDateKey(day)
          const dayTasks = (tasksByDay.get(dayKey) ?? []).sort((a, b) => (a.scheduledTime ?? "99:99").localeCompare(b.scheduledTime ?? "99:99"))
          const visible = dayTasks.slice(0, 3)
          const extra = dayTasks.length - visible.length

          return (
            <button
              key={dayKey}
              type="button"
              onClick={() => onSelectDay(day)}
              className={`flex min-h-24 flex-col items-start gap-1.5 rounded-xl border p-2 text-left transition-colors ${
                isToday ? "border-primary/60 bg-primary/5" : inMonth ? "border-border bg-background hover:bg-muted/50" : "border-transparent bg-transparent opacity-40 hover:opacity-70"
              }`}
            >
              <span className={`text-xs font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>{day.getDate()}</span>
              <div className="flex w-full flex-col gap-1">
                {visible.map((task) => {
                  const meta = STATUS_META[getDisplayStatus(task, todayKey)]
                  return (
                    <span key={task._id} className="flex items-center gap-1">
                      <span className={`size-1.5 shrink-0 rounded-full ${meta.dot}`} />
                      <span className="truncate text-[11px] text-muted-foreground">{task.title}</span>
                    </span>
                  )
                })}
                {extra > 0 && <span className="text-[11px] font-medium text-primary">+{extra} more</span>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default MonthView
