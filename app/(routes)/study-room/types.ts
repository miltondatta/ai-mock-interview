export type RoomStatus = "active" | "archived";
export type SessionStatus = "in_progress" | "completed" | "abandoned";
export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface StudyRoomSummary {
  _id: string;
  title: string;
  topic: string;
  objective?: string;
  category?: string;
  difficulty?: Difficulty;
  status: RoomStatus;
  totalSessions: number;
  hasActiveSession: boolean;
  lastAccessedAt?: number;
  createdAt: number;
}

export interface DashboardStats {
  totalRooms: number;
  activeSessions: number;
  completedSessions: number;
  sessionsThisWeek: number;
  // M4 - both computed live from persisted session records, never an
  // artificial/estimated value.
  totalLearningSeconds: number;
  recentTopics: string[];
}

export interface RecentSessionSummary {
  _id: string;
  studyRoomId: string;
  roomTitle: string;
  roomTopic: string;
  status: SessionStatus;
  startedAt: number;
  endedAt?: number;
  durationSeconds?: number;
}

// M4 - Session History page's row shape (GetSessionHistory).
export type SummaryStatus = "none" | "generating" | "ready" | "failed";

export interface SessionHistoryEntry {
  _id: string;
  studyRoomId: string;
  roomTitle: string;
  roomTopic: string;
  roomCategory?: string;
  status: SessionStatus;
  startedAt: number;
  endedAt?: number;
  durationSeconds?: number;
  summaryStatus: SummaryStatus;
}

export const SESSION_STATUS_META: Record<SessionStatus, { label: string; badgeClass: string }> = {
  in_progress: { label: "In Progress", badgeClass: "bg-success/15 text-success" },
  completed: { label: "Completed", badgeClass: "bg-primary/10 text-primary" },
  abandoned: { label: "Abandoned", badgeClass: "bg-muted text-muted-foreground" },
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return "0 min";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours} hr ${rem} min` : `${hours} hr`;
}
