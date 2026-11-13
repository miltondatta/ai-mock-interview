export type PlanStatus = "active" | "paused" | "completed" | "archived";

export interface StudyPlanNextTask {
  id: string;
  title: string;
  scheduledDate?: string;
}

export interface StudyPlanSummary {
  _id: string;
  title: string;
  description?: string;
  learningGoal?: string;
  status: PlanStatus;
  startDate?: string;
  targetEndDate?: string;
  totalTasks: number;
  completedTasks: number;
  progress: number;
  nextTask?: StudyPlanNextTask;
  createdAt: number;
}

export interface DashboardStats {
  totalPlans: number;
  activePlans: number;
  completedPlans: number;
  pausedPlans: number;
  archivedPlans: number;
  overallProgress: number;
}

export const STATUS_META: Record<PlanStatus, { label: string; badgeClass: string }> = {
  active: { label: "Active", badgeClass: "bg-success/15 text-success" },
  paused: { label: "Paused", badgeClass: "bg-warning/20 text-warning-foreground" },
  completed: { label: "Completed", badgeClass: "bg-primary/10 text-primary" },
  archived: { label: "Archived", badgeClass: "bg-muted text-muted-foreground" },
};
