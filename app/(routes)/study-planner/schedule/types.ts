export type TaskStatus = "pending" | "in_progress" | "completed" | "skipped"
export type Priority = "low" | "medium" | "high"
export type DisplayStatus = "completed" | "overdue" | "today" | "upcoming" | "skipped"

export interface ScheduleTask {
  _id: string
  title: string
  status: TaskStatus
  priority: Priority
  estimatedDuration?: number
  scheduledDate: string
  scheduledTime?: string
  studyPlanId: string
  planTitle: string
  phaseId?: string
  phaseTitle?: string
}

// All calendar-grid arithmetic here uses the LOCAL Date constructor
// (new Date(year, month, day)) and local getters, never `new Date(isoString)`
// - parsing a bare "YYYY-MM-DD" string that way is UTC-midnight, which can
// silently shift a day backward in timezones behind UTC. Matching a task to
// a calendar cell always compares the raw "YYYY-MM-DD" string the task
// actually stores, never a re-parsed Date, so there's nothing to shift.

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - day)
  return d
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b)
}

export function todayDate(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function getDisplayStatus(task: ScheduleTask, todayKey: string): DisplayStatus {
  if (task.status === "completed") return "completed"
  if (task.status === "skipped") return "skipped"
  if (task.scheduledDate < todayKey) return "overdue"
  if (task.scheduledDate === todayKey) return "today"
  return "upcoming"
}

export const STATUS_META: Record<DisplayStatus, { label: string; dot: string; badge: string }> = {
  completed: { label: "Completed", dot: "bg-success", badge: "bg-success/15 text-success" },
  overdue: { label: "Overdue", dot: "bg-destructive", badge: "bg-destructive/10 text-destructive" },
  today: { label: "Today", dot: "bg-primary", badge: "bg-primary/10 text-primary" },
  upcoming: { label: "Upcoming", dot: "bg-muted-foreground/40", badge: "bg-muted text-muted-foreground" },
  skipped: { label: "Skipped", dot: "bg-warning", badge: "bg-warning/20 text-warning-foreground" },
}

export const PRIORITY_META: Record<Priority, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-muted text-muted-foreground" },
  medium: { label: "Medium", className: "bg-warning/20 text-warning-foreground" },
  high: { label: "High", className: "bg-destructive/10 text-destructive" },
}

export function formatDayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
}
