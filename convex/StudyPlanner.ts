import { mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

const LEVEL = v.union(v.literal("beginner"), v.literal("intermediate"), v.literal("advanced"));
const PRIORITY = v.union(v.literal("low"), v.literal("medium"), v.literal("high"));
const TASK_STATUS = v.union(
  v.literal("pending"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("skipped")
);
const MILESTONE_STATUS = v.union(v.literal("pending"), v.literal("achieved"));

const TASK_INPUT = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  priority: PRIORITY,
  estimatedDuration: v.optional(v.number()),
  scheduledDate: v.optional(v.string()),
  completionCriteria: v.optional(v.string()),
});

const PHASE_INPUT = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  order: v.number(),
  startDate: v.optional(v.string()),
  endDate: v.optional(v.string()),
  objectives: v.optional(v.array(v.string())),
  tasks: v.array(TASK_INPUT),
});

const MILESTONE_INPUT = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  targetDate: v.optional(v.string()),
  completionCriteria: v.optional(v.string()),
});

// Study Planner - independent module (app/(routes)/study-planner). M1 shipped
// the read-only dashboard; M2 added AI/manual plan creation; M3 adds the
// Study Plan Details screen - full phase/task/milestone management plus
// plan-level status changes. Every query/mutation is scoped to the caller's
// own userId, matching the rest of this app's Clerk-to-Convex identity
// approach (the client resolves userId from UserDetailContext, itself
// populated from the authenticated Clerk session - see app/Provider.tsx).

// Progress is always derived live from studyPlanTasks rather than trusted
// from studyPlans.progress/totalTasks/completedTasks, since no mutation in
// M1 keeps those denormalized fields in sync yet. Centralizing the formula
// here is what keeps plan-level and dashboard-level stats consistent.
function computeTaskStats(tasks: Doc<"studyPlanTasks">[]) {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  return { totalTasks, completedTasks, progress };
}

// Earliest not-yet-completed task by scheduled date (undated tasks sort
// last). Undefined when the plan has no pending tasks.
function findNextTask(tasks: Doc<"studyPlanTasks">[]) {
  const pending = tasks.filter((t) => t.status !== "completed");
  if (pending.length === 0) return undefined;
  const sorted = [...pending].sort((a, b) => {
    if (!a.scheduledDate && !b.scheduledDate) return 0;
    if (!a.scheduledDate) return 1;
    if (!b.scheduledDate) return -1;
    return a.scheduledDate.localeCompare(b.scheduledDate);
  });
  const next = sorted[0];
  return { id: next._id, title: next.title, scheduledDate: next.scheduledDate };
}

// --- M3 ownership helpers -------------------------------------------------
// Every table carries userId directly (denormalized at creation), so
// ownership is a single doc fetch + comparison - no join back to studyPlans
// needed. A missing id and someone else's id both read as "not found" so a
// guess at another user's id can't be used to probe existence.

async function requireOwnedPlan(ctx: MutationCtx, userId: Id<"UserTable">, studyPlanId: Id<"studyPlans">) {
  const plan = await ctx.db.get(studyPlanId);
  if (!plan || plan.userId !== userId) throw new Error("Study plan not found.");
  return plan;
}

async function requireOwnedPhase(ctx: MutationCtx, userId: Id<"UserTable">, phaseId: Id<"studyPlanPhases">) {
  const phase = await ctx.db.get(phaseId);
  if (!phase || phase.userId !== userId) throw new Error("Phase not found.");
  return phase;
}

async function requireOwnedTask(ctx: MutationCtx, userId: Id<"UserTable">, taskId: Id<"studyPlanTasks">) {
  const task = await ctx.db.get(taskId);
  if (!task || task.userId !== userId) throw new Error("Task not found.");
  return task;
}

async function requireOwnedMilestone(ctx: MutationCtx, userId: Id<"UserTable">, milestoneId: Id<"studyPlanMilestones">) {
  const milestone = await ctx.db.get(milestoneId);
  if (!milestone || milestone.userId !== userId) throw new Error("Milestone not found.");
  return milestone;
}

function withoutUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as Partial<T>;
}

