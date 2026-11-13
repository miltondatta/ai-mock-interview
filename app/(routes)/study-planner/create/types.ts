export type Level = "beginner" | "intermediate" | "advanced";
export type Priority = "low" | "medium" | "high";

export const LEVELS: { value: Level; label: string; hint: string }[] = [
  { value: "beginner", label: "Beginner", hint: "Little to no experience" },
  { value: "intermediate", label: "Intermediate", hint: "Comfortable with the basics" },
  { value: "advanced", label: "Advanced", hint: "Ready for advanced topics" },
];

export const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const LEARNING_PREFERENCES = [
  "Videos",
  "Reading",
  "Hands-on practice",
  "Quizzes & flashcards",
  "Live mentorship",
  "Project-based",
] as const;

export const PRIORITY_META: Record<Priority, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-muted text-muted-foreground" },
  medium: { label: "Medium", className: "bg-warning/20 text-warning-foreground" },
  high: { label: "High", className: "bg-destructive/10 text-destructive" },
};

export interface TaskDraft {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  estimatedDuration: number;
  scheduledDate: string;
  completionCriteria: string;
}

export interface PhaseDraft {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  objectives: string[];
  tasks: TaskDraft[];
}

export interface MilestoneDraft {
  id: string;
  title: string;
  description: string;
  targetDate: string;
  completionCriteria: string;
}

export interface PlanDraft {
  title: string;
  description: string;
  learningGoal: string;
  currentLevel: Level | null;
  targetLevel: Level | null;
  startDate: string;
  targetEndDate: string;
  phases: PhaseDraft[];
  milestones: MilestoneDraft[];
}

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Date.now()}`;
}

export function emptyTask(): TaskDraft {
  return {
    id: nextId("task"),
    title: "",
    description: "",
    priority: "medium",
    estimatedDuration: 30,
    scheduledDate: "",
    completionCriteria: "",
  };
}

export function emptyPhase(order: number): PhaseDraft {
  return {
    id: nextId("phase"),
    title: `Phase ${order + 1}`,
    description: "",
    startDate: "",
    endDate: "",
    objectives: [],
    tasks: [emptyTask()],
  };
}

export function emptyMilestone(): MilestoneDraft {
  return {
    id: nextId("milestone"),
    title: "",
    description: "",
    targetDate: "",
    completionCriteria: "",
  };
}

export function emptyPlanDraft(): PlanDraft {
  return {
    title: "",
    description: "",
    learningGoal: "",
    currentLevel: null,
    targetLevel: null,
    startDate: "",
    targetEndDate: "",
    phases: [emptyPhase(0)],
    milestones: [],
  };
}

// API response shape from /api/study-planner/generate (utils/studyPlanner/schemas.ts).
export interface GeneratedPlanResponse {
  title: string;
  description: string;
  learningGoal: string;
  currentLevel: Level;
  targetLevel: Level;
  startDate: string;
  targetEndDate: string;
  phases: {
    title: string;
    description: string;
    order: number;
    startDate: string;
    endDate: string;
    objectives: string[];
    tasks: {
      title: string;
      description: string;
      priority: Priority;
      estimatedDuration: number;
      scheduledDate: string;
      completionCriteria: string;
    }[];
  }[];
  milestones: {
    title: string;
    description: string;
    targetDate: string;
    completionCriteria: string;
  }[];
}

export function draftFromGeneratedPlan(generated: GeneratedPlanResponse): PlanDraft {
  return {
    title: generated.title,
    description: generated.description,
    learningGoal: generated.learningGoal,
    currentLevel: generated.currentLevel,
    targetLevel: generated.targetLevel,
    startDate: generated.startDate,
    targetEndDate: generated.targetEndDate,
    phases: generated.phases.map((phase) => ({
      id: nextId("phase"),
      title: phase.title,
      description: phase.description,
      startDate: phase.startDate,
      endDate: phase.endDate,
      objectives: phase.objectives,
      tasks: phase.tasks.map((task) => ({
        id: nextId("task"),
        title: task.title,
        description: task.description,
        priority: task.priority,
        estimatedDuration: task.estimatedDuration,
        scheduledDate: task.scheduledDate,
        completionCriteria: task.completionCriteria,
      })),
    })),
    milestones: generated.milestones.map((m) => ({
      id: nextId("milestone"),
      title: m.title,
      description: m.description,
      targetDate: m.targetDate,
      completionCriteria: m.completionCriteria,
    })),
  };
}
