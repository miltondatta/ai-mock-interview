import { mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

// AI Study Room - independent module (app/(routes)/study-room). M1 ships the
// foundation only: room + session CRUD and read-only dashboard queries. The
// AI Tutor, Whiteboard, Code Editor, Notes, conversation transcript and
// AI-generated session summary are later milestones and are not implemented
// here. Deliberately kept independent of Study Planner, Question Bank and
// Interview - this module never reads or writes their tables, and nothing
// here is required for them to keep working. Any future cross-module link
// (e.g. starting a room from a Study Planner task) must stay an optional,
// purely navigational integration, never a data dependency.
//
// Every query/mutation is scoped to the caller's own userId, matching this
// app's existing Clerk-to-Convex identity approach: the client resolves
// userId from UserDetailContext (populated from the authenticated Clerk
// session in app/Provider.tsx) and passes it explicitly, the same
// convention Study Planner and Question Bank already use.

const DIFFICULTY = v.union(v.literal("beginner"), v.literal("intermediate"), v.literal("advanced"));
const ROOM_STATUS = v.union(v.literal("active"), v.literal("archived"));
const SESSION_STATUS = v.union(v.literal("in_progress"), v.literal("completed"), v.literal("abandoned"));

// --- Ownership helpers ------------------------------------------------------
// Mirrors Study Planner's requireOwnedPlan/Phase/Task pattern: a missing id
// and someone else's id both read as "not found" so a guess at another
// user's id can't be used to probe existence.

async function requireOwnedRoom(ctx: MutationCtx | QueryCtx, userId: Id<"UserTable">, studyRoomId: Id<"studyRooms">) {
  const room = await ctx.db.get(studyRoomId);
  if (!room || room.userId !== userId) throw new Error("Study room not found.");
  return room;
}

async function requireOwnedSession(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"UserTable">,
  sessionId: Id<"studyRoomSessions">
) {
  const session = await ctx.db.get(sessionId);
  if (!session || session.userId !== userId) throw new Error("Study room session not found.");
  return session;
}

async function getSessionsForRoom(ctx: QueryCtx, studyRoomId: Id<"studyRooms">) {
  return ctx.db
    .query("studyRoomSessions")
    .withIndex("by_studyRoom", (q) => q.eq("studyRoomId", studyRoomId))
    .collect();
}

function buildRoomSummary(room: Doc<"studyRooms">, sessions: Doc<"studyRoomSessions">[]) {
  const totalSessions = sessions.length;
  const hasActiveSession = sessions.some((s) => s.status === "in_progress");
  return {
    _id: room._id,
    title: room.title,
    topic: room.topic,
    objective: room.objective,
    category: room.category,
    difficulty: room.difficulty,
    status: room.status,
    totalSessions,
    hasActiveSession,
    lastAccessedAt: room.lastAccessedAt,
    createdAt: room.createdAt,
    // M5 - lets the dashboard tell a room tied to a Study Planner task apart
    // from a fully independent one, so a room already represented by its
    // task's topic row (including an old duplicate room for that same task,
    // from before CreateStudyRoom's canonical lookup-or-create existed) is
    // never *also* shown as a separate standalone room - see
    // app/(routes)/study-room/types.ts's buildDashboardItems.
    studyTaskId: room.studyTaskId,
  };
}

// --- Dashboard ---------------------------------------------------------------

// Dashboard-style list, most-recently-accessed first (falling back to newest
// created for a room that was never opened yet), with a live session count
// and "has an active session" flag per room. Status filtering (All/Active/
// Archived) happens client-side on this result, the same convention
// GetUserStudyPlans/QuestionCollectionHistory use for their own filters.
export const GetUserStudyRooms = query({
  args: {
    userId: v.id("UserTable"),
  },
  handler: async (ctx, args) => {
    const rooms = await ctx.db
      .query("studyRooms")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const sorted = [...rooms].sort((a, b) => (b.lastAccessedAt ?? b.createdAt) - (a.lastAccessedAt ?? a.createdAt));
    return Promise.all(
      sorted.map(async (room) => buildRoomSummary(room, await getSessionsForRoom(ctx, room._id)))
    );
  },
});

// Dashboard summary cards: total rooms (all statuses, matching
// GetDashboardStats' totalPlans convention), active sessions right now,
// completed sessions all-time, and sessions started in the last 7 days
// ("Recent Learning Activity").
export const GetDashboardStats = query({
  args: {
    userId: v.id("UserTable"),
  },
  handler: async (ctx, args) => {
    const rooms = await ctx.db
      .query("studyRooms")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const sessions = await ctx.db
      .query("studyRoomSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // M4 - "Total learning time" and "Recently studied topics", both
    // computed live from existing records (never an artificial/estimated
    // value) rather than a new denormalized counter.
    const totalLearningSeconds = sessions.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
    const roomsById = new Map(rooms.map((r) => [r._id, r]));
    const recentTopics: string[] = [];
    for (const s of [...sessions].sort((a, b) => b.startedAt - a.startedAt)) {
      const topic = roomsById.get(s.studyRoomId)?.topic;
      if (topic && !recentTopics.includes(topic)) recentTopics.push(topic);
      if (recentTopics.length >= 5) break;
    }

    return {
      totalRooms: rooms.length,
      activeSessions: sessions.filter((s) => s.status === "in_progress").length,
      completedSessions: sessions.filter((s) => s.status === "completed").length,
      sessionsThisWeek: sessions.filter((s) => s.startedAt >= sevenDaysAgo).length,
      totalLearningSeconds,
      recentTopics,
    };
  },
});

// M5.1 - both GetSessionHistory and GetRecentSessions read studyRoomSessions
// directly, independent of the "My Study Rooms" dashboard's own canonical-
// room logic (buildDashboardItems, app/(routes)/study-room/types.ts) - a
// session belonging to an old, non-canonical duplicate room for a Study
// Planner task (see CreateStudyRoom's canonical lookup-or-create and
// CleanupDuplicateStudyRooms, both earlier in this file) still surfaced
// here even after that dashboard-side fix, since neither of these two
// queries ever checked which room is the task's canonical one. This helper
// resolves each session's room once and reports whether that room is a
// duplicate to be hidden from these two views (the session row itself is
// never touched or deleted - it's still reachable via its own room, and
// CleanupDuplicateStudyRooms re-parenting it onto the canonical room is what
// makes it show up here normally afterward).
async function resolveSessionRooms(ctx: QueryCtx, userId: Id<"UserTable">, sessions: Doc<"studyRoomSessions">[]) {
  const roomIds = [...new Set(sessions.map((s) => s.studyRoomId))];
  const roomEntries = await Promise.all(roomIds.map(async (id) => [id, await ctx.db.get(id)] as const));
  const roomById = new Map(roomEntries);

  const taskIds = [...new Set([...roomById.values()].flatMap((r) => (r?.studyTaskId ? [r.studyTaskId] : [])))];
  const canonicalByTask = await getLatestStudyRoomForTasks(ctx, userId, taskIds);

  function isDuplicateRoom(room: Doc<"studyRooms"> | null | undefined): boolean {
    if (!room?.studyTaskId) return false;
    const canonical = canonicalByTask.get(room.studyTaskId);
    return !!canonical && canonical.studyRoomId !== room._id;
  }

  return { roomById, isDuplicateRoom };
}

// M4 - full session history across every room, newest first, each enriched
// with its room's title/topic/category so the History page never needs a
// second round trip per row. Unlike GetRecentSessions (Dashboard's capped
// "Recent Sessions" list), this returns everything - search/status/date
// filtering happens client-side on this result, same convention the
// Dashboard's own All/Active/Archived filter already uses.
export const GetSessionHistory = query({
  args: { userId: v.id("UserTable") },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("studyRoomSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const sorted = [...sessions].sort((a, b) => b.startedAt - a.startedAt);
    const { roomById, isDuplicateRoom } = await resolveSessionRooms(ctx, args.userId, sorted);

    return sorted
      .filter((session) => !isDuplicateRoom(roomById.get(session.studyRoomId)))
      .map((session) => {
        const room = roomById.get(session.studyRoomId);
        return {
          _id: session._id,
          studyRoomId: session.studyRoomId,
          roomTitle: room?.title ?? "Deleted room",
          roomTopic: room?.topic ?? "",
          roomCategory: room?.category,
          status: session.status,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          durationSeconds: session.durationSeconds,
          summaryStatus: session.summaryStatus ?? "none",
        };
      });
  },
});

// Cross-room recent sessions for the Dashboard's "Recent Sessions" section,
// newest first, each enriched with its parent room's title/topic so the UI
// never needs a second round trip per row.
export const GetRecentSessions = query({
  args: {
    userId: v.id("UserTable"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("studyRoomSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const sorted = [...sessions].sort((a, b) => b.startedAt - a.startedAt);
    const { roomById, isDuplicateRoom } = await resolveSessionRooms(ctx, args.userId, sorted);
    const visible = sorted.filter((session) => !isDuplicateRoom(roomById.get(session.studyRoomId)));
    const limited = visible.slice(0, args.limit ?? 10);

    return limited.map((session) => {
      const room = roomById.get(session.studyRoomId);
      return {
        _id: session._id,
        studyRoomId: session.studyRoomId,
        roomTitle: room?.title ?? "Deleted room",
        roomTopic: room?.topic ?? "",
        status: session.status,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        durationSeconds: session.durationSeconds,
      };
    });
  },
});

// --- Room CRUD ----------------------------------------------------------------

// M5 - every optional source-module reference is independently
// ownership-checked before being stored; a reference that fails the check
// (foreign, or the id doesn't actually belong to that table) is silently
// dropped rather than failing the whole room creation - starting a room is
// never blocked by a stale/invalid link, since every integration is
// optional by design.
async function validateOwnedRefs(
  ctx: MutationCtx,
  userId: Id<"UserTable">,
  args: {
    studyPlanId?: Id<"studyPlans">;
    studyTaskId?: Id<"studyPlanTasks">;
    questionBankCollectionId?: Id<"questionBankCollections">;
    questionBankQuestionIds?: Id<"questionBankQuestions">[];
    resumeMatchAnalysisId?: Id<"ResumeMatchAnalysisTable">;
    interviewReviewId?: Id<"InterviewSessionTable">;
  }
) {
  const [plan, task, collection, analysis, interview] = await Promise.all([
    args.studyPlanId ? ctx.db.get(args.studyPlanId) : null,
    args.studyTaskId ? ctx.db.get(args.studyTaskId) : null,
    args.questionBankCollectionId ? ctx.db.get(args.questionBankCollectionId) : null,
    args.resumeMatchAnalysisId ? ctx.db.get(args.resumeMatchAnalysisId) : null,
    args.interviewReviewId ? ctx.db.get(args.interviewReviewId) : null,
  ]);

  let questionIds: Id<"questionBankQuestions">[] | undefined;
  if (args.questionBankQuestionIds && collection && collection.userId === userId) {
    const questions = await Promise.all(args.questionBankQuestionIds.map((id) => ctx.db.get(id)));
    questionIds = questions
      .filter((q): q is Doc<"questionBankQuestions"> => !!q && q.collectionId === args.questionBankCollectionId)
      .map((q) => q._id);
  }

  return {
    studyPlanId: plan && plan.userId === userId ? plan._id : undefined,
    studyTaskId: task && task.userId === userId ? task._id : undefined,
    questionBankCollectionId: collection && collection.userId === userId ? collection._id : undefined,
    questionBankQuestionIds: questionIds && questionIds.length > 0 ? questionIds : undefined,
    resumeMatchAnalysisId: analysis && analysis.userId === userId ? analysis._id : undefined,
    interviewReviewId: interview && interview.userId === userId ? interview._id : undefined,
  };
}

// M5 - "show the source module and linked record where an integration is
// active." Resolves each reference on a room to a small display payload,
// treating a deleted/unavailable source record as a graceful
// `available: false` entry rather than an error - the room and its content
// are never affected by the source record's own lifecycle.
async function resolveLinkedSource(ctx: QueryCtx, room: Doc<"studyRooms">) {
  const sources: { type: string; label: string; href?: string; available: boolean }[] = [];

  if (room.studyTaskId) {
    const task = await ctx.db.get(room.studyTaskId);
    sources.push(
      task
        ? { type: "studyPlanner", label: `Study Planner task: ${task.title}`, href: `/study-planner/tasks/${task._id}`, available: true }
        : { type: "studyPlanner", label: "Study Planner task (no longer available)", available: false }
    );
  } else if (room.studyPlanId) {
    const plan = await ctx.db.get(room.studyPlanId);
    sources.push(
      plan
        ? { type: "studyPlanner", label: `Study Plan: ${plan.title}`, href: `/study-planner/${plan._id}`, available: true }
        : { type: "studyPlanner", label: "Study Plan (no longer available)", available: false }
    );
  }

  if (room.questionBankCollectionId) {
    const collection = await ctx.db.get(room.questionBankCollectionId);
    const count = room.questionBankQuestionIds?.length ?? 0;
    sources.push(
      collection
        ? {
            type: "questionBank",
            label: `Question Bank: ${count > 0 ? `${count} selected question(s) from ` : ""}"${collection.title}"`,
            href: `/question-bank?collectionId=${collection._id}`,
            available: true,
          }
        : { type: "questionBank", label: "Question Bank collection (no longer available)", available: false }
    );
  }

  if (room.resumeMatchAnalysisId) {
    const analysis = await ctx.db.get(room.resumeMatchAnalysisId);
    sources.push(
      analysis
        ? {
            type: "resumeMatch",
            label: `Resume Match Analyzer: ${analysis.jobTitle}`,
            href: `/resume-match-analyzer?analysisId=${analysis._id}`,
            available: true,
          }
        : { type: "resumeMatch", label: "Resume Match analysis (no longer available)", available: false }
    );
  }

  if (room.interviewReviewId) {
    const interview = await ctx.db.get(room.interviewReviewId);
    sources.push(
      interview
        ? {
            type: "interviewReview",
            label: `Interview Review: ${interview.jobTitle || "Mock interview"}`,
            href: `/interview/${interview._id}/feedback`,
            available: true,
          }
        : { type: "interviewReview", label: "Interview review (no longer available)", available: false }
    );
  }

  return sources;
}

// M2 - deterministic "which of these same-topic rooms is the canonical
// one" policy, shared by CreateStudyRoom's idempotent lookup below and
// CleanupDuplicateStudyRooms further down: the room with the most session
// history wins (the brief's "prefer the record containing the most useful
// valid learning history"), and the oldest one is the tiebreaker so the
// result is stable across repeated calls on the same input.
async function pickCanonicalRoom(ctx: QueryCtx, rooms: Doc<"studyRooms">[]) {
  const withCounts = await Promise.all(
    rooms.map(async (room) => ({ room, sessionCount: (await getSessionsForRoom(ctx, room._id)).length }))
  );
  return withCounts.sort((a, b) =>
    a.sessionCount !== b.sessionCount ? b.sessionCount - a.sessionCount : a.room.createdAt - b.room.createdAt
  )[0].room;
}

export const CreateStudyRoom = mutation({
  args: {
    userId: v.id("UserTable"),
    title: v.string(),
    topic: v.string(),
    objective: v.optional(v.string()),
    category: v.optional(v.string()),
    difficulty: v.optional(DIFFICULTY),
    learningPreferences: v.optional(v.array(v.string())),
    additionalInstructions: v.optional(v.string()),
    // M5 - optional integration references (see validateOwnedRefs above).
    studyPlanId: v.optional(v.id("studyPlans")),
    studyTaskId: v.optional(v.id("studyPlanTasks")),
    questionBankCollectionId: v.optional(v.id("questionBankCollections")),
    questionBankQuestionIds: v.optional(v.array(v.id("questionBankQuestions"))),
    resumeMatchAnalysisId: v.optional(v.id("ResumeMatchAnalysisTable")),
    interviewReviewId: v.optional(v.id("InterviewSessionTable")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const refs = await validateOwnedRefs(ctx, args.userId, args);
    const title = args.title.trim();
    const topic = args.topic.trim();

    // M2 - canonical identity: a room tied to a specific Study Planner task
    // (or, lacking that, a whole plan) must resolve to the SAME room every
    // time this is called for it, no matter how long ago it was created -
    // "Start Learning" from Study Planner, "Start Learning" from the Study
    // Room dashboard, and a retried/duplicate submission must all land on
    // one canonical room per topic, not just within a short window. This
    // lookup-then-insert is race-safe under Convex's own transactional (OCC)
    // commit model without any extra locking: two concurrent calls here both
    // read the same by_studyTask/by_studyPlan range, so if one of them
    // inserts first, the other's read set is invalidated and Convex
    // automatically retries it - on retry it finds the just-inserted room
    // and reuses it instead of inserting a second one.
    if (refs.studyTaskId || refs.studyPlanId) {
      const existing = refs.studyTaskId
        ? await ctx.db
            .query("studyRooms")
            .withIndex("by_studyTask", (q) => q.eq("studyTaskId", refs.studyTaskId))
            .collect()
        : await ctx.db
            .query("studyRooms")
            .withIndex("by_studyPlan", (q) => q.eq("studyPlanId", refs.studyPlanId))
            .collect();
      const owned = existing.filter((r) => r.userId === args.userId);
      if (owned.length > 0) {
        const canonical = await pickCanonicalRoom(ctx, owned);
        // The learner is explicitly returning to this topic - bring an
        // archived canonical room back into view rather than leaving it
        // (correctly reused, but invisibly archived) for this to silently
        // look like nothing happened.
        if (canonical.status === "archived") {
          await ctx.db.patch(canonical._id, { status: "active", updatedAt: now });
        }
        return { studyRoomId: canonical._id };
      }
    } else {
      // No stable topic reference to key off (a fully independent room -
      // manually created, or started from Question Bank/Resume Match/
      // Interview Review, all unaffected by this change per the M2 brief's
      // scope protection). Fall back to the original short dedup window,
      // which only guards against an accidental double-submit of the exact
      // same form (the Create Study Room form already disables its own
      // submit button while a request is in flight, but that can't protect
      // against a second, independent submission - a slow network response
      // that reads as "hung" followed by a retry, where the first call's
      // insert still lands after the user has already retried).
      const DUPLICATE_WINDOW_MS = 30_000;
      const recentRooms = await ctx.db
        .query("studyRooms")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();
      const duplicate = recentRooms.find(
        (r) =>
          r.title === title &&
          r.topic === topic &&
          !r.studyTaskId &&
          !r.studyPlanId &&
          now - r.createdAt < DUPLICATE_WINDOW_MS
      );
      if (duplicate) {
        return { studyRoomId: duplicate._id };
      }
    }

    const studyRoomId = await ctx.db.insert("studyRooms", {
      userId: args.userId,
      title,
      topic,
      objective: args.objective,
      category: args.category,
      difficulty: args.difficulty,
      learningPreferences: args.learningPreferences,
      additionalInstructions: args.additionalInstructions,
      status: "active",
      ...refs,
      createdAt: now,
      updatedAt: now,
    });
    return { studyRoomId };
  },
});

// Full detail-page payload: the room itself plus every session that
// belongs to it, newest first.
export const GetStudyRoomDetails = query({
  args: {
    userId: v.id("UserTable"),
    studyRoomId: v.id("studyRooms"),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.studyRoomId);
    if (!room || room.userId !== args.userId) return null;

    const sessions = await getSessionsForRoom(ctx, args.studyRoomId);
    const sortedSessions = [...sessions].sort((a, b) => b.startedAt - a.startedAt);
    const linkedSources = await resolveLinkedSource(ctx, room);

    return {
      room: {
        _id: room._id,
        title: room.title,
        topic: room.topic,
        objective: room.objective,
        category: room.category,
        difficulty: room.difficulty,
        learningPreferences: room.learningPreferences,
        additionalInstructions: room.additionalInstructions,
        status: room.status,
        createdAt: room.createdAt,
        lastAccessedAt: room.lastAccessedAt,
        linkedSources,
      },
      sessions: sortedSessions.map((s) => ({
        _id: s._id,
        status: s.status,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationSeconds: s.durationSeconds,
      })),
    };
  },
});

export const RenameStudyRoom = mutation({
  args: {
    userId: v.id("UserTable"),
    studyRoomId: v.id("studyRooms"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOwnedRoom(ctx, args.userId, args.studyRoomId);
    const title = args.title.trim();
    if (!title) throw new Error("Title cannot be empty.");
    await ctx.db.patch(args.studyRoomId, { title, updatedAt: Date.now() });
  },
});

// Archive/unarchive. A dedicated "archived" status (rather than deleting)
// so a room's session history is never lost by mistake; DeleteStudyRoom
// below is the explicit, confirmed-destructive action for that.
export const SetStudyRoomStatus = mutation({
  args: {
    userId: v.id("UserTable"),
    studyRoomId: v.id("studyRooms"),
    status: ROOM_STATUS,
  },
  handler: async (ctx, args) => {
    await requireOwnedRoom(ctx, args.userId, args.studyRoomId);
    await ctx.db.patch(args.studyRoomId, { status: args.status, updatedAt: Date.now() });
  },
});

// Deletes the room and cascades to every session that belongs to it. The
// caller (UI) is responsible for requiring explicit confirmation first -
// this mutation itself performs no confirmation step.
const SESSION_SCOPED_TABLES = [
  "studyRoomMessages",
  "studyRoomWhiteboards",
  "studyRoomCodeFiles",
  "studyRoomNotes",
  "studyRoomWorkspaceLayout",
  "studyRoomToolActions",
  "studyRoomTutorLeases",
] as const;

// Deletes a room together with every session in it and everything scoped
// to those sessions (transcript, whiteboard, code, notes, layout, tool
// actions) - deleting only the session rows used to leave all of that
// orphaned. Callers must check ownership first. Also used by
// StudyPlanner.DeleteStudyPlan to remove the rooms started from a plan.
export async function deleteStudyRoomCascade(ctx: MutationCtx, studyRoomId: Id<"studyRooms">) {
  const sessions = await getSessionsForRoom(ctx, studyRoomId);
  for (const session of sessions) {
    for (const table of SESSION_SCOPED_TABLES) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_session", (q) => q.eq("studyRoomSessionId", session._id))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
    await ctx.db.delete(session._id);
  }
  await ctx.db.delete(studyRoomId);
}

// Every room this user started from a Study Plan - linked to the plan
// itself, or to any of its tasks (covers a room whose studyPlanId wasn't
// stored, since the task link alone is enough to belong to the plan).
export async function findStudyRoomsForStudyPlan(
  ctx: QueryCtx,
  userId: Id<"UserTable">,
  studyPlanId: Id<"studyPlans">,
  studyTaskIds: Id<"studyPlanTasks">[]
) {
  const byId = new Map<Id<"studyRooms">, Doc<"studyRooms">>();
  const viaPlan = await ctx.db
    .query("studyRooms")
    .withIndex("by_studyPlan", (q) => q.eq("studyPlanId", studyPlanId))
    .collect();
  for (const room of viaPlan) byId.set(room._id, room);
  for (const taskId of studyTaskIds) {
    const viaTask = await ctx.db
      .query("studyRooms")
      .withIndex("by_studyTask", (q) => q.eq("studyTaskId", taskId))
      .collect();
    for (const room of viaTask) byId.set(room._id, room);
  }
  return [...byId.values()].filter((room) => room.userId === userId);
}

// Used by StudyPlanner.GetStudyRoomTopics (Study Room Topic Sync) to attach
// each Study Planner task's own Study Room status - which room, if any, and
// that room's most recent session - without StudyPlanner importing anything
// beyond this one helper. studyRooms/studyRoomSessions stay Study Room's own
// tables to query; a task with no room at all resolves to `null` rather than
// being omitted, so the caller can still show it as "not started."
export async function getLatestStudyRoomForTasks(
  ctx: QueryCtx,
  userId: Id<"UserTable">,
  taskIds: Id<"studyPlanTasks">[]
) {
  const result = new Map<
    Id<"studyPlanTasks">,
    {
      studyRoomId: Id<"studyRooms">;
      roomStatus: "active" | "archived";
      totalSessions: number;
      lastAccessedAt?: number;
      latestSessionId?: Id<"studyRoomSessions">;
      latestSessionStatus?: "in_progress" | "completed" | "abandoned";
    } | null
  >();

  await Promise.all(
    taskIds.map(async (taskId) => {
      const rooms = await ctx.db
        .query("studyRooms")
        .withIndex("by_studyTask", (q) => q.eq("studyTaskId", taskId))
        .collect();
      const owned = rooms.filter((r) => r.userId === userId);
      if (owned.length === 0) {
        result.set(taskId, null);
        return;
      }
      // A task should only ever have one linked room (CreateStudyRoom's
      // idempotent lookup-or-create keeps a retried "Start Learning" from
      // creating a second one), but if more than one still exists from
      // before that fix - see CleanupDuplicateStudyRooms - this picks the
      // same room CreateStudyRoom itself would resolve to, via the same
      // pickCanonicalRoom policy, so the dashboard never shows a different
      // "current" room than a fresh "Start Learning" click would reuse.
      const room = owned.length === 1 ? owned[0] : await pickCanonicalRoom(ctx, owned);
      const sessions = await getSessionsForRoom(ctx, room._id);
      const latestSession = [...sessions].sort((a, b) => b.startedAt - a.startedAt)[0];
      result.set(taskId, {
        studyRoomId: room._id,
        roomStatus: room.status,
        totalSessions: sessions.length,
        lastAccessedAt: room.lastAccessedAt,
        latestSessionId: latestSession?._id,
        latestSessionStatus: latestSession?.status,
      });
    })
  );

  return result;
}

// --- M2: duplicate Study Room detection + cleanup ---------------------------
// Before CreateStudyRoom's idempotent lookup-or-create (above), a learner
// could end up with more than one room for the same Study Planner task -
// e.g. "Start Learning" from Study Planner after archiving the first room
// for that task, or any retry more than 30 seconds after the first click
// (the old dedup window). These two functions find and safely merge any
// such pre-existing duplicates; nothing here runs automatically - see
// AI_STUDY_ROOM_IMPLEMENTATION_PROGRESS.md for how to invoke them.

// Read-only: groups this user's rooms by studyTaskId and reports every group
// with more than one room, so a duplicate can be reviewed before
// CleanupDuplicateStudyRooms (below) is ever run. Never changes anything.
export const FindDuplicateStudyRooms = query({
  args: { userId: v.id("UserTable") },
  handler: async (ctx, args) => {
    const rooms = await ctx.db
      .query("studyRooms")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const byTask = new Map<Id<"studyPlanTasks">, Doc<"studyRooms">[]>();
    for (const room of rooms) {
      if (!room.studyTaskId) continue;
      const group = byTask.get(room.studyTaskId) ?? [];
      group.push(room);
      byTask.set(room.studyTaskId, group);
    }

    const duplicateGroups = [];
    for (const [studyTaskId, group] of byTask) {
      if (group.length < 2) continue;
      const canonical = await pickCanonicalRoom(ctx, group);
      const rows = await Promise.all(
        group.map(async (room) => ({
          studyRoomId: room._id,
          title: room.title,
          status: room.status,
          totalSessions: (await getSessionsForRoom(ctx, room._id)).length,
          createdAt: room.createdAt,
          isCanonical: room._id === canonical._id,
        }))
      );
      duplicateGroups.push({ studyTaskId, rooms: rows });
    }
    return duplicateGroups;
  },
});

// Merges every detected duplicate group into its one canonical room: every
// duplicate's sessions (and everything scoped to those sessions in
// convex/StudyRoomWorkspace.ts's tables, which key off studyRoomSessionId
// and so move automatically) are re-parented onto the canonical room -
// nothing is deleted. A merged-away duplicate is kept, not removed: it's
// archived and its title is tagged "[Merged into ...]" so the merge stays
// visible and reversible, per the brief's "do not perform irreversible
// deletion of learning history." Returns a migration report - see
// AI_STUDY_ROOM_IMPLEMENTATION_PROGRESS.md for sample output and how to run
// this (it is not invoked automatically by anything).
export const CleanupDuplicateStudyRooms = mutation({
  args: { userId: v.id("UserTable") },
  handler: async (ctx, args) => {
    const rooms = await ctx.db
      .query("studyRooms")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const byTask = new Map<Id<"studyPlanTasks">, Doc<"studyRooms">[]>();
    for (const room of rooms) {
      if (!room.studyTaskId) continue;
      const group = byTask.get(room.studyTaskId) ?? [];
      group.push(room);
      byTask.set(room.studyTaskId, group);
    }

    const report = [];
    for (const [studyTaskId, group] of byTask) {
      if (group.length < 2) continue;
      const now = Date.now();
      const canonical = await pickCanonicalRoom(ctx, group);
      const duplicates = group.filter((room) => room._id !== canonical._id);

      let sessionsReassigned = 0;
      for (const duplicate of duplicates) {
        const sessions = await getSessionsForRoom(ctx, duplicate._id);
        for (const session of sessions) {
          await ctx.db.patch(session._id, { studyRoomId: canonical._id, updatedAt: now });
          sessionsReassigned++;
        }
        if (!duplicate.title.startsWith("[Merged into ")) {
          await ctx.db.patch(duplicate._id, {
            status: "archived",
            title: `[Merged into "${canonical.title}"] ${duplicate.title}`,
            updatedAt: now,
          });
        }
      }

      if (canonical.status === "archived") {
        await ctx.db.patch(canonical._id, { status: "active", updatedAt: now });
      }

      report.push({
        studyTaskId,
        canonicalStudyRoomId: canonical._id,
        mergedStudyRoomIds: duplicates.map((d) => d._id),
        sessionsReassigned,
        recordsRemoved: 0,
      });
    }
    return report;
  },
});

// Shown in Study Planner's "Delete this study plan?" dialog, so the learner
// knows how many Study Rooms the delete will also remove.
export const CountStudyRoomsForStudyPlan = query({
  args: {
    userId: v.id("UserTable"),
    studyPlanId: v.id("studyPlans"),
  },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.studyPlanId);
    if (!plan || plan.userId !== args.userId) return 0;
    const tasks = await ctx.db
      .query("studyPlanTasks")
      .withIndex("by_studyPlan", (q) => q.eq("studyPlanId", args.studyPlanId))
      .collect();
    const rooms = await findStudyRoomsForStudyPlan(
      ctx,
      args.userId,
      args.studyPlanId,
      tasks.map((t) => t._id)
    );
    return rooms.length;
  },
});

export const DeleteStudyRoom = mutation({
  args: {
    userId: v.id("UserTable"),
    studyRoomId: v.id("studyRooms"),
  },
  handler: async (ctx, args) => {
    await requireOwnedRoom(ctx, args.userId, args.studyRoomId);
    await deleteStudyRoomCascade(ctx, args.studyRoomId);
  },
});

// --- Session foundation ------------------------------------------------------
// M1 only creates and closes a session record - no AI Tutor conversation,
// Whiteboard, Code Editor, Notes or summary generation runs against it yet.
// The page that opens after this (app/(routes)/study-room/session/
// [sessionId]) is a placeholder landing explaining that the full Active
// Study Room experience arrives in a later milestone.

export const StartStudyRoomSession = mutation({
  args: {
    userId: v.id("UserTable"),
    studyRoomId: v.id("studyRooms"),
  },
  handler: async (ctx, args) => {
    await requireOwnedRoom(ctx, args.userId, args.studyRoomId);
    const now = Date.now();

    // A room has at most one live session. Leaving a session without
    // clicking End Session intentionally leaves it in_progress (that's how
    // "pause" works), so if one already exists - whether from a retried
    // submission moments ago or a session paused hours earlier - resume it
    // instead of opening a second, parallel session on the same room.
    const existingSessions = await ctx.db
      .query("studyRoomSessions")
      .withIndex("by_studyRoom", (q) => q.eq("studyRoomId", args.studyRoomId))
      .collect();
    const inProgress = existingSessions
      .filter((s) => s.status === "in_progress")
      .sort((a, b) => b.startedAt - a.startedAt)[0];
    if (inProgress) {
      await ctx.db.patch(args.studyRoomId, { lastAccessedAt: now, updatedAt: now });
      return { sessionId: inProgress._id };
    }

    const sessionId = await ctx.db.insert("studyRoomSessions", {
      studyRoomId: args.studyRoomId,
      userId: args.userId,
      status: "in_progress",
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.studyRoomId, { lastAccessedAt: now, updatedAt: now });
    return { sessionId };
  },
});

export const GetStudyRoomSession = query({
  args: {
    userId: v.id("UserTable"),
    sessionId: v.id("studyRoomSessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== args.userId) return null;
    const room = await ctx.db.get(session.studyRoomId);
    if (!room) return null;

    return {
      session: {
        _id: session._id,
        status: session.status,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        durationSeconds: session.durationSeconds,
        summaryStatus: session.summaryStatus ?? "none",
        summaryGeneratedAt: session.summaryGeneratedAt,
      },
      room: {
        _id: room._id,
        title: room.title,
        topic: room.topic,
        objective: room.objective,
        category: room.category,
        difficulty: room.difficulty,
        learningPreferences: room.learningPreferences,
        additionalInstructions: room.additionalInstructions,
        // M5 - raw reference ids, read by app/api/study-room/tutor/start to
        // pull live integration context at session-start time, plus the
        // resolved display payload for any UI that wants to show "linked
        // from X" (e.g. the room detail page).
        studyPlanId: room.studyPlanId,
        studyTaskId: room.studyTaskId,
        questionBankCollectionId: room.questionBankCollectionId,
        questionBankQuestionIds: room.questionBankQuestionIds,
        resumeMatchAnalysisId: room.resumeMatchAnalysisId,
        interviewReviewId: room.interviewReviewId,
        linkedSources: await resolveLinkedSource(ctx, room),
      },
    };
  },
});

// M5 - reverse lookup for the Study Planner Task Details screen: "show
// relevant Study Room session references within the corresponding Study
// Planner task." Only ever reads studyRooms/studyRoomSessions (this
// module's own tables), scoped to the caller's own userId - the Task
// Details page calls this directly rather than this module importing
// anything from StudyPlanner.ts, so there's no cross-module import cycle.
export const GetStudyRoomsForStudyTask = query({
  args: {
    userId: v.id("UserTable"),
    studyTaskId: v.id("studyPlanTasks"),
  },
  handler: async (ctx, args) => {
    const rooms = await ctx.db
      .query("studyRooms")
      .withIndex("by_studyTask", (q) => q.eq("studyTaskId", args.studyTaskId))
      .collect();
    const owned = rooms.filter((r) => r.userId === args.userId);

    return Promise.all(
      owned.map(async (room) => {
        const sessions = await getSessionsForRoom(ctx, room._id);
        const latest = [...sessions].sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
        return {
          studyRoomId: room._id,
          roomTitle: room.title,
          roomStatus: room.status,
          lastActivityAt: Math.max(room.lastAccessedAt ?? 0, latest?.startedAt ?? 0, room.createdAt),
          latestSession: latest
            ? {
                _id: latest._id,
                status: latest.status,
                startedAt: latest.startedAt,
                summaryStatus: latest.summaryStatus ?? "none",
              }
            : null,
        };
      })
    );
  },
});

// --- M2: AI Tutor voice/text conversation -----------------------------------
// Delegates the actual conversational LLM to the same ElevenLabs
// Conversational AI pipeline the Mock Interview feature already uses (see
// app/api/study-room/tutor/start/route.ts) - this module never calls an LLM
// directly itself. These functions only persist the resulting transcript so
// it survives a reconnect and can be shown when the session is reopened.

// Called once the Tutor's ElevenLabs session connects, so the session row
// always reflects the *current* live conversation id.
export const SaveStudyRoomElevenLabsConversation = mutation({
  args: {
    userId: v.id("UserTable"),
    sessionId: v.id("studyRoomSessions"),
    elevenlabsConversationId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOwnedSession(ctx, args.userId, args.sessionId);
    await ctx.db.patch(args.sessionId, {
      elevenlabsConversationId: args.elevenlabsConversationId,
      updatedAt: Date.now(),
    });
  },
});

// Appends one conversation turn (learner or Tutor). Called from the client
// the moment ElevenLabs' onMessage fires for that turn, so the transcript is
// durable even if the browser closes mid-session.
export const AppendStudyRoomMessage = mutation({
  args: {
    userId: v.id("UserTable"),
    sessionId: v.id("studyRoomSessions"),
    role: v.union(v.literal("tutor"), v.literal("learner")),
    text: v.string(),
    source: v.optional(v.union(v.literal("voice"), v.literal("text"))),
  },
  handler: async (ctx, args) => {
    await requireOwnedSession(ctx, args.userId, args.sessionId);
    const now = Date.now();
    await ctx.db.insert("studyRoomMessages", {
      studyRoomSessionId: args.sessionId,
      userId: args.userId,
      role: args.role,
      text: args.text,
      source: args.source,
      createdAt: now,
    });
    await ctx.db.patch(args.sessionId, { updatedAt: now });
  },
});

// Full conversation history for a session, oldest first - used both to
// redisplay the transcript when a session is reopened and to build the
// `conversation_history` dynamic variable so a reconnected Tutor session can
// pick up where it left off (see app/api/study-room/tutor/start).
export const GetStudyRoomMessages = query({
  args: {
    userId: v.id("UserTable"),
    sessionId: v.id("studyRoomSessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== args.userId) return [];
    const messages = await ctx.db
      .query("studyRoomMessages")
      .withIndex("by_session_createdAt", (q) => q.eq("studyRoomSessionId", args.sessionId))
      .collect();
    return messages.map((m) => ({
      _id: m._id,
      role: m.role,
      text: m.text,
      source: m.source,
      createdAt: m.createdAt,
    }));
  },
});

// Ends a session - either an explicit, learner-initiated "End Session" click
// (`reason: "completed"`, the default and the only way to get "completed")
// or the beforeunload/sendBeacon path in TutorCall.tsx catching a closed/
// refreshed tab mid-session (`reason: "abandoned"`, from
// app/api/study-room/tutor/end). The `if (status !== "in_progress") return`
// guard is what makes "repeated completion actions don't create duplicate
// records" true - a session can only ever leave "in_progress" once, no
// matter how many times this is called afterward (e.g. a late sendBeacon
// arriving after the learner already clicked End Session is a no-op).
export const EndStudyRoomSession = mutation({
  args: {
    userId: v.id("UserTable"),
    sessionId: v.id("studyRoomSessions"),
    reason: v.optional(v.union(v.literal("completed"), v.literal("abandoned"))),
    // Phase 1 - the calling tab's Tutor lease id. When given, a tab that
    // doesn't hold the session's *active* lease can't end it (e.g. a second
    // tab being closed must not kill the live Tutor running in the owning
    // tab). Omitted -> previous behaviour, unchanged.
    clientId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await requireOwnedSession(ctx, args.userId, args.sessionId);
    if (session.status !== "in_progress") return;
    const now = Date.now();
    const lease = await getTutorLease(ctx, args.sessionId);
    if (args.clientId && lease && lease.clientId !== args.clientId && lease.expiresAt > now) return;
    await ctx.db.patch(args.sessionId, {
      status: args.reason ?? "completed",
      endedAt: now,
      durationSeconds: Math.round((now - session.startedAt) / 1000),
      updatedAt: now,
    });
    if (lease) await ctx.db.delete(lease._id);
  },
});

// M2 - "Repeat Lesson" used to reactivate (and wipe) one specific finished
// session row in place. That destroyed the learner's own history - exactly
// what the M2 brief's "Preserve Learning History" requirement rules out -
// and was also a second, parallel session-creation mechanism alongside
// StartStudyRoomSession, which the brief explicitly asks not to have. Both
// the Study Room dashboard (RoomCard) and the "Repeat" button on a past
// session row (SessionRow) now call StartStudyRoomSession with that
// session's studyRoomId instead: it resumes the room's live session if one
// exists, or starts a brand-new attempt under the SAME canonical room
// otherwise - every previous attempt's transcript, summary and completion
// timestamp stays exactly as it was. RepeatStudyRoomSession is removed
// rather than left in place unused, since keeping a destructive mutation
// around that nothing calls would just invite the same bug again later.

// --- Phase 1: single-active-tab Tutor lease ---------------------------------
// Only one browser tab may run the live ElevenLabs Tutor (and hold the
// microphone) for a session. The owning tab acquires a lease, renews it on a
// heartbeat, and releases it on exit. A tab that disappears without
// releasing just lets the lease expire (TUTOR_LEASE_MS), after which any tab
// can take it - so a crashed tab never locks a session forever.
const TUTOR_LEASE_MS = 90_000;

async function getTutorLease(ctx: MutationCtx | QueryCtx, sessionId: Id<"studyRoomSessions">) {
  return await ctx.db
    .query("studyRoomTutorLeases")
    .withIndex("by_session", (q) => q.eq("studyRoomSessionId", sessionId))
    .first();
}

// A session sitting at "in_progress" with no live (unexpired) Tutor lease
// for longer than this is treated as abandoned - stale in a way that
// normally only happens from before Phase 1's lease/beforeunload tracking
// existed, or a crashed tab that never got to send its beacon. Long enough
// that a session which just started (before its tab has acquired its first
// lease) or a lease mid-renewal is never mistaken for stale.
const STALE_IN_PROGRESS_GRACE_MS = 2 * 60_000;

// Self-healing reconciliation for the exact "a session looks permanently
// 'In Progress' in Recent Sessions/My Study Rooms, but nothing is actually
// live" symptom: a session has no currently-active Tutor connection when it
// has no lease row at all, or its lease has expired (no tab has renewed it
// within TUTOR_LEASE_MS). Only ends sessions this user owns. Nothing is
// deleted - the session row, its transcript, notes and summary are
// untouched; only `status`/`endedAt`/`durationSeconds` change, exactly like
// a normal EndStudyRoomSession(reason: "abandoned") call - so this is safe
// to run as often as useful (called once per Study Room dashboard load from
// app/(routes)/study-room/page.tsx).
export const ReconcileStaleInProgressSessions = mutation({
  args: { userId: v.id("UserTable") },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("studyRoomSessions")
      .withIndex("by_user_status", (q) => q.eq("userId", args.userId).eq("status", "in_progress"))
      .collect();
    const now = Date.now();
    let reconciled = 0;

    for (const session of sessions) {
      if (now - session.updatedAt < STALE_IN_PROGRESS_GRACE_MS) continue;
      const lease = await getTutorLease(ctx, session._id);
      const hasLiveLease = !!lease && lease.expiresAt > now;
      if (hasLiveLease) continue;

      await ctx.db.patch(session._id, {
        status: "abandoned",
        endedAt: now,
        durationSeconds: Math.round((now - session.startedAt) / 1000),
        updatedAt: now,
      });
      if (lease) await ctx.db.delete(lease._id);
      reconciled++;
    }

    return { reconciled };
  },
});

// `force` is an explicit "use this tab instead" takeover - the previous
// owner notices on its next heartbeat (or immediately, via BroadcastChannel,
// when it's in the same browser) and disconnects itself.
export const AcquireTutorLease = mutation({
  args: {
    userId: v.id("UserTable"),
    sessionId: v.id("studyRoomSessions"),
    clientId: v.string(),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const session = await requireOwnedSession(ctx, args.userId, args.sessionId);
    if (session.status !== "in_progress") return { ok: false as const, reason: "session_ended" as const };
    const now = Date.now();
    const lease = await getTutorLease(ctx, args.sessionId);
    if (!lease) {
      await ctx.db.insert("studyRoomTutorLeases", {
        studyRoomSessionId: args.sessionId,
        userId: args.userId,
        clientId: args.clientId,
        expiresAt: now + TUTOR_LEASE_MS,
        updatedAt: now,
      });
      return { ok: true as const };
    }
    if (lease.clientId === args.clientId || lease.expiresAt <= now || args.force) {
      await ctx.db.patch(lease._id, { clientId: args.clientId, expiresAt: now + TUTOR_LEASE_MS, updatedAt: now });
      return { ok: true as const };
    }
    return { ok: false as const, reason: "held_elsewhere" as const };
  },
});

// Heartbeat. Fails (ok: false -> the caller must stop its Tutor) only when
// another tab actively holds the lease, i.e. it took over. If the lease row
// is simply missing or stale (e.g. React Strict Mode's dev-only effect
// re-run released it, or a release beacon raced the heartbeat) and nobody
// else claimed it, this tab quietly re-establishes it.
export const RenewTutorLease = mutation({
  args: {
    userId: v.id("UserTable"),
    sessionId: v.id("studyRoomSessions"),
    clientId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await requireOwnedSession(ctx, args.userId, args.sessionId);
    if (session.status !== "in_progress") return { ok: false as const };
    const now = Date.now();
    const lease = await getTutorLease(ctx, args.sessionId);
    if (!lease) {
      await ctx.db.insert("studyRoomTutorLeases", {
        studyRoomSessionId: args.sessionId,
        userId: args.userId,
        clientId: args.clientId,
        expiresAt: now + TUTOR_LEASE_MS,
        updatedAt: now,
      });
      return { ok: true as const };
    }
    if (lease.clientId !== args.clientId && lease.expiresAt > now) return { ok: false as const };
    await ctx.db.patch(lease._id, { clientId: args.clientId, expiresAt: now + TUTOR_LEASE_MS, updatedAt: now });
    return { ok: true as const };
  },
});

// Only the owner can release; anyone else's release is a no-op.
export const ReleaseTutorLease = mutation({
  args: {
    userId: v.id("UserTable"),
    sessionId: v.id("studyRoomSessions"),
    clientId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOwnedSession(ctx, args.userId, args.sessionId);
    const lease = await getTutorLease(ctx, args.sessionId);
    if (lease && lease.clientId === args.clientId) await ctx.db.delete(lease._id);
  },
});

// --- M4: AI-generated lesson summary -----------------------------------------
// The actual Gemini call happens in app/api/study-room/summary/generate -
// this module never calls an LLM itself, same separation as every other
// generation feature in this app (Question Bank, Study Planner). These
// functions only guard against duplicate concurrent generation and persist
// the result.

// Transitions a session's summary into "generating", but only from a state
// where starting a new generation makes sense: `force` (an explicit
// "Regenerate" click) allows it from any state; without `force` (the
// completion screen's own auto-trigger), it only proceeds from "none" or
// "failed" - never from "generating" (something is already in flight) or
// "ready" (a summary already exists; don't silently replace it without the
// learner asking). This is what "duplicate summaries are avoided" means
// here - there is only ever one summary per session, patched in place.
export const BeginSummaryGeneration = mutation({
  args: { userId: v.id("UserTable"), sessionId: v.id("studyRoomSessions"), force: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const session = await requireOwnedSession(ctx, args.userId, args.sessionId);
    if (session.status === "in_progress") {
      return { ok: false as const, status: session.summaryStatus ?? "none" };
    }
    const currentStatus = session.summaryStatus ?? "none";
    if (!args.force && currentStatus !== "none" && currentStatus !== "failed") {
      return { ok: false as const, status: currentStatus };
    }
    await ctx.db.patch(args.sessionId, { summaryStatus: "generating", updatedAt: Date.now() });
    return { ok: true as const, status: "generating" as const };
  },
});

export const SaveSessionSummary = mutation({
  args: { userId: v.id("UserTable"), sessionId: v.id("studyRoomSessions"), summary: v.any() },
  handler: async (ctx, args) => {
    await requireOwnedSession(ctx, args.userId, args.sessionId);
    const now = Date.now();
    await ctx.db.patch(args.sessionId, {
      summary: args.summary,
      summaryStatus: "ready",
      summaryGeneratedAt: now,
      updatedAt: now,
    });
  },
});

export const MarkSummaryFailed = mutation({
  args: { userId: v.id("UserTable"), sessionId: v.id("studyRoomSessions") },
  handler: async (ctx, args) => {
    await requireOwnedSession(ctx, args.userId, args.sessionId);
    await ctx.db.patch(args.sessionId, { summaryStatus: "failed", updatedAt: Date.now() });
  },
});

export const GetSessionSummary = query({
  args: { userId: v.id("UserTable"), sessionId: v.id("studyRoomSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== args.userId) return null;
    return {
      status: session.summaryStatus ?? "none",
      summary: session.summary ?? null,
      generatedAt: session.summaryGeneratedAt,
    };
  },
});