// Keeps studyPlans.status in sync with actual task completion after any
// change that could flip "are all tasks done": completing/reopening a task,
// or deleting a task/phase. Only ever toggles between active <-> completed -
// paused and archived are left alone so this never fights a deliberate pause
// or archive, and a plan is still never "completed" just because its target
// date passed (date is never consulted here).
async function syncPlanCompletionStatus(ctx: MutationCtx, studyPlanId: Id<"studyPlans">) {
  const plan = await ctx.db.get(studyPlanId);
  if (!plan) return;
  const tasks = await ctx.db
    .query("studyPlanTasks")
    .withIndex("by_studyPlan", (q) => q.eq("studyPlanId", studyPlanId))
    .collect();
  const totalTasks = tasks.length;
  const allCompleted = totalTasks > 0 && tasks.every((t) => t.status === "completed");

  if (allCompleted && plan.status === "active") {
    await ctx.db.patch(studyPlanId, { status: "completed", updatedAt: Date.now() });
  } else if (!allCompleted && plan.status === "completed") {
    await ctx.db.patch(studyPlanId, { status: "active", updatedAt: Date.now() });
  }
}

function derivePhaseStatus(tasks: Doc<"studyPlanTasks">[]): "not_started" | "in_progress" | "completed" {
  if (tasks.length === 0) return "not_started";
  if (tasks.every((t) => t.status === "completed")) return "completed";
  if (tasks.some((t) => t.status === "completed" || t.status === "in_progress")) return "in_progress";
  return "not_started";
}

function todayDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function buildPlanSummary(ctx: QueryCtx, plan: Doc<"studyPlans">) {
  const tasks = await ctx.db
    .query("studyPlanTasks")
    .withIndex("by_studyPlan", (q) => q.eq("studyPlanId", plan._id))
    .collect();
  const { totalTasks, completedTasks, progress } = computeTaskStats(tasks);
  return {
    _id: plan._id,
    title: plan.title,
    description: plan.description,
    learningGoal: plan.learningGoal,
    status: plan.status,
    startDate: plan.startDate,
    targetEndDate: plan.targetEndDate,
    totalTasks,
    completedTasks,
    progress,
    nextTask: findNextTask(tasks),
    createdAt: plan.createdAt,
  };
}

// Dashboard-style list, newest first, with live progress/task-count/next-task
// per plan. Status filtering (All/Active/Completed/Paused/Archived) happens
// client-side on this result, the same convention QuestionCollectionHistory
// uses for its difficulty filters, rather than a separate query per status.
export const GetUserStudyPlans = query({
  args: {
    userId: v.id("UserTable"),
  },
  handler: async (ctx, args) => {
    const plans = await ctx.db
      .query("studyPlans")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const sorted = plans.sort((a, b) => b.createdAt - a.createdAt);
    return Promise.all(sorted.map((plan) => buildPlanSummary(ctx, plan)));
  },
});

// Dashboard summary cards: total/active/completed plan counts plus overall
// learning progress. Overall progress is the same
// (completed / total) * 100 formula as a single plan's progress, applied to
// the task counts summed across every plan the user has - not an average of
// per-plan percentages - so a user with one 2-task plan and one 50-task plan
// isn't misrepresented by weighting them equally.
export const GetDashboardStats = query({
  args: {
    userId: v.id("UserTable"),
  },
  handler: async (ctx, args) => {
    const plans = await ctx.db
      .query("studyPlans")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    let totalTasksSum = 0;
    let completedTasksSum = 0;
    for (const plan of plans) {
      const tasks = await ctx.db
        .query("studyPlanTasks")
        .withIndex("by_studyPlan", (q) => q.eq("studyPlanId", plan._id))
        .collect();
      totalTasksSum += tasks.length;
      completedTasksSum += tasks.filter((t) => t.status === "completed").length;
    }

    const overallProgress = totalTasksSum > 0 ? Math.round((completedTasksSum / totalTasksSum) * 100) : 0;

    return {
      totalPlans: plans.length,
      activePlans: plans.filter((p) => p.status === "active").length,
      completedPlans: plans.filter((p) => p.status === "completed").length,
      pausedPlans: plans.filter((p) => p.status === "paused").length,
      archivedPlans: plans.filter((p) => p.status === "archived").length,
      overallProgress,
    };
  },
});

