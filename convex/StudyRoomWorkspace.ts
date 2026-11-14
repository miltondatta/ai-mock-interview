import { mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

// AI Study Room - M3 workspace persistence (Whiteboard, Code Editor, Notes,
// panel layout, and the Tutor's tool-action audit trail). Split out from
// convex/StudyRoom.ts purely for file size - same module, same independence
// rules: never reads/writes Study Planner, Question Bank or Interview
// tables, and every function is scoped to the caller's own userId exactly
// like StudyRoom.ts already does.

const WORKSPACE_TOOL = v.union(v.literal("whiteboard"), v.literal("code"), v.literal("notes"));
const TOOL_ACTION_STATUS = v.union(v.literal("applied"), v.literal("rejected"), v.literal("timed_out"));

// Defensive server-side caps, independent of whatever the client already
// clamped - "validate every action on the server" per the M3 spec.
const MAX_NOTE_LENGTH = 50_000;
const MAX_CODE_LENGTH = 50_000;
const MAX_ACTION_SUMMARY_LENGTH = 400;
const MAX_RUN_OUTPUT_LENGTH = 5_000;

// M4 - "prevent accidental overwriting of newer saved content". Every save
// mutation below takes an optional `expectedUpdatedAt`: the `updatedAt` the
// client last saw for this row (from its own last successful load or save).
// If the row has since been updated by someone/something else (a different
// tab, a Tutor tool action), the stored `updatedAt` will be newer than that,
// and the save is skipped instead of blindly overwriting - the client gets
// `{ ok: false, conflict: true }` back and surfaces a save-error state
// rather than silently losing the other write. A first-ever save (no
// existing row, or no `expectedUpdatedAt` passed) always proceeds. This is
// a lightweight last-write-wins guard, not a merge/CRDT - adequate for one
// learner in one session, which is this module's only real scenario.
function checkNotStale(existingUpdatedAt: number | undefined, expectedUpdatedAt: number | undefined) {
  if (existingUpdatedAt === undefined || expectedUpdatedAt === undefined) return true;
  return existingUpdatedAt <= expectedUpdatedAt;
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

// --- Whiteboard ---------------------------------------------------------------

export const GetWhiteboard = query({
  args: { userId: v.id("UserTable"), sessionId: v.id("studyRoomSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== args.userId) return null;
    const row = await ctx.db
      .query("studyRoomWhiteboards")
      .withIndex("by_session", (q) => q.eq("studyRoomSessionId", args.sessionId))
      .unique();
    return row ? { snapshot: row.snapshot, updatedAt: row.updatedAt } : null;
  },
});

export const SaveWhiteboardSnapshot = mutation({
  args: {
    userId: v.id("UserTable"),
    sessionId: v.id("studyRoomSessions"),
    snapshot: v.any(),
    expectedUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOwnedSession(ctx, args.userId, args.sessionId);
    const existing = await ctx.db
      .query("studyRoomWhiteboards")
      .withIndex("by_session", (q) => q.eq("studyRoomSessionId", args.sessionId))
      .unique();
    if (!checkNotStale(existing?.updatedAt, args.expectedUpdatedAt)) {
      return { ok: false as const, conflict: true as const, latestUpdatedAt: existing!.updatedAt };
    }
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { snapshot: args.snapshot, updatedAt: now });
    } else {
      await ctx.db.insert("studyRoomWhiteboards", {
        studyRoomSessionId: args.sessionId,
        userId: args.userId,
        snapshot: args.snapshot,
        updatedAt: now,
      });
    }
    return { ok: true as const, updatedAt: now };
  },
});

// --- Code Editor ---------------------------------------------------------------

export const GetCodeFiles = query({
  args: { userId: v.id("UserTable"), sessionId: v.id("studyRoomSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== args.userId) return [];
    const files = await ctx.db
      .query("studyRoomCodeFiles")
      .withIndex("by_session_order", (q) => q.eq("studyRoomSessionId", args.sessionId))
      .collect();
    return files
      .sort((a, b) => a.order - b.order)
      .map((f) => ({
        _id: f._id,
        filename: f.filename,
        language: f.language,
        content: f.content,
        order: f.order,
        lastRun: f.lastRun ?? null,
        updatedAt: f.updatedAt,
      }));
  },
});

export const CreateCodeFile = mutation({
  args: {
    userId: v.id("UserTable"),
    sessionId: v.id("studyRoomSessions"),
    filename: v.string(),
    language: v.string(),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOwnedSession(ctx, args.userId, args.sessionId);
    const existing = await ctx.db
      .query("studyRoomCodeFiles")
      .withIndex("by_session", (q) => q.eq("studyRoomSessionId", args.sessionId))
      .collect();
    const now = Date.now();
    const content = (args.content ?? "").slice(0, MAX_CODE_LENGTH);
    const fileId = await ctx.db.insert("studyRoomCodeFiles", {
      studyRoomSessionId: args.sessionId,
      userId: args.userId,
      filename: args.filename,
      language: args.language,
      content,
      order: existing.length,
      createdAt: now,
      updatedAt: now,
    });
    return { fileId };
  },
});

export const UpdateCodeFile = mutation({
  args: {
    userId: v.id("UserTable"),
    sessionId: v.id("studyRoomSessions"),
    fileId: v.id("studyRoomCodeFiles"),
    filename: v.optional(v.string()),
    language: v.optional(v.string()),
    content: v.optional(v.string()),
    expectedUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOwnedSession(ctx, args.userId, args.sessionId);
    const file = await ctx.db.get(args.fileId);
    if (!file || file.studyRoomSessionId !== args.sessionId || file.userId !== args.userId) {
      throw new Error("Code file not found.");
    }
    if (!checkNotStale(file.updatedAt, args.expectedUpdatedAt)) {
      return { ok: false as const, conflict: true as const, latestUpdatedAt: file.updatedAt };
    }
    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (args.filename !== undefined) patch.filename = args.filename;
    if (args.language !== undefined) patch.language = args.language;
    if (args.content !== undefined) patch.content = args.content.slice(0, MAX_CODE_LENGTH);
    await ctx.db.patch(args.fileId, patch);
    return { ok: true as const, updatedAt: now };
  },
});

// M4 - records only the most recent run's output per file (see the schema
// comment on studyRoomCodeFiles.lastRun). Called right after
// /api/study-room/code/run returns, so reopening a session shows what the
// code last did instead of looking like it was never run.
export const RecordCodeRun = mutation({
  args: {
    userId: v.id("UserTable"),
    sessionId: v.id("studyRoomSessions"),
    fileId: v.id("studyRoomCodeFiles"),
    stdout: v.string(),
    stderr: v.string(),
    exitCode: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOwnedSession(ctx, args.userId, args.sessionId);
    const file = await ctx.db.get(args.fileId);
    if (!file || file.studyRoomSessionId !== args.sessionId || file.userId !== args.userId) return;
    await ctx.db.patch(args.fileId, {
      lastRun: {
        stdout: args.stdout.slice(0, MAX_RUN_OUTPUT_LENGTH),
        stderr: args.stderr.slice(0, MAX_RUN_OUTPUT_LENGTH),
        exitCode: args.exitCode,
        ranAt: Date.now(),
      },
    });
  },
});

export const DeleteCodeFile = mutation({
  args: { userId: v.id("UserTable"), sessionId: v.id("studyRoomSessions"), fileId: v.id("studyRoomCodeFiles") },
  handler: async (ctx, args) => {
    await requireOwnedSession(ctx, args.userId, args.sessionId);
    const file = await ctx.db.get(args.fileId);
    if (!file || file.studyRoomSessionId !== args.sessionId || file.userId !== args.userId) return;
    await ctx.db.delete(args.fileId);
  },
});

// --- Notes -----------------------------------------------------------------

export const GetNotes = query({
  args: { userId: v.id("UserTable"), sessionId: v.id("studyRoomSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== args.userId) return null;
    const row = await ctx.db
      .query("studyRoomNotes")
      .withIndex("by_session", (q) => q.eq("studyRoomSessionId", args.sessionId))
      .unique();
    return row ? { title: row.title, content: row.content, updatedAt: row.updatedAt } : null;
  },
});

export const SaveNotes = mutation({
  args: {
    userId: v.id("UserTable"),
    sessionId: v.id("studyRoomSessions"),
    title: v.string(),
    content: v.string(),
    expectedUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOwnedSession(ctx, args.userId, args.sessionId);
    const content = args.content.slice(0, MAX_NOTE_LENGTH);
    const existing = await ctx.db
      .query("studyRoomNotes")
      .withIndex("by_session", (q) => q.eq("studyRoomSessionId", args.sessionId))
      .unique();
    if (!checkNotStale(existing?.updatedAt, args.expectedUpdatedAt)) {
      return { ok: false as const, conflict: true as const, latestUpdatedAt: existing!.updatedAt };
    }
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { title: args.title, content, updatedAt: now });
    } else {
      await ctx.db.insert("studyRoomNotes", {
        studyRoomSessionId: args.sessionId,
        userId: args.userId,
        title: args.title,
        content,
        updatedAt: now,
      });
    }
    return { ok: true as const, updatedAt: now };
  },
});

// --- Workspace layout --------------------------------------------------------

export const GetWorkspaceLayout = query({
  args: { userId: v.id("UserTable"), sessionId: v.id("studyRoomSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== args.userId) return null;
    const row = await ctx.db
      .query("studyRoomWorkspaceLayout")
      .withIndex("by_session", (q) => q.eq("studyRoomSessionId", args.sessionId))
      .unique();
    return row
      ? {
          openTools: row.openTools,
          activeTool: row.activeTool,
          maximizedTool: row.maximizedTool,
          panelWeights: row.panelWeights,
        }
      : null;
  },
});

export const SaveWorkspaceLayout = mutation({
  args: {
    userId: v.id("UserTable"),
    sessionId: v.id("studyRoomSessions"),
    openTools: v.array(WORKSPACE_TOOL),
    activeTool: v.optional(WORKSPACE_TOOL),
    maximizedTool: v.optional(WORKSPACE_TOOL),
    panelWeights: v.optional(v.object({ whiteboard: v.number(), code: v.number(), notes: v.number() })),
  },
  handler: async (ctx, args) => {
    await requireOwnedSession(ctx, args.userId, args.sessionId);
    const existing = await ctx.db
      .query("studyRoomWorkspaceLayout")
      .withIndex("by_session", (q) => q.eq("studyRoomSessionId", args.sessionId))
      .unique();
    const now = Date.now();
    const data = {
      openTools: args.openTools,
      activeTool: args.activeTool,
      maximizedTool: args.maximizedTool,
      panelWeights: args.panelWeights,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("studyRoomWorkspaceLayout", {
        studyRoomSessionId: args.sessionId,
        userId: args.userId,
        ...data,
      });
    }
  },
});

// --- Tutor tool-action audit trail -------------------------------------------
// Called by the client right after a Tutor-initiated client tool (see
// Workspace.tsx) actually applies, is rejected by the learner, or times out
// waiting for approval. Never stores the full payload - just enough to know
// what happened and when.

export const LogToolAction = mutation({
  args: {
    userId: v.id("UserTable"),
    sessionId: v.id("studyRoomSessions"),
    tool: WORKSPACE_TOOL,
    actionType: v.string(),
    summary: v.string(),
    status: TOOL_ACTION_STATUS,
  },
  handler: async (ctx, args) => {
    await requireOwnedSession(ctx, args.userId, args.sessionId);
    await ctx.db.insert("studyRoomToolActions", {
      studyRoomSessionId: args.sessionId,
      userId: args.userId,
      tool: args.tool,
      actionType: args.actionType,
      summary: args.summary.slice(0, MAX_ACTION_SUMMARY_LENGTH),
      status: args.status,
      createdAt: Date.now(),
    });
  },
});
