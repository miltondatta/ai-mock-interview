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

    return Promise.all(
      sorted.map(async (session) => {
        const room = await ctx.db.get(session.studyRoomId);
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
      })
    );
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
    const limited = sorted.slice(0, args.limit ?? 10);

    return Promise.all(
      limited.map(async (session) => {
        const room = await ctx.db.get(session.studyRoomId);
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
      })
    );
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
    const studyRoomId = await ctx.db.insert("studyRooms", {
      userId: args.userId,
      title: args.title,
      topic: args.topic,
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
export const DeleteStudyRoom = mutation({
  args: {
    userId: v.id("UserTable"),
    studyRoomId: v.id("studyRooms"),
  },
  handler: async (ctx, args) => {
    await requireOwnedRoom(ctx, args.userId, args.studyRoomId);
    const sessions = await getSessionsForRoom(ctx, args.studyRoomId);
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }
    await ctx.db.delete(args.studyRoomId);
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
  },
  handler: async (ctx, args) => {
    const session = await requireOwnedSession(ctx, args.userId, args.sessionId);
    if (session.status !== "in_progress") return;
    const now = Date.now();
    await ctx.db.patch(args.sessionId, {
      status: args.reason ?? "completed",
      endedAt: now,
      durationSeconds: Math.round((now - session.startedAt) / 1000),
      updatedAt: now,
    });
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