// M2 - creates a full study plan (plan + phases + their tasks + milestones)
// in one transaction. Used by both the AI tab (after the user reviews and
// confirms the generated preview - see app/api/study-planner/generate) and
// the Manual tab (built entirely client-side). Both paths funnel through
// this single mutation so a plan created either way looks identical to the
// M1 dashboard and every later milestone.
export const CreateStudyPlan = mutation({
  args: {
    userId: v.id("UserTable"),
    title: v.string(),
    description: v.optional(v.string()),
    learningGoal: v.optional(v.string()),
    currentLevel: v.optional(LEVEL),
    targetLevel: v.optional(LEVEL),
    startDate: v.optional(v.string()),
    targetEndDate: v.optional(v.string()),
    availableHoursPerDay: v.optional(v.number()),
    preferredStudyDays: v.optional(v.array(v.string())),
    learningPreferences: v.optional(v.array(v.string())),
    additionalInstructions: v.optional(v.string()),
    generationMethod: v.union(v.literal("ai"), v.literal("manual")),
    phases: v.array(PHASE_INPUT),
    milestones: v.array(MILESTONE_INPUT),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const totalTasks = args.phases.reduce((sum, phase) => sum + phase.tasks.length, 0);

    const studyPlanId = await ctx.db.insert("studyPlans", {
      userId: args.userId,
      title: args.title,
      description: args.description,
      learningGoal: args.learningGoal,
      status: "active",
      startDate: args.startDate,
      targetEndDate: args.targetEndDate,
      progress: 0,
      totalTasks,
      completedTasks: 0,
      currentLevel: args.currentLevel,
      targetLevel: args.targetLevel,
      availableHoursPerDay: args.availableHoursPerDay,
      preferredStudyDays: args.preferredStudyDays,
      learningPreferences: args.learningPreferences,
      additionalInstructions: args.additionalInstructions,
      generationMethod: args.generationMethod,
      createdAt: now,
      updatedAt: now,
    });

    for (const phase of args.phases) {
      const phaseId = await ctx.db.insert("studyPlanPhases", {
        studyPlanId,
        userId: args.userId,
        title: phase.title,
        description: phase.description,
        order: phase.order,
        status: "not_started",
        startDate: phase.startDate,
        endDate: phase.endDate,
        objectives: phase.objectives,
        createdAt: now,
        updatedAt: now,
      });

      for (let i = 0; i < phase.tasks.length; i++) {
        const task = phase.tasks[i];
        await ctx.db.insert("studyPlanTasks", {
          studyPlanId,
          phaseId,
          userId: args.userId,
          title: task.title,
          description: task.description,
          status: "pending",
          priority: task.priority,
          estimatedDuration: task.estimatedDuration,
          scheduledDate: task.scheduledDate,
          order: i,
          completionCriteria: task.completionCriteria,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    for (const milestone of args.milestones) {
      await ctx.db.insert("studyPlanMilestones", {
        studyPlanId,
        userId: args.userId,
        title: milestone.title,
        description: milestone.description,
        targetDate: milestone.targetDate,
        status: "pending",
        completionCriteria: milestone.completionCriteria,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { studyPlanId };
  },
});

// --- M3: Study Plan Details ------------------------------------------------

// Everything the Study Plan Details screen needs in one round trip: the plan
// itself, its phases (each with its own tasks and a live-derived
// progress/status), any task not yet assigned to a phase, its milestones,
// and plan-wide task-status counters. Mirrors GetCollection's
// normalizeId-then-ownership-check shape from QuestionBank.ts so an invalid
// or foreign id reads as "not found" (null) rather than throwing.
export const GetStudyPlanDetails = query({
  args: {
    userId: v.id("UserTable"),
    studyPlanId: v.string(),
  },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("studyPlans", args.studyPlanId);
    if (!id) return null;
    const plan = await ctx.db.get(id);
    if (!plan || plan.userId !== args.userId) return null;

    const [phaseDocs, taskDocs, milestoneDocs] = await Promise.all([
      ctx.db
        .query("studyPlanPhases")
        .withIndex("by_studyPlan_order", (q) => q.eq("studyPlanId", id))
        .collect(),
      ctx.db
        .query("studyPlanTasks")
        .withIndex("by_studyPlan", (q) => q.eq("studyPlanId", id))
        .collect(),
      ctx.db
        .query("studyPlanMilestones")
        .withIndex("by_studyPlan", (q) => q.eq("studyPlanId", id))
        .collect(),
    ]);

    const tasksByPhase = new Map<string, Doc<"studyPlanTasks">[]>();
    const unassignedTasks: Doc<"studyPlanTasks">[] = [];
    for (const task of taskDocs) {
      if (!task.phaseId) {
        unassignedTasks.push(task);
        continue;
      }
      const key = task.phaseId;
      if (!tasksByPhase.has(key)) tasksByPhase.set(key, []);
      tasksByPhase.get(key)!.push(task);
    }

    const phases = [...phaseDocs]
      .sort((a, b) => a.order - b.order)
      .map((phase) => {
        const tasks = (tasksByPhase.get(phase._id) ?? []).sort((a, b) => a.order - b.order);
        const { totalTasks, completedTasks, progress } = computeTaskStats(tasks);
        return {
          _id: phase._id,
          title: phase.title,
          description: phase.description,
          order: phase.order,
          startDate: phase.startDate,
          endDate: phase.endDate,
          objectives: phase.objectives ?? [],
          status: derivePhaseStatus(tasks),
          totalTasks,
          completedTasks,
          progress,
          tasks,
        };
      });

    const { totalTasks, completedTasks, progress } = computeTaskStats(taskDocs);
    const today = todayDateKey();
    const overdueTasks = taskDocs.filter(
      (t) => t.status !== "completed" && t.status !== "skipped" && !!t.scheduledDate && t.scheduledDate < today
    ).length;
    const totalEstimatedMinutes = taskDocs.reduce((sum, t) => sum + (t.estimatedDuration ?? 0), 0);

    const milestones = [...milestoneDocs].sort((a, b) => {
      if (!a.targetDate && !b.targetDate) return a.createdAt - b.createdAt;
      if (!a.targetDate) return 1;
      if (!b.targetDate) return -1;
      return a.targetDate.localeCompare(b.targetDate);
    });

    return {
      plan: {
        _id: plan._id,
        title: plan.title,
        description: plan.description,
        learningGoal: plan.learningGoal,
        status: plan.status,
        startDate: plan.startDate,
        targetEndDate: plan.targetEndDate,
        currentLevel: plan.currentLevel,
        targetLevel: plan.targetLevel,
        availableHoursPerDay: plan.availableHoursPerDay,
        generationMethod: plan.generationMethod,
        progress,
        totalTasks,
        completedTasks,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      },
      stats: {
        pendingTasks: taskDocs.filter((t) => t.status === "pending").length,
        inProgressTasks: taskDocs.filter((t) => t.status === "in_progress").length,
        completedTasks,
        skippedTasks: taskDocs.filter((t) => t.status === "skipped").length,
        overdueTasks,
        totalEstimatedMinutes,
      },
      phases,
      unassignedTasks: unassignedTasks.sort((a, b) => a.order - b.order),
      milestones,
    };
  },
});

// --- M3: plan-level management ---------------------------------------------

export const UpdateStudyPlan = mutation({
  args: {
    userId: v.id("UserTable"),
    studyPlanId: v.id("studyPlans"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    learningGoal: v.optional(v.string()),
    currentLevel: v.optional(LEVEL),
    targetLevel: v.optional(LEVEL),
    startDate: v.optional(v.string()),
    targetEndDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOwnedPlan(ctx, args.userId, args.studyPlanId);
    const { userId, studyPlanId, ...patch } = args;
    await ctx.db.patch(studyPlanId, { ...withoutUndefined(patch), updatedAt: Date.now() });
  },
});

// Pause/Resume/Archive/Restore all funnel through this one mutation - restore
// is just setting status back to "active". "completed" is intentionally not
// settable here; it's only ever derived from task completion (see
// syncPlanCompletionStatus) so it can never drift from the task list.
export const SetStudyPlanStatus = mutation({
  args: {
    userId: v.id("UserTable"),
    studyPlanId: v.id("studyPlans"),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("archived")),
  },
  handler: async (ctx, args) => {
    await requireOwnedPlan(ctx, args.userId, args.studyPlanId);
    await ctx.db.patch(args.studyPlanId, { status: args.status, updatedAt: Date.now() });
  },
});

// Deletes the plan and every phase/task/milestone that belongs to it -
// nothing outside this plan's own rows is touched (no AI Study Room or other
// module data exists under these tables).
export const DeleteStudyPlan = mutation({
  args: {
    userId: v.id("UserTable"),
    studyPlanId: v.id("studyPlans"),
  },
  handler: async (ctx, args) => {
    await requireOwnedPlan(ctx, args.userId, args.studyPlanId);

    const tasks = await ctx.db
      .query("studyPlanTasks")
      .withIndex("by_studyPlan", (q) => q.eq("studyPlanId", args.studyPlanId))
      .collect();
    for (const task of tasks) await ctx.db.delete(task._id);

    const phases = await ctx.db
      .query("studyPlanPhases")
      .withIndex("by_studyPlan", (q) => q.eq("studyPlanId", args.studyPlanId))
      .collect();
    for (const phase of phases) await ctx.db.delete(phase._id);

    const milestones = await ctx.db
      .query("studyPlanMilestones")
      .withIndex("by_studyPlan", (q) => q.eq("studyPlanId", args.studyPlanId))
      .collect();
    for (const milestone of milestones) await ctx.db.delete(milestone._id);

    await ctx.db.delete(args.studyPlanId);
  },
});

// --- M3: phase management ---------------------------------------------------

export const CreatePhase = mutation({
  args: {
    userId: v.id("UserTable"),
    studyPlanId: v.id("studyPlans"),
    title: v.string(),
    description: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    objectives: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireOwnedPlan(ctx, args.userId, args.studyPlanId);
    const siblings = await ctx.db
      .query("studyPlanPhases")
      .withIndex("by_studyPlan", (q) => q.eq("studyPlanId", args.studyPlanId))
      .collect();
    const order = siblings.length > 0 ? Math.max(...siblings.map((p) => p.order)) + 1 : 0;
    const now = Date.now();
    const phaseId = await ctx.db.insert("studyPlanPhases", {
      studyPlanId: args.studyPlanId,
      userId: args.userId,
      title: args.title,
      description: args.description,
      order,
      status: "not_started",
      startDate: args.startDate,
      endDate: args.endDate,
      objectives: args.objectives ?? [],
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.studyPlanId, { updatedAt: now });
    return { phaseId };
  },
});

export const UpdatePhase = mutation({
  args: {
    userId: v.id("UserTable"),
    phaseId: v.id("studyPlanPhases"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    objectives: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const phase = await requireOwnedPhase(ctx, args.userId, args.phaseId);
    const { userId, phaseId, ...patch } = args;
    const now = Date.now();
    await ctx.db.patch(phaseId, { ...withoutUndefined(patch), updatedAt: now });
    await ctx.db.patch(phase.studyPlanId, { updatedAt: now });
  },
});

// Swaps this phase's order with its immediate neighbor - a no-op at either
// end of the list. Simple, dependency-free reordering (no drag-and-drop
// library) consistent with "reorder if practical within the existing design".
export const ReorderPhase = mutation({
  args: {
    userId: v.id("UserTable"),
    phaseId: v.id("studyPlanPhases"),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, args) => {
    const phase = await requireOwnedPhase(ctx, args.userId, args.phaseId);
    const siblings = (
      await ctx.db
        .query("studyPlanPhases")
        .withIndex("by_studyPlan_order", (q) => q.eq("studyPlanId", phase.studyPlanId))
        .collect()
    ).sort((a, b) => a.order - b.order);
    const index = siblings.findIndex((p) => p._id === phase._id);
    const swapIndex = args.direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= siblings.length) return;
    const other = siblings[swapIndex];
    const now = Date.now();
    await ctx.db.patch(phase._id, { order: other.order, updatedAt: now });
    await ctx.db.patch(other._id, { order: phase.order, updatedAt: now });
  },
});

// Deleting a phase deletes its tasks too (a task orphaned from its phase has
// nowhere sensible to show up) - the client confirms this with the user
// first and states the task count, so nothing is lost silently.
export const DeletePhase = mutation({
  args: {
    userId: v.id("UserTable"),
    phaseId: v.id("studyPlanPhases"),
  },
  handler: async (ctx, args) => {
    const phase = await requireOwnedPhase(ctx, args.userId, args.phaseId);
    const tasks = await ctx.db
      .query("studyPlanTasks")
      .withIndex("by_phase", (q) => q.eq("phaseId", args.phaseId))
      .collect();
    for (const task of tasks) await ctx.db.delete(task._id);
    await ctx.db.delete(args.phaseId);
    await ctx.db.patch(phase.studyPlanId, { updatedAt: Date.now() });
    await syncPlanCompletionStatus(ctx, phase.studyPlanId);
  },
});

// --- M3: task management -----------------------------------------------------

export const CreateTask = mutation({
  args: {
    userId: v.id("UserTable"),
    studyPlanId: v.id("studyPlans"),
    phaseId: v.optional(v.id("studyPlanPhases")),
    title: v.string(),
    description: v.optional(v.string()),
    priority: PRIORITY,
    estimatedDuration: v.optional(v.number()),
    scheduledDate: v.optional(v.string()),
    scheduledTime: v.optional(v.string()),
    completionCriteria: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOwnedPlan(ctx, args.userId, args.studyPlanId);
    if (args.phaseId) await requireOwnedPhase(ctx, args.userId, args.phaseId);

    const siblings = args.phaseId
      ? await ctx.db
          .query("studyPlanTasks")
          .withIndex("by_phase", (q) => q.eq("phaseId", args.phaseId))
          .collect()
      : await ctx.db
          .query("studyPlanTasks")
          .withIndex("by_studyPlan", (q) => q.eq("studyPlanId", args.studyPlanId))
          .collect();
    const order = siblings.length > 0 ? Math.max(...siblings.map((t) => t.order)) + 1 : 0;
    const now = Date.now();

    const taskId = await ctx.db.insert("studyPlanTasks", {
      studyPlanId: args.studyPlanId,
      phaseId: args.phaseId,
      userId: args.userId,
      title: args.title,
      description: args.description,
      status: "pending",
      priority: args.priority,
      estimatedDuration: args.estimatedDuration,
      scheduledDate: args.scheduledDate,
      scheduledTime: args.scheduledTime,
      order,
      completionCriteria: args.completionCriteria,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.studyPlanId, { updatedAt: now });
    await syncPlanCompletionStatus(ctx, args.studyPlanId);
    return { taskId };
  },
});

// scheduledDate/scheduledTime use optional-nullable (string | null | absent):
// absent means "leave as is", a string sets it, and an explicit `null` clears
// the field - the only way to unschedule a task (M4) without deleting it,
// since a plain optional field can't distinguish "don't touch" from "clear".
export const UpdateTask = mutation({
  args: {
    userId: v.id("UserTable"),
    taskId: v.id("studyPlanTasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(TASK_STATUS),
    priority: v.optional(PRIORITY),
    estimatedDuration: v.optional(v.number()),
    scheduledDate: v.optional(v.union(v.string(), v.null())),
    scheduledTime: v.optional(v.union(v.string(), v.null())),
    completionCriteria: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await requireOwnedTask(ctx, args.userId, args.taskId);
    const { userId, taskId, status, scheduledDate, scheduledTime, ...rest } = args;
    const now = Date.now();

    await ctx.db.patch(taskId, {
      ...withoutUndefined(rest),
      ...(scheduledDate !== undefined ? { scheduledDate: scheduledDate ?? undefined } : {}),
      ...(scheduledTime !== undefined ? { scheduledTime: scheduledTime ?? undefined } : {}),
      // Clearing the date also clears any time-of-day - a time with no date
      // is meaningless, and the UI only ever offers a time once a date is set.
      ...(scheduledDate === null ? { scheduledTime: undefined } : {}),
      // Convex's patch() drops a field entirely when given `undefined`, so
      // reopening a completed/skipped task clears completedAt instead of
      // leaving a stale timestamp on a task that's no longer done.
      ...(status !== undefined ? { status, completedAt: status === "completed" ? now : undefined } : {}),
      updatedAt: now,
    });
    await ctx.db.patch(task.studyPlanId, { updatedAt: now });
    if (status !== undefined) await syncPlanCompletionStatus(ctx, task.studyPlanId);
  },
});

export const DeleteTask = mutation({
  args: {
    userId: v.id("UserTable"),
    taskId: v.id("studyPlanTasks"),
  },
  handler: async (ctx, args) => {
    const task = await requireOwnedTask(ctx, args.userId, args.taskId);
    await ctx.db.delete(args.taskId);
    await ctx.db.patch(task.studyPlanId, { updatedAt: Date.now() });
    await syncPlanCompletionStatus(ctx, task.studyPlanId);
  },
});

// --- M3: milestone management -------------------------------------------------

export const CreateMilestone = mutation({
  args: {
    userId: v.id("UserTable"),
    studyPlanId: v.id("studyPlans"),
    title: v.string(),
    description: v.optional(v.string()),
    targetDate: v.optional(v.string()),
    completionCriteria: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOwnedPlan(ctx, args.userId, args.studyPlanId);
    const now = Date.now();
    const milestoneId = await ctx.db.insert("studyPlanMilestones", {
      studyPlanId: args.studyPlanId,
      userId: args.userId,
      title: args.title,
      description: args.description,
      targetDate: args.targetDate,
      status: "pending",
      completionCriteria: args.completionCriteria,
      createdAt: now,
      updatedAt: now,
    });
    return { milestoneId };
  },
});

export const UpdateMilestone = mutation({
  args: {
    userId: v.id("UserTable"),
    milestoneId: v.id("studyPlanMilestones"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    targetDate: v.optional(v.string()),
    completionCriteria: v.optional(v.string()),
    status: v.optional(MILESTONE_STATUS),
  },
  handler: async (ctx, args) => {
    await requireOwnedMilestone(ctx, args.userId, args.milestoneId);
    const { userId, milestoneId, ...patch } = args;
    await ctx.db.patch(milestoneId, { ...withoutUndefined(patch), updatedAt: Date.now() });
  },
});

export const DeleteMilestone = mutation({
  args: {
    userId: v.id("UserTable"),
    milestoneId: v.id("studyPlanMilestones"),
  },
  handler: async (ctx, args) => {
    await requireOwnedMilestone(ctx, args.userId, args.milestoneId);
    await ctx.db.delete(args.milestoneId);
  },
});

// --- M4: Study Schedule ------------------------------------------------------

// Every scheduled task across every one of the user's plans whose
// scheduledDate falls within [startDate, endDate] (inclusive, both
// "YYYY-MM-DD"), enriched with its plan/phase title for display. Powers Day,
// Week and Month views alike - the caller just passes a different range.
// String comparison on the index does the range filtering; nothing here ever
// parses a date string into a Date object, so there's no timezone-shift risk.
export const GetScheduleTasks = query({
  args: {
    userId: v.id("UserTable"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("studyPlanTasks")
      .withIndex("by_user_scheduledDate", (q) =>
        q.eq("userId", args.userId).gte("scheduledDate", args.startDate).lte("scheduledDate", args.endDate)
      )
      .collect();

    const planIds = [...new Set(tasks.map((t) => t.studyPlanId))];
    const phaseIds = [...new Set(tasks.map((t) => t.phaseId).filter((id): id is Id<"studyPlanPhases"> => !!id))];

    const plans = await Promise.all(planIds.map((id) => ctx.db.get(id)));
    const phases = await Promise.all(phaseIds.map((id) => ctx.db.get(id)));
    const planMap = new Map(plans.filter((p): p is Doc<"studyPlans"> => !!p).map((p) => [p._id, p]));
    const phaseMap = new Map(phases.filter((p): p is Doc<"studyPlanPhases"> => !!p).map((p) => [p._id, p]));

    return tasks.map((t) => ({
      _id: t._id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      estimatedDuration: t.estimatedDuration,
      scheduledDate: t.scheduledDate,
      scheduledTime: t.scheduledTime,
      studyPlanId: t.studyPlanId,
      planTitle: planMap.get(t.studyPlanId)?.title ?? "Untitled plan",
      phaseId: t.phaseId,
      phaseTitle: t.phaseId ? phaseMap.get(t.phaseId)?.title : undefined,
    }));
  },
});

// --- M4: Study Task Details --------------------------------------------------

// A single task plus just enough of its parent plan/phase to render the
// Task Details screen's breadcrumb and context - not the full plan details
// payload GetStudyPlanDetails returns, so this stays cheap to call from a
// dedicated task route. Same normalizeId-then-ownership-check shape as
// GetStudyPlanDetails: an invalid or foreign id reads as "not found" (null).
export const GetTaskDetails = query({
  args: {
    userId: v.id("UserTable"),
    taskId: v.string(),
  },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("studyPlanTasks", args.taskId);
    if (!id) return null;
    const task = await ctx.db.get(id);
    if (!task || task.userId !== args.userId) return null;

    const plan = await ctx.db.get(task.studyPlanId);
    const phase = task.phaseId ? await ctx.db.get(task.phaseId) : null;

    return {
      task: {
        _id: task._id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        estimatedDuration: task.estimatedDuration,
        scheduledDate: task.scheduledDate,
        scheduledTime: task.scheduledTime,
        completionCriteria: task.completionCriteria,
        completedAt: task.completedAt,
        createdAt: task.createdAt,
      },
      plan: plan ? { _id: plan._id, title: plan.title, status: plan.status } : null,
      phase: phase ? { _id: phase._id, title: phase.title, objectives: phase.objectives ?? [] } : null,
    };
  },
});
