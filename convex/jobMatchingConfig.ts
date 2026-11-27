import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireSession } from "./admin";

// Job Matching Configuration (P0). Lets an authorized admin change
// job-matching/job-discovery business rules per client without a source
// change or redeploy - see JOB_PERSISTENCE_FILTERING_INVESTIGATION_REPORT.md
// for the P1-P7 roadmap this unblocks. This milestone implements storage,
// the admin UI's backend, validation, authorization, the audit trail, and a
// reusable access mechanism - it deliberately does NOT yet change how
// convex/jobDiscovery.ts:refreshCandidateMatches, convex/jobSyncRunner.ts, or
// convex/ProfessionalProfile.ts behave, except for automaticJobSyncEnabled,
// which this milestone enforces for real at the sync entry points
// (convex/http.ts's n8n gateway and convex/jobDiscovery.ts's
// triggerInitialJobSearch) per its own explicit instruction.

export type RecommendationSortOrder = "score_desc" | "newest_first";

export interface JobMatchingConfig {
  minimumMatchScore: number;
  requireIsMatch: boolean;
  maxRecommendationsPerCandidate: 60 | 70 | 75;
  recommendationSortOrder: RecommendationSortOrder;
  reevaluateAfterProfileUpdate: boolean;
  automaticJobSyncEnabled: boolean;
}

// Applied whenever no JobMatchingConfigTable row exists yet (fresh
// deployment, or the table was never seeded) - every consumer reads through
// getEffectiveJobMatchingConfig/GetEffectiveConfig below, so nothing in the
// app can ever see a missing/undefined config, only these defaults.
export const DEFAULT_JOB_MATCHING_CONFIG: JobMatchingConfig = {
  minimumMatchScore: 70,
  requireIsMatch: true,
  maxRecommendationsPerCandidate: 75,
  recommendationSortOrder: "score_desc",
  reevaluateAfterProfileUpdate: true,
  automaticJobSyncEnabled: true,
};

type ConfigRow = Doc<"JobMatchingConfigTable">;

async function getConfigRow(ctx: QueryCtx | MutationCtx): Promise<ConfigRow | null> {
  const rows = await ctx.db.query("JobMatchingConfigTable").collect();
  return rows[0] ?? null;
}

function toConfig(row: ConfigRow | null): JobMatchingConfig {
  if (!row) return DEFAULT_JOB_MATCHING_CONFIG;
  return {
    minimumMatchScore: row.minimumMatchScore,
    requireIsMatch: row.requireIsMatch,
    maxRecommendationsPerCandidate: row.maxRecommendationsPerCandidate,
    recommendationSortOrder: row.recommendationSortOrder,
    reevaluateAfterProfileUpdate: row.reevaluateAfterProfileUpdate,
    automaticJobSyncEnabled: row.automaticJobSyncEnabled,
  };
}

// --- Reusable server-side access mechanism (Section 5) -------------------------
//
// Two forms, so every kind of Convex function can reach the same config
// without duplicating this lookup:
//   - getEffectiveJobMatchingConfig(ctx): for any query/mutation that already
//     has ctx.db (e.g. a future change to convex/ProfessionalProfile.ts or
//     convex/jobDiscovery.ts's refreshCandidateMatches).
//   - GetEffectiveConfig (internalQuery): for an action, which has no ctx.db
//     of its own (e.g. convex/jobSyncRunner.ts, convex/http.ts's httpAction,
//     convex/jobDiscovery.ts's triggerInitialJobSearch) - called via
//     ctx.runQuery(internal.jobMatchingConfig.GetEffectiveConfig, {}).
// Both always return a complete JobMatchingConfig, falling back to
// DEFAULT_JOB_MATCHING_CONFIG when no row exists yet - a caller never has to
// null-check.
export async function getEffectiveJobMatchingConfig(ctx: QueryCtx | MutationCtx): Promise<JobMatchingConfig> {
  return toConfig(await getConfigRow(ctx));
}

export const GetEffectiveConfig = internalQuery({
  args: {},
  handler: async (ctx): Promise<JobMatchingConfig> => {
    return await getEffectiveJobMatchingConfig(ctx);
  },
});

