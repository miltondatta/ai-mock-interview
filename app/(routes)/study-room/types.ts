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
  // M5 - set when this room was started from a Study Planner task, whether
  // or not it's still that task's canonical room (see buildDashboardItems).
  studyTaskId?: string;
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

// --- Study Room Topic Sync ---------------------------------------------------
// "My Study Rooms" is now populated from the Study Planner (source of truth
// for the learner's topics) instead of only from rooms that already exist -
// see convex/StudyPlanner.ts's GetStudyRoomTopics.

export type TopicStatus = "not_started" | "in_progress" | "completed";

export const TOPIC_STATUS_META: Record<TopicStatus, { label: string; badgeClass: string }> = {
  not_started: { label: "Not Started", badgeClass: "bg-muted text-muted-foreground" },
  in_progress: { label: "In Progress", badgeClass: "bg-success/15 text-success" },
  completed: { label: "Completed", badgeClass: "bg-primary/10 text-primary" },
};

// M5 - mirrors studyPlanTasks.learningResources.taskType (convex/schema.ts).
// Drives the compact topic row's leading icon; undefined when the task has
// no generated learning resources yet (the row falls back to a generic icon).
export type TaskType = "video" | "reading" | "practice" | "quiz" | "project" | "revision";

// Mirrors convex/StudyPlanner.ts's GetStudyRoomTopics return shape.
export interface StudyRoomTopic {
  taskId: string;
  title: string;
  description?: string;
  completionCriteria?: string;
  priority: "low" | "medium" | "high";
  planId: string;
  planTitle: string;
  planStatus: "active" | "paused" | "completed" | "archived";
  currentLevel?: Difficulty;
  learningGoal?: string;
  phaseId?: string;
  phaseTitle?: string;
  objectives: string[];
  taskType?: TaskType;
  studyRoomStatus: TopicStatus;
  roomStatus: RoomStatus;
  studyRoomId?: string;
  latestSessionId?: string;
  totalSessions: number;
  lastAccessedAt?: number;
  createdAt: number;
}

// Unified shape the dashboard's "My Study Rooms" list renders - one entry per
// Study Planner topic (every task from every non-archived plan, whether or
// not it has a Study Room yet) plus one entry per Study Room that isn't
// linked to any task (manually created, or started from Question
// Bank/Resume Match/Interview Review instead - those keep working exactly as
// before). `status` (active/archived) is what the existing All/Active/
// Archived filter tabs key off, same as it always has; `studyRoomStatus` is
// the Not Started/In Progress/Completed badge and decides which single
// action a row's button performs. `planId`/`phaseId` (present only for a
// Study-Planner-backed topic) are what groupDashboardItems below nests rows
// under - the phase/plan context no longer needs repeating on every row the
// way the old card grid's "subtitle" line did.
export interface StudyRoomDashboardItem {
  key: string;
  title: string;
  description?: string;
  status: RoomStatus;
  studyRoomStatus: TopicStatus;
  studyRoomId?: string;
  latestSessionId?: string;
  totalSessions: number;
  lastAccessedAt?: number;
  createdAt: number;
  taskType?: TaskType;
  planId?: string;
  planTitle?: string;
  phaseId?: string;
  phaseTitle?: string;
  // Only set for a topic with no Study Room yet - everything CreateStudyRoom
  // needs to start one that's already correctly linked back to this task.
  startPayload?: {
    title: string;
    topic: string;
    objective?: string;
    difficulty?: Difficulty;
    additionalInstructions?: string;
    studyPlanId: string;
    studyTaskId: string;
  };
}

