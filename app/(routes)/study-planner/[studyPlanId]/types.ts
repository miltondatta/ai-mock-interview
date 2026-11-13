export type Level = "beginner" | "intermediate" | "advanced"
export type PlanStatus = "active" | "paused" | "completed" | "archived"
export type PhaseStatus = "not_started" | "in_progress" | "completed"
export type TaskStatus = "pending" | "in_progress" | "completed" | "skipped"
export type Priority = "low" | "medium" | "high"
export type MilestoneStatus = "pending" | "achieved"

export interface TaskDetail {
  _id: string
  title: string
  description?: string
  status: TaskStatus
  priority: Priority
  estimatedDuration?: number
  scheduledDate?: string
  scheduledTime?: string
  completionCriteria?: string
  completedAt?: number
  order: number
}

export interface PhaseDetail {
  _id: string
  title: string
  description?: string
  order: number
  startDate?: string
  endDate?: string
  objectives: string[]
  status: PhaseStatus
  totalTasks: number
  completedTasks: number
  progress: number
  tasks: TaskDetail[]
}

export interface MilestoneDetail {
  _id: string
  title: string
  description?: string
  targetDate?: string
  completionCriteria?: string
  status: MilestoneStatus
}

export interface PlanDetail {
  _id: string
  title: string
  description?: string
  learningGoal?: string
  status: PlanStatus
  startDate?: string
  targetEndDate?: string
  currentLevel?: Level
  targetLevel?: Level
  availableHoursPerDay?: number
  generationMethod?: "ai" | "manual"
  progress: number
  totalTasks: number
  completedTasks: number
  createdAt: number
  updatedAt: number
}

export interface PlanStats {
  pendingTasks: number
  inProgressTasks: number
  completedTasks: number
  skippedTasks: number
  overdueTasks: number
  totalEstimatedMinutes: number
}

export interface StudyPlanDetails {
  plan: PlanDetail
  stats: PlanStats
  phases: PhaseDetail[]
  unassignedTasks: TaskDetail[]
  milestones: MilestoneDetail[]
}

export const LEVEL_LABELS: Record<Level, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
}

export const PLAN_STATUS_META: Record<PlanStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-success/15 text-success" },
  paused: { label: "Paused", className: "bg-warning/20 text-warning-foreground" },
  completed: { label: "Completed", className: "bg-primary/10 text-primary" },
  archived: { label: "Archived", className: "bg-muted text-muted-foreground" },
}

export const PHASE_STATUS_META: Record<PhaseStatus, { label: string; className: string }> = {
  not_started: { label: "Not Started", className: "bg-muted text-muted-foreground" },
  in_progress: { label: "In Progress", className: "bg-primary/10 text-primary" },
  completed: { label: "Completed", className: "bg-success/15 text-success" },
}

export const TASK_STATUS_META: Record<TaskStatus, { label: string; className: string }> = {
  pending: { label: "Not Started", className: "bg-muted text-muted-foreground" },
  in_progress: { label: "In Progress", className: "bg-primary/10 text-primary" },
  completed: { label: "Completed", className: "bg-success/15 text-success" },
  skipped: { label: "Skipped", className: "bg-warning/20 text-warning-foreground" },
}

export const PRIORITY_META: Record<Priority, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-muted text-muted-foreground" },
  medium: { label: "Medium", className: "bg-warning/20 text-warning-foreground" },
  high: { label: "High", className: "bg-destructive/10 text-destructive" },
}

export function formatDate(iso?: string): string {
  if (!iso) return "No date"
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export function formatDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return "0 min"
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} min`
  if (minutes === 0) return `${hours} hr`
  return `${hours} hr ${minutes} min`
}
