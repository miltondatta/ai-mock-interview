"use client"

import React, { useContext, useMemo, useState } from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import DayView from "./DayView"
import WeekView from "./WeekView"
import MonthView from "./MonthView"
import { addDays, startOfWeek, toDateKey, todayDate, STATUS_META, type DisplayStatus, type ScheduleTask } from "./types"

type ViewMode = "day" | "week" | "month"

const VIEWS: { value: ViewMode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
]

function StudySchedulePage() {
  const { userDetail } = useContext(UserDetailContext)
  const userId: Id<"UserTable"> | undefined = userDetail?._id

  const [view, setView] = useState<ViewMode>("week")
  const [anchorDate, setAnchorDate] = useState<Date>(todayDate())

  const { rangeStart, rangeEnd, rangeLabel } = useMemo(() => {
    if (view === "day") {
      return {
        rangeStart: anchorDate,
        rangeEnd: anchorDate,
        rangeLabel: anchorDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
      }
    }
    if (view === "week") {
      const monday = startOfWeek(anchorDate)
      const sunday = addDays(monday, 6)
      return {
        rangeStart: monday,
        rangeEnd: sunday,
        rangeLabel: `${monday.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${sunday.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`,
      }
    }
    const year = anchorDate.getFullYear()
    const month = anchorDate.getMonth()
    const firstOfMonth = new Date(year, month, 1)
    const firstWeekday = (firstOfMonth.getDay() + 6) % 7
    const gridStart = addDays(firstOfMonth, -firstWeekday)
    const gridEnd = addDays(gridStart, 41)
    return {
      rangeStart: gridStart,
      rangeEnd: gridEnd,
      rangeLabel: anchorDate.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    }
  }, [view, anchorDate])

  const tasks = useQuery(
    api.StudyPlanner.GetScheduleTasks,
    userId ? { userId, startDate: toDateKey(rangeStart), endDate: toDateKey(rangeEnd) } : "skip"
  ) as ScheduleTask[] | undefined

  function shift(delta: number) {
    if (view === "day") setAnchorDate((d) => addDays(d, delta))
    else if (view === "week") setAnchorDate((d) => addDays(d, delta * 7))
    else setAnchorDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1))
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <Link href="/study-planner" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to Study Planner
      </Link>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground sm:text-3xl">Study Schedule</h1>
          <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">See your scheduled study tasks by day, week or month.</p>
        </div>
        <div className="inline-flex w-full rounded-xl border border-border bg-muted/50 p-1 sm:w-auto">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => setView(v.value)}
              className={`flex-1 rounded-lg px-5 py-2 text-sm font-semibold transition-colors sm:flex-none sm:px-8 ${
                view === v.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label="Previous"
            className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-muted"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label="Next"
            className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-muted"
          >
            <ChevronRight className="size-4" />
          </button>
          <h2 className="ml-2 text-base font-bold text-foreground sm:text-lg">{rangeLabel}</h2>
        </div>
        <button
          type="button"
          onClick={() => setAnchorDate(todayDate())}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          <CalendarDays className="size-4" /> Today
        </button>
      </div>

      <div className="mt-5">
        {!userId || tasks === undefined ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Loading schedule...</div>
        ) : (
          <>
            {view === "day" && <DayView anchorDate={anchorDate} tasks={tasks} userId={userId} />}
            {view === "week" && <WeekView weekStart={startOfWeek(anchorDate)} tasks={tasks} />}
            {view === "month" && (
              <MonthView
                anchorDate={anchorDate}
                tasks={tasks}
                onSelectDay={(date) => {
                  setAnchorDate(date)
                  setView("day")
                }}
              />
            )}
          </>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
        {(Object.keys(STATUS_META) as DisplayStatus[]).map((status) => {
          const meta = STATUS_META[status]
          return (
            <span key={status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`size-2 shrink-0 rounded-full ${meta.dot}`} /> {meta.label}
            </span>
          )
        })}
      </div>

      <div className="h-10" />
    </div>
  )
}

export default StudySchedulePage
