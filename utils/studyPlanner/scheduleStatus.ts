// Shared status logic for the Study Planner's schedule views (Day/Week/Month)
// and the plan detail page's phase task rows. Centralized so "what counts as
// overdue" is judged the same way everywhere, rather than three slightly
// different inline copies drifting apart.

export type TaskStatus = "pending" | "in_progress" | "completed" | "skipped"
export type DisplayStatus = "completed" | "in_progress" | "overdue" | "today" | "upcoming" | "skipped"

export interface StatusableTask {
  status: TaskStatus
  scheduledDate?: string
}

export function isTaskOverdue(task: StatusableTask, todayKey: string): boolean {
  return (task.status === "pending" || task.status === "in_progress") && !!task.scheduledDate && task.scheduledDate < todayKey
}

export function getDisplayStatus(task: StatusableTask, todayKey: string): DisplayStatus {
  if (task.status === "completed") return "completed"
  if (task.status === "skipped") return "skipped"
  if (isTaskOverdue(task, todayKey)) return "overdue"
  if (task.status === "in_progress") return "in_progress"
  if (task.scheduledDate === todayKey) return "today"
  return "upcoming"
}

export const STATUS_META: Record<DisplayStatus, { label: string; dot: string; badge: string }> = {
  completed: { label: "Completed", dot: "bg-success", badge: "bg-success/15 text-success" },
  in_progress: { label: "In progress", dot: "bg-primary", badge: "bg-primary/10 text-primary" },
  overdue: { label: "Overdue", dot: "bg-destructive", badge: "bg-destructive/10 text-destructive" },
  today: { label: "Today", dot: "bg-primary", badge: "bg-primary/10 text-primary" },
  upcoming: { label: "Upcoming", dot: "bg-muted-foreground/40", badge: "bg-muted text-muted-foreground" },
  skipped: { label: "Skipped", dot: "bg-warning", badge: "bg-warning/20 text-warning-foreground" },
}