// --- Admin read ------------------------------------------------------------------

export const GetJobMatchingConfig = query({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<JobMatchingConfig & { updatedAt: number | null; updatedBy: string | null }> => {
    await requireSession(ctx, args.token);
    const row = await getConfigRow(ctx);
    return {
      ...toConfig(row),
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  },
});

// Last N audit entries, most recent first - enough for an admin to see what
// changed and by whom without a second, separate "audit log" page.
const MAX_AUDIT_ENTRIES = 50;

export const GetJobMatchingConfigAudit = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    return await ctx.db
      .query("JobMatchingConfigAuditTable")
      .withIndex("by_changedAt")
      .order("desc")
      .take(MAX_AUDIT_ENTRIES);
  },
});

// --- Admin write (validated, audited) --------------------------------------------

// Admin username for the audit trail and updatedBy. Looked up directly
// (rather than exported from convex/admin.ts) for the same reason
// convex/jobSyncShared.ts/extractSkills.ts duplicate other small helpers
// locally instead of widening another module's exports for one lookup.
async function getAdminUsername(ctx: QueryCtx | MutationCtx): Promise<string> {
  const admins = await ctx.db.query("AdminTable").collect();
  return admins[0]?.username ?? "admin";
}

function assertValidMinimumMatchScore(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error("Minimum job match score must be a whole number between 0 and 100.");
  }
}

const updatableArgs = {
  minimumMatchScore: v.optional(v.number()),
  requireIsMatch: v.optional(v.boolean()),
  // v.union(v.literal(...)) already rejects any value other than 60/70/75 -
  // Convex's own argument validation enforces this before the handler runs,
  // so no separate runtime check is needed for this field.
  maxRecommendationsPerCandidate: v.optional(v.union(v.literal(60), v.literal(70), v.literal(75))),
  // Same reasoning - the union validator itself is the enum check.
  recommendationSortOrder: v.optional(v.union(v.literal("score_desc"), v.literal("newest_first"))),
  reevaluateAfterProfileUpdate: v.optional(v.boolean()),
  automaticJobSyncEnabled: v.optional(v.boolean()),
};

type UpdatablePatch = Partial<JobMatchingConfig>;

export const UpdateJobMatchingConfig = mutation({
  args: { token: v.string(), ...updatableArgs },
  handler: async (ctx, args): Promise<JobMatchingConfig> => {
    await requireSession(ctx, args.token);
    const { token: _token, ...rawPatch } = args;

    if (rawPatch.minimumMatchScore !== undefined) assertValidMinimumMatchScore(rawPatch.minimumMatchScore);

    // Only keys actually submitted (not undefined) participate in the diff
    // below - an admin partially updating the form never clobbers the other
    // settings back to stale values, and never generates an audit entry for
    // a field they didn't touch.
    const patch: UpdatablePatch = Object.fromEntries(
      Object.entries(rawPatch).filter(([, value]) => value !== undefined)
    ) as UpdatablePatch;

    const existingRow = await getConfigRow(ctx);
    const current = toConfig(existingRow);
    const adminUsername = await getAdminUsername(ctx);
    const now = Date.now();

    // One audit row per field that actually changed value - "do not create
    // audit entries when an administrator saves unchanged values" (Section 4).
    const changedKeys = (Object.keys(patch) as (keyof JobMatchingConfig)[]).filter(
      (key) => current[key] !== patch[key]
    );

    const merged: JobMatchingConfig = { ...current, ...patch };

    if (existingRow) {
      await ctx.db.patch(existingRow._id, { ...patch, updatedAt: now, updatedBy: adminUsername });
    } else {
      await ctx.db.insert("JobMatchingConfigTable", { ...merged, updatedAt: now, updatedBy: adminUsername });
    }

    for (const key of changedKeys) {
      await ctx.db.insert("JobMatchingConfigAuditTable", {
        adminUsername,
        settingKey: key,
        previousValue: current[key],
        newValue: patch[key],
        changedAt: now,
      });
    }

    return merged;
  },
});