// Builds a topic's `startPayload`, reusing the exact same field precedence
// Study Planner's own Task Details "Start Learning in AI Study Room" link
// uses (app/(routes)/study-planner/tasks/[taskId]/page.tsx) so a topic
// started from either entry point produces an identical room.
function buildTopicStartPayload(topic: StudyRoomTopic): StudyRoomDashboardItem["startPayload"] {
  const objectiveLines = topic.objectives.map((o) => o.trim()).filter(Boolean);
  const objective = [
    topic.description ?? "",
    objectiveLines.length > 0 ? `Learning objectives:\n${objectiveLines.map((o) => `- ${o}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const additionalInstructions = [
    topic.completionCriteria ? `Completion criteria: ${topic.completionCriteria}` : "",
    topic.learningGoal ? `Overall learning goal: ${topic.learningGoal}` : "",
    topic.phaseTitle ? `Study plan phase: ${topic.phaseTitle}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    title: topic.title,
    topic: topic.title,
    objective: objective || undefined,
    difficulty: topic.currentLevel,
    additionalInstructions: additionalInstructions || undefined,
    studyPlanId: topic.planId,
    studyTaskId: topic.taskId,
  };
}

// Merges Study Planner topics with any Study Room that isn't already linked
// to one of them into the single list "My Study Rooms" renders. A room gets
// folded into its topic's entry (topic title/description stay authoritative
// - Study Planner is the source of truth) rather than shown twice.
//
// M5 - duplicate-row fix: a room is only ever treated as "standalone" when
// its own `studyTaskId` is empty, or points at a task that no longer exists.
// Previously this was keyed off `topics[].studyRoomId` (only the one
// canonical room GetStudyRoomTopics picked per task), so an *older, non-
// canonical* room for that exact same task - e.g. a genuine duplicate
// created before CreateStudyRoom's canonical lookup-or-create existed - had
// no topic pointing at it and fell through to "standalone," rendering the
// same topic twice (once correctly, via its topic row, and once as a stray
// extra row for the leftover duplicate room). Checking the room's own
// `studyTaskId` against every task currently returned by Study Planner
// closes that gap for every duplicate at once, not just the one each topic
// happens to reference - a query/data-relationship fix, not a title or Set
// dedup over the rendered rows. A room whose task was later deleted still
// surfaces here (its `studyTaskId` no longer matches any current task), so
// it isn't silently lost.
export function buildDashboardItems(
  topics: StudyRoomTopic[],
  rooms: StudyRoomSummary[]
): StudyRoomDashboardItem[] {
  const currentTaskIds = new Set(topics.map((t) => t.taskId));

  const topicItems: StudyRoomDashboardItem[] = topics.map((t) => ({
    key: `topic:${t.taskId}`,
    title: t.title,
    description: t.description,
    status: t.roomStatus,
    studyRoomStatus: t.studyRoomStatus,
    studyRoomId: t.studyRoomId,
    latestSessionId: t.latestSessionId,
    totalSessions: t.totalSessions,
    lastAccessedAt: t.lastAccessedAt,
    createdAt: t.createdAt,
    taskType: t.taskType,
    planId: t.planId,
    planTitle: t.planTitle,
    phaseId: t.phaseId,
    phaseTitle: t.phaseTitle,
    startPayload: t.studyRoomId ? undefined : buildTopicStartPayload(t),
  }));

  const standaloneItems: StudyRoomDashboardItem[] = rooms
    .filter((r) => !r.studyTaskId || !currentTaskIds.has(r.studyTaskId))
    .map((r) => ({
      key: `room:${r._id}`,
      title: r.title,
      description: r.objective ?? r.topic,
      status: r.status,
      // No `latestSessionId` tracked here on purpose - a standalone room (no
      // linked Study Planner task) keeps its original single "Continue
      // Learning" behavior regardless of whether its last session finished,
      // exactly as before this change.
      studyRoomStatus: r.hasActiveSession ? "in_progress" : r.totalSessions > 0 ? "completed" : "not_started",
      studyRoomId: r._id,
      totalSessions: r.totalSessions,
      lastAccessedAt: r.lastAccessedAt,
      createdAt: r.createdAt,
    }));

  return [...topicItems, ...standaloneItems];
}

// --- M5: compact, Study-Planner-style grouping -------------------------------
// "My Study Rooms" now nests Learning Plan -> Learning Phase -> Topic rows,
// mirroring app/(routes)/study-planner/[studyPlanId]/PhaseCard.tsx's
// collapsible-phase pattern instead of a grid of large cards. A room with no
// plan/phase of its own (manually created, or started from Question
// Bank/Resume Match/Interview Review) has no group to nest under, so those
// are returned separately as `standalone` and rendered in their own section.

export interface StudyRoomPhaseGroup {
  key: string;
  phaseTitle: string;
  topics: StudyRoomDashboardItem[];
  totalTopics: number;
  completedTopics: number;
  inProgressTopics: number;
  notStartedTopics: number;
  progress: number;
}

export interface StudyRoomPlanGroup {
  key: string;
  planTitle: string;
  phaseGroups: StudyRoomPhaseGroup[];
  totalTopics: number;
  completedTopics: number;
}

export interface GroupedStudyRoomItems {
  planGroups: StudyRoomPlanGroup[];
  standalone: StudyRoomDashboardItem[];
}

function summarizePhaseTopics(topics: StudyRoomDashboardItem[]) {
  const totalTopics = topics.length;
  const completedTopics = topics.filter((t) => t.studyRoomStatus === "completed").length;
  const inProgressTopics = topics.filter((t) => t.studyRoomStatus === "in_progress").length;
  const notStartedTopics = totalTopics - completedTopics - inProgressTopics;
  const progress = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
  return { totalTopics, completedTopics, inProgressTopics, notStartedTopics, progress };
}

// Groups an already-filtered/searched item list (see page.tsx) for
// rendering. Plan/phase order follows the order items already arrive in
// (GetStudyRoomTopics' own newest-plan-first, phase-order, task-order
// sort), so no re-sorting happens here.
export function groupDashboardItems(items: StudyRoomDashboardItem[]): GroupedStudyRoomItems {
  const planOrder: string[] = [];
  const planMap = new Map<
    string,
    { planTitle: string; phaseOrder: string[]; phaseMap: Map<string, { phaseTitle: string; topics: StudyRoomDashboardItem[] }> }
  >();
  const standalone: StudyRoomDashboardItem[] = [];

  for (const item of items) {
    if (!item.planId) {
      standalone.push(item);
      continue;
    }
    if (!planMap.has(item.planId)) {
      planOrder.push(item.planId);
      planMap.set(item.planId, { planTitle: item.planTitle ?? "Study Plan", phaseOrder: [], phaseMap: new Map() });
    }
    const plan = planMap.get(item.planId)!;
    const phaseKey = item.phaseId ?? "__unassigned__";
    if (!plan.phaseMap.has(phaseKey)) {
      plan.phaseOrder.push(phaseKey);
      plan.phaseMap.set(phaseKey, { phaseTitle: item.phaseTitle ?? "General Topics", topics: [] });
    }
    plan.phaseMap.get(phaseKey)!.topics.push(item);
  }

  const planGroups: StudyRoomPlanGroup[] = planOrder.map((planId) => {
    const plan = planMap.get(planId)!;
    const phaseGroups: StudyRoomPhaseGroup[] = plan.phaseOrder.map((phaseKey) => {
      const phase = plan.phaseMap.get(phaseKey)!;
      return { key: `${planId}:${phaseKey}`, phaseTitle: phase.phaseTitle, topics: phase.topics, ...summarizePhaseTopics(phase.topics) };
    });
    const allTopics = phaseGroups.flatMap((p) => p.topics);
    return {
      key: planId,
      planTitle: plan.planTitle,
      phaseGroups,
      totalTopics: allTopics.length,
      completedTopics: allTopics.filter((t) => t.studyRoomStatus === "completed").length,
    };
  });

  return { planGroups, standalone };
}
