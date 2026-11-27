import { internalMutation, internalQuery, internalAction, action, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { PaginationResult } from "convex/server";
import { api, internal } from "./_generated/api";
// computeProfileCompletion/computeProfileVersion live in their own,
// dependency-free module specifically so this file and
// convex/ProfessionalProfile.ts never import from each other - see
// profileMatchingShared.ts's own header comment for why that cycle, though
// runtime-safe, broke TypeScript's return-type inference for Convex
// queries project-wide once introduced (surfaced as repeated, seemingly
// unrelated "implicitly has an 'any' type" build errors).
import { computeProfileCompletion, computeProfileVersion } from "./profileMatchingShared";
import { matchJob, type MatchResult } from "./jobMatching";
// P1's one, reusable config-access mechanism (P0) - this file never reads
// JobMatchingConfigTable directly or keeps its own copy of the defaults.
import { getEffectiveJobMatchingConfig } from "./jobMatchingConfig";
// Reused as-is for triggerInitialJobSearch below - the exact same
// provider-sync entry points convex/himalayasSync.ts's AdminSyncHimalayas
// and convex/jobicy.ts's AdminSyncJobicy already call. No sync/fetch logic
// is duplicated here; this file only decides WHEN to call them.
import { syncHimalayas } from "./himalayasSync";
import { syncJobicy } from "./jobicy";
// Reused as-is for D5's GetCandidateMatches, so its output is structurally
// identical to convex/Jobs.ts's own GetJobsForUser result - this is what
// lets the Jobs Page/Dashboard swap between the two with no change to any
// existing rendering/filtering/sorting code (see D5's progress log entry).
import type { JobForUser, PublicJob } from "./Jobs";

// Personalized Job Discovery - shared matching/persistence helper (D2) plus
// the automatic daily matching cycle (D4). See
// PERSONALIZED_JOB_DISCOVERY_TECHNICAL_DESIGN.md and
// PERSONALIZED_JOB_DISCOVERY_IMPLEMENTATION_ROADMAP.md. This file provides
// the one reusable matching/persistence primitive (refreshCandidateMatches,
// D2), a manual admin-only entry point for controlled verification (D2),
// the automatic profile-save trigger's target (wired from
// convex/ProfessionalProfile.ts in D3 - nothing in THIS file changed for
// that), and now (D4) the daily, unattended cron-driven cycle that calls the
// exact same D2 helper for every candidate with a complete profile. It never
// fetches from any external provider, never changes
// convex/jobMatching.ts's scoring, and never introduces a second matching
// implementation - the daily cycle is purely an orchestration layer around
// the same refreshCandidateMatches already built in D2.

type Profile = Doc<"UserProfileTable">;

// --- Job-pool bound for matching -------------------------------------------------
//
// The approved technical design (section 6) reasoned that reading the FULL
// active job set via the indexed by_active_posted query would be "well
// within budget" at the live row count observed during the J9/incident
// investigation. Re-checking that assumption against the actual incident
// data before implementing: AdminListJobs' real production crash
// ("Too many bytes read in a single function execution", documented in
// JOB_SEARCH_IMPLEMENTATION_PROGRESS.md) happened at ~2,437 total rows
// (~18.2MB, via an UNINDEXED collect() across both active and inactive
// rows). The current active-job count alone (2,516, per the most recent
// `npx convex data` check during the D-series investigation) is already in
// the same order of magnitude, so an unbounded scan of just the active rows
// would very plausibly hit the same ~16MB per-function-execution ceiling
// today, not at some future hypothetical scale.
//
// Rather than silently risk that failure, this deliberately reuses the same
// bound convex/Jobs.ts's GetJobsForUser already uses for its own (live,
// request-time) scan - MAX_JOBS_SCANNED = 300 - as the one already-proven-
// safe magic number in this codebase, instead of inventing a new one. This
// is an intentional, evidence-based deviation from the technical design
// document's section 6 (documented here and in
// PERSONALIZED_JOB_DISCOVERY_IMPLEMENTATION_PROGRESS.md), not an oversight -
// a true full-pool, windowed/paginated scan is explicitly left to a later
// milestone, once real evidence calls for it, per the roadmap's own
// "do not introduce speculative batch infrastructure in D2" instruction.
const MAX_JOBS_FOR_MATCHING = 300;

// Mirrors convex/Jobs.ts's own (non-exported) todayDateKey() exactly, for
// the same applicationDeadline freshness check GetJobsForUser already
// applies. Duplicated locally rather than imported - convex/Jobs.ts doesn't
// export it, and this codebase's established convention (extractSkills.ts,
// jobSyncShared.ts) is to duplicate small helpers rather than widen another
// module's exports for one line of code.
function todayDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isJobEligible(job: Doc<"jobs">, today: string): boolean {
  return job.active && (!job.applicationDeadline || job.applicationDeadline >= today);
}

// computeProfileVersion() itself now lives in profileMatchingShared.ts
// (imported above, D1/D3) - moved out specifically to break a circular
// import with convex/ProfessionalProfile.ts. Nothing in this file needed
// to change beyond the import; every call site below is unchanged.

// --- Shared matching/persistence helper -----------------------------------------
//
// Computes and persists ONE candidate's recommendations. Safe to call
// repeatedly for the same candidate (idempotent upsert, keyed by the
// by_user_job index - never a duplicate row per (userId, jobId)) and safe to
// call for a candidate with no profile at all or an incomplete one (prunes
// any existing rows rather than throwing or leaving stale data behind).
//
// `trigger` is accepted as an argument, not hardcoded, specifically so D3
// (profile-update trigger) and D4 (daily cron) can both call this exact same
// function later and pass their own real trigger value - this milestone
// does not wire either of those callers yet. The manual admin action below
// is this milestone's own, documented caller - see its own comment for why
// it passes "profile_update" rather than a (schema-unsupported) distinct
// "manual" value.
// Explicit result type, and an explicit return-type annotation on the
// handler below - required, not stylistic. Other functions in this same
// file (AdminRefreshCandidateMatches, triggerInitialJobSearch,
// runDailyMatchingCycle) call this one via `internal.jobDiscovery.
// refreshCandidateMatches`, which means resolving THEIR return type
// requires resolving this module's own exported type - which includes
// THEM - a genuine self-referential cycle TypeScript cannot infer through.
// `npx tsc --noEmit` surfaced this directly ("implicitly has type 'any'
// because it is referenced directly or indirectly in its own initializer"),
// and that one unresolved cycle was silently collapsing Convex's whole
// generated `api`/`internal` type to `any` for every module project-wide -
// the real explanation for the run of seemingly unrelated "implicitly any"
// build errors across completely unrelated files. An explicit return type
// here (and on every other function below that self-references this
// module) breaks the cycle: TypeScript no longer needs to infer anything
// from the module's shape, so there is nothing left to resolve circularly.
export interface RefreshCandidateMatchesResult {
  status: "success" | "partial" | "failed";
  candidatesProcessed: number;
  // Total rows actually inserted or patched (matchesInserted + matchesUpdated)
  // - kept at its original meaning for backward compatibility with any
  // existing caller reading only this field (e.g. runDailyMatchingCycle).
  matchesWritten: number;
  // P2 breakdown of matchesWritten, plus matchesSkipped (a selected,
  // qualifying recommendation that required no write at all because its
  // meaningful fields already matched the stored row - see
  // sameRecommendation() below).
  matchesInserted: number;
  matchesUpdated: number;
  matchesSkipped: number;
  matchesPruned: number;
  errorMessage: string | undefined;
}

// --- P2: "did this recommendation meaningfully change?" -------------------------
//
// Only the fields that are actually shown to, or that decide whether a job
// is recommended to, the candidate - never operational metadata
// (generatedAt/lastUpdatedAt/profileVersion are deliberately excluded, same
// as a timestamp would be). matchJob() itself is never called from here;
// this only compares two already-computed results.

// matchedSkills/missingSkills are built by iterating job.requiredSkills in
// THAT array's order (see jobMatching.ts's scoreSkills()) - order here
// reflects an admin's/provider's arbitrary skill ordering, not anything
// candidate-specific, so it is not semantically meaningful. Compared as a
// multiset (sorted copies, never the original arrays, and never a JSON
// string comparison, which would false-positive on a harmless reorder or
// false-negative on genuinely different data presented in a convenient
// order) rather than by array reference or index position.
function sameSkillSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

// matchReasons IS ordered strongest-first by matchJob() itself (see
// jobMatching.ts's own "strongest first" comment and its contribution-based
// sort) - a change in order is a genuine change in what's being
// communicated to the candidate, so this is compared positionally, not as a
// set.
function sameOrderedList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function sameRecommendation(existing: Doc<"candidateJobMatches">, result: MatchResult): boolean {
  return (
    existing.matchScore === result.score &&
    existing.isMatch === result.isMatch &&
    sameSkillSet(existing.matchedSkills, result.matchedSkills) &&
    sameSkillSet(existing.missingSkills, result.missingSkills) &&
    sameOrderedList(existing.matchReasons, result.reasons)
  );
}

export const refreshCandidateMatches = internalMutation({
  args: {
    userId: v.id("UserTable"),
    trigger: v.union(v.literal("profile_update"), v.literal("daily_cycle")),
  },
  handler: async (ctx, args): Promise<RefreshCandidateMatchesResult> => {
    const startedAt = Date.now();
    const runId = await ctx.db.insert("candidateMatchRuns", {
      trigger: args.trigger,
      userId: args.userId,
      startedAt,
      status: "running",
    });

    let candidatesProcessed = 0;
    let matchesInserted = 0;
    let matchesUpdated = 0;
    let matchesSkipped = 0;
    let matchesPruned = 0;
    let errorMessage: string | undefined;

    // Everything below is deliberately inside one try/catch so that ANY
    // failure - expected (bad id) or not - still lets this same mutation
    // finish by patching `runId` to a final status, rather than throwing
    // uncaught and rolling back the entire transaction (which would also
    // silently discard the "running" row inserted above, since a Convex
    // mutation that throws rolls back every write it made). This is what
    // "ensure failed matching operations are recorded appropriately"
    // requires in a single-mutation design.
    try {
      const user = await ctx.db.get(args.userId);
      if (!user) throw new Error("User not found.");

      const profile: Profile | null = await ctx.db
        .query("UserProfileTable")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .first();
      candidatesProcessed = 1;

      const completion = computeProfileCompletion(profile);
      const existingMatches = await ctx.db
        .query("candidateJobMatches")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();

      if (!completion.isComplete || !profile) {
        // No profile, or an incomplete one: GetJobsForUser never scores
        // such a candidate today, and this helper mirrors that rule - no
        // personalized recommendation should exist. Remove every existing
        // row rather than leaving stale ones a candidate could otherwise
        // keep seeing after their profile regresses to incomplete.
        for (const row of existingMatches) {
          await ctx.db.delete(row._id);
          matchesPruned++;
        }
      } else {
        const profileVersion = computeProfileVersion(profile);
        const today = todayDateKey();
        // P1: the configured eligibility/limit/sort rules, read fresh on
        // every run (never cached across runs, never hardcoded) - see
        // convex/jobMatchingConfig.ts. Falls back to the P0 defaults on its
        // own when no admin has ever saved a configuration row.
        const config = await getEffectiveJobMatchingConfig(ctx);

        const scanned = await ctx.db
          .query("jobs")
          .withIndex("by_active_posted", (q) => q.eq("active", true))
          .order("desc")
          .take(MAX_JOBS_FOR_MATCHING);
        const eligible = scanned.filter((job) => isJobEligible(job, today));

        // Every job this run has an opinion about, scored at most once each.
        // matchJob() itself, its weights/thresholds/reasons generation, is
        // used completely unmodified - P1 only decides what happens to what
        // it already returns.
        type Scored = { job: Doc<"jobs">; result: MatchResult };
        const scoredById = new Map<Id<"jobs">, Scored>();
        for (const job of eligible) {
          scoredById.set(job._id, { job, result: matchJob(job, profile) });
        }

        // Existing rows whose job fell outside this run's MAX_JOBS_FOR_MATCHING
        // scan window are re-scored individually (one ctx.db.get each - never
        // a second full-table scan) rather than left untouched: the
        // configured eligibility rule (score/isMatch) can newly disqualify a
        // row even when nothing about isJobEligible() itself changed, and
        // Section 6 of this milestone requires that check for every existing
        // row, not only the freshly-scanned ones. A job that's gone or now
        // genuinely ineligible is simply left unscored here - the prune pass
        // below removes its row for that reason on its own.
        for (const row of existingMatches) {
          if (scoredById.has(row.jobId)) continue;
          const job = await ctx.db.get(row.jobId);
          if (job && isJobEligible(job, today)) {
            scoredById.set(row.jobId, { job, result: matchJob(job, profile) });
          }
        }

        // --- Rule A/B: configurable eligibility -----------------------------------
        // score >= minimumMatchScore always; additionally isMatch === true
        // only when requireIsMatch is enabled. A high score never implies
        // isMatch on its own (jobMatching.ts's own relevance gate is
        // independent of score - see JOB_PERSISTENCE_FILTERING_INVESTIGATION_REPORT.md
        // section C), so this is checked explicitly rather than assumed.
        const qualifying = [...scoredById.values()].filter(
          ({ result }) => result.score >= config.minimumMatchScore && (!config.requireIsMatch || result.isMatch)
        );

        // --- Rule: configurable, deterministic sort -------------------------------
        // postedAt is a required, always-numeric field on every job row
        // today, but an invalid/non-finite value (defensively) sorts as the
        // oldest possible date rather than throwing or producing a
        // nondeterministic order.
        const safePostedAt = (job: Doc<"jobs">) => (Number.isFinite(job.postedAt) ? job.postedAt : 0);
        const byIdAsc = (a: Scored, b: Scored) =>
          a.job._id === b.job._id ? 0 : a.job._id < b.job._id ? -1 : 1;
        qualifying.sort((a, b) => {
          if (config.recommendationSortOrder === "newest_first") {
            return safePostedAt(b.job) - safePostedAt(a.job) || b.result.score - a.result.score || byIdAsc(a, b);
          }
          // "score_desc" (default) - highest score first, newer posting as
          // the tiebreak, a stable job-id comparison as the final tiebreak.
          return b.result.score - a.result.score || safePostedAt(b.job) - safePostedAt(a.job) || byIdAsc(a, b);
        });

        // --- Rule: configurable cap, never padded ---------------------------------
        const selected = qualifying.slice(0, config.maxRecommendationsPerCandidate);
        const selectedJobIds = new Set(selected.map(({ job }) => job._id));

        // --- Persist only the selected, qualifying set ----------------------------
        // P2: one point read (by_user_job, same index as always - never a
        // duplicate read for the same candidate-job pair) decides between
        // three outcomes - skip entirely, patch, or insert - rather than
        // always patching/inserting as P1 did.
        for (const { job, result } of selected) {
          const existing = await ctx.db
            .query("candidateJobMatches")
            .withIndex("by_user_job", (q) => q.eq("userId", args.userId).eq("jobId", job._id))
            .first();

          if (existing && sameRecommendation(existing, result)) {
            // Every meaningful field already matches what's stored - no
            // write at all, not even to refresh generatedAt/lastUpdatedAt/
            // profileVersion (those are operational metadata, not
            // recommendation content, per this milestone's own instruction
            // not to write unchanged records merely to update timestamps).
            matchesSkipped++;
            continue;
          }

          const fields = {
            matchScore: result.score,
            isMatch: result.isMatch,
            matchedSkills: result.matchedSkills,
            missingSkills: result.missingSkills,
            matchReasons: result.reasons,
            profileVersion,
            generatedAt: Date.now(),
            status: "active" as const,
            lastUpdatedAt: Date.now(),
          };
          if (existing) {
            await ctx.db.patch(existing._id, fields);
            matchesUpdated++;
          } else {
            await ctx.db.insert("candidateJobMatches", { userId: args.userId, jobId: job._id, ...fields });
            matchesInserted++;
          }
        }

        // --- Prune every existing row not selected this run -----------------------
        // Whatever the reason - the job is no longer eligible at all, it no
        // longer meets the configured score/isMatch rule, or it qualified
        // but fell outside the configured cap after sorting - all three are
        // prune conditions per this milestone's own instruction. Scoped
        // entirely to this candidate's own rows (by_user, already the index
        // existingMatches was read from); the shared `jobs` row itself is
        // never touched, deleted, or deactivated here.
        for (const row of existingMatches) {
          if (selectedJobIds.has(row.jobId)) continue;
          await ctx.db.delete(row._id);
          matchesPruned++;
        }

        // Store the computed version on the profile itself too (D1's
        // optional field), so a future trigger (D3) has a same-row value to
        // compare against without a second table read. Only this one field
        // is touched - no other UserProfileTable field, and no change to
        // `updatedAt`, since this is internal bookkeeping, not a candidate-
        // visible profile edit.
        await ctx.db.patch(profile._id, { profileVersion });
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "Unknown error during candidate matching.";
      console.error(`candidate matching (${args.trigger}) failed for user ${args.userId} -`, errorMessage);
    }

    // Kept at its original meaning (total rows actually inserted or
    // patched) for backward compatibility with any existing reader of this
    // field (e.g. runDailyMatchingCycle, which only aggregates
    // matchesWritten/matchesPruned and is intentionally left unmodified -
    // see JOB_MATCHING_P2_IMPLEMENTATION_PROGRESS.md).
    const matchesWritten = matchesInserted + matchesUpdated;

    // Mirrors convex/jobSyncRunner.ts's own status determination: "failed"
    // only when the error left nothing useful behind; "partial" when some
    // writes/prunes happened before the error; "success" otherwise. P2
    // deliberately leaves this exact condition unchanged (matchesSkipped is
    // NOT added to it) - preserving P0/P1's existing status semantics takes
    // priority over the (debatable) case of a run that only ever skipped
    // already-correct rows before erroring.
    const status: "success" | "partial" | "failed" = errorMessage
      ? matchesWritten > 0 || matchesPruned > 0
        ? "partial"
        : "failed"
      : "success";

    await ctx.db.patch(runId, {
      finishedAt: Date.now(),
      status,
      candidatesProcessed,
      matchesWritten,
      matchesInserted,
      matchesUpdated,
      matchesSkipped,
      matchesPruned,
      ...(errorMessage ? { errorMessage } : {}),
    });

    return {
      status,
      candidatesProcessed,
      matchesWritten,
      matchesInserted,
      matchesUpdated,
      matchesSkipped,
      matchesPruned,
      errorMessage,
    };
  },
});

// --- Manual admin trigger (D2 only - a temporary operational facility) ---------
//
// Same two-layer auth pattern as convex/himalayasSync.ts's AdminSyncHimalayas
// / convex/jobicy.ts's AdminSyncJobicy: a public `action` that re-verifies
// the admin session token itself (api.admin.VerifySession) before doing
// anything, rather than trusting whatever already checked the token on the
// way in. The actual matching logic stays in the `internalMutation` above,
// which is NOT exported to the client in any form - this action (and, as of
// P4, RefreshMyCandidateMatches below) are the only ways to reach it from
// outside Convex, exactly mirroring how AdminSyncHimalayas is the only way
// to reach syncHimalayas(). This action itself still has no candidate-facing
// entry point: an ordinary signed-in user has no admin token that
// VerifySession will accept, so no candidate can trigger a refresh for
// themselves or anyone else through THIS action - see RefreshMyCandidateMatches
// for the candidate-facing counterpart P4 added.
//
// Trigger-value note (see PERSONALIZED_JOB_DISCOVERY_IMPLEMENTATION_PROGRESS.md
// for the full discussion): candidateMatchRuns.trigger only supports
// "profile_update" | "daily_cycle" (the two values approved in D1's schema).
// A manual admin-initiated run is neither, literally, but this milestone is
// explicitly forbidden from altering that schema without separate
// authorization. Of the two existing values, "profile_update" is the
// honest, documented approximation used here - it is the single-candidate
// shape (one `userId` set on the run row), exactly like a real profile-save
// trigger would be, unlike "daily_cycle" (multi-candidate, no `userId`).
// This is disclosed here and in the progress log precisely so it is never
// mistaken for an actual profile-save event by anyone reading the audit
// trail later.
export const AdminRefreshCandidateMatches = action({
  args: { token: v.string(), userId: v.id("UserTable") },
  handler: async (ctx, args): Promise<RefreshCandidateMatchesResult> => {
    const session = await ctx.runQuery(api.admin.VerifySession, { token: args.token });
    if (!session) throw new Error("Unauthorized");
    return await ctx.runMutation(internal.jobDiscovery.refreshCandidateMatches, {
      userId: args.userId,
      trigger: "profile_update",
    });
  },
});

// --- Candidate-facing manual trigger (P4) ---------------------------------------
//
// Lets the "Check for New Jobs" button (app/(routes)/jobs/page.tsx, via
// app/api/jobs/check-new/route.ts) refresh the clicking candidate's own
// recommendations once provider synchronization has finished, instead of
// leaving them to find out only on their next profile edit or the next
// daily cron tick. Deliberately an `action` wrapper around the same
// `internalMutation` above, exactly like AdminRefreshCandidateMatches,
// rather than exposing refreshCandidateMatches itself as a public mutation -
// a public mutation would be callable directly from any connected browser
// client (not only from this app's own server-side API routes), which is a
// materially larger exposure than this action, even though this app's
// per-user ownership checks are already only as strong as GetJobsForUser's/
// GetCandidateMatches'/CreateProfile's own (no working Convex-Clerk identity
// verification exists anywhere in this app today - see
// convex/jobDiscovery.ts's own GetCandidateMatches comment and
// JOB_DISCOVERY_CURRENT_LOGIC.md section 1 point 7 for the full, previously
// accepted record of that risk). The caller (check-new/route.ts) resolves
// `userId` server-side from the signed-in Clerk session via the existing
// utils/profileAuth.ts:resolveProfileUserId() - the same mechanism
// app/api/profile/* already uses - never from a client-supplied value.
//
// Same trigger-value approximation as AdminRefreshCandidateMatches above,
// for the same reason (candidateMatchRuns.trigger only supports
// "profile_update" | "daily_cycle" - no schema change was made for this
// milestone): a manual button click is, honestly, neither, but
// "profile_update" is the single-candidate shape that actually matches this
// call's own `userId`-scoped nature, unlike "daily_cycle."
export const RefreshMyCandidateMatches = action({
  args: { userId: v.id("UserTable") },
  handler: async (ctx, args): Promise<RefreshCandidateMatchesResult> => {
    return await ctx.runMutation(internal.jobDiscovery.refreshCandidateMatches, {
      userId: args.userId,
      trigger: "profile_update",
    });
  },
});

// --- Daily automated matching cycle (D4) ----------------------------------------
//
// Runs once a day (see convex/crons.ts), unattended, for every candidate -
// it does not depend on anyone being logged in. It reads only the already-
// synchronized central `jobs` table (no external HTTP call of any kind) and
// calls the exact same `refreshCandidateMatches` (D2) used by the manual
// trigger above and by D3's profile-save trigger - this file does not
// define a second matching implementation anywhere.

// Candidates per page read from UserProfileTable while paginating. Chosen
// ahead of actual need, not in response to it: the D-series investigation's
// own live check found 5 registered users and exactly 1 complete profile
// today, so this bound is a safety margin for future growth, not a fix for
// anything observed. Pagination (rather than one ctx.db.query(...).collect())
// is still used from the start specifically so this runner never needs a
// second look when that growth happens.
const DAILY_MATCH_PAGE_SIZE = 50;

// A "running" daily-cycle row older than this is treated as abandoned
// (e.g. the action crashed before reaching its own finishDailyMatchRun
// call) rather than a genuinely still-running cycle, so one stuck run can
// never permanently block every future day's cycle. Mirrors
// convex/jobSyncShared.ts's STALE_RUN_MS pattern/reasoning exactly, applied
// here to candidateMatchRuns instead of jobSyncRuns (this subsystem's own,
// separate audit table, never jobSyncRuns - per the roadmap's explicit
// instruction). One hour is generous for this runner's expected scale and
// still comfortably shorter than the 24-hour gap to the next scheduled run.
const STALE_DAILY_RUN_MS = 60 * 60 * 1000;

// Transactional check-and-insert, exactly like convex/jobSyncShared.ts's
// beginSyncRun, so two near-simultaneous daily-cycle triggers (e.g. a
// duplicate cron fire) can't both see "no running row" and start twice.
// Scoped ONLY to trigger === "daily_cycle" via the by_trigger_started index -
// a concurrent D3 profile-update run (trigger === "profile_update") is a
// completely different, expected-to-be-concurrent series and must never be
// mistaken for "another instance of the daily cycle." Per-candidate safety
// against a daily run and a D3 run landing on the same candidate at the
// same time is already handled by refreshCandidateMatches' own
// upsert-by-(userId, jobId) idempotency (D2) - this guard only prevents two
// daily CYCLES from overlapping, nothing more. Returns null (rather than
// throwing) when rejected, so the calling action can simply exit quietly -
// a duplicate/overlapping trigger is an expected, handled case here, not an
// error worth recording a second audit row for.
export const beginDailyMatchRun = internalMutation({
  args: {},
  // Explicit return type - required, not stylistic. See
  // RefreshCandidateMatchesResult's comment above: this function is called
  // from runDailyMatchingCycle in this same file via
  // `internal.jobDiscovery.beginDailyMatchRun`, which cannot have its type
  // inferred without resolving this module's own exported shape - a cycle
  // that collapses to `any` without an explicit annotation here.
  handler: async (ctx): Promise<Id<"candidateMatchRuns"> | null> => {
    const now = Date.now();
    const recent = await ctx.db
      .query("candidateMatchRuns")
      .withIndex("by_trigger_started", (q) => q.eq("trigger", "daily_cycle"))
      .order("desc")
      .take(5);
    const running = recent.find((r) => r.status === "running");
    if (running && now - running.startedAt < STALE_DAILY_RUN_MS) {
      console.error(
        `daily matching cycle: a run is already in progress (started ${new Date(running.startedAt).toISOString()}) - skipping this trigger.`
      );
      return null;
    }
    return await ctx.db.insert("candidateMatchRuns", { trigger: "daily_cycle", startedAt: now, status: "running" });
  },
});

export const finishDailyMatchRun = internalMutation({
  args: {
    runId: v.id("candidateMatchRuns"),
    status: v.union(v.literal("success"), v.literal("partial"), v.literal("failed")),
    candidatesProcessed: v.optional(v.number()),
    matchesWritten: v.optional(v.number()),
    matchesPruned: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  // Explicit return type for the same reason as beginDailyMatchRun above.
  handler: async (ctx, args): Promise<void> => {
    const { runId, status, candidatesProcessed, matchesWritten, matchesPruned, errorMessage } = args;
    await ctx.db.patch(runId, {
      finishedAt: Date.now(),
      status,
      candidatesProcessed,
      matchesWritten,
      matchesPruned,
      ...(errorMessage ? { errorMessage } : {}),
    });
  },
});

// One bounded page of UserProfileTable, for the daily cycle's action to
// page through via repeated ctx.runQuery calls (an action has no ctx.db of
// its own). Returns full profile rows (not just ids) because the action
// needs each one's actual field values to run the same
// computeProfileCompletion() check refreshCandidateMatches itself uses -
// reusing that live computation rather than trusting the cached
// `profileCompleted` flag keeps this consistent with D2's own source of
// truth, instead of introducing a second, potentially-stale notion of
// "complete." No new index was added for this (e.g. a by_profileCompleted
// index) - the roadmap's own D4 section explicitly reasoned that a full
// UserProfileTable scan is fine at the actual observed scale (1 complete
// profile, 5 users total), and adding an index is exactly the kind of
// schema change this milestone is restricted from making without separate
// authorization.
export const listCandidateProfilesPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  // Explicit return type for the same reason as beginDailyMatchRun above -
  // this is called from runDailyMatchingCycle in this same file.
  handler: async (ctx, args): Promise<PaginationResult<Doc<"UserProfileTable">>> => {
    return await ctx.db.query("UserProfileTable").paginate(args.paginationOpts);
  },
});

// The daily cycle's orchestrator. An `internalAction` (not a mutation),
// because it needs to call multiple separate Convex functions
// (listCandidateProfilesPage, refreshCandidateMatches, finishDailyMatchRun)
// as independent transactions spread across many candidates - exactly why
// convex/jobSyncRunner.ts's own orchestrator is an action rather than a
// mutation, for the same structural reason (fan-out across many
// ctx.runMutation/ctx.runQuery calls).
export const runDailyMatchingCycle = internalAction({
  args: {},
  // Explicit return type for the same reason as beginDailyMatchRun above -
  // this function itself self-references three siblings in this module.
  handler: async (ctx): Promise<void> => {
    const runId = await ctx.runMutation(internal.jobDiscovery.beginDailyMatchRun, {});
    if (runId === null) return; // another daily cycle is already in progress - see beginDailyMatchRun.

    let candidatesProcessed = 0;
    let matchesWritten = 0;
    let matchesPruned = 0;
    let candidateFailures = 0;
    let loopError: string | undefined;

    try {
      let cursor: string | null = null;
      let isDone = false;
      while (!isDone) {
        const page: PaginationResult<Doc<"UserProfileTable">> = await ctx.runQuery(
          internal.jobDiscovery.listCandidateProfilesPage,
          { paginationOpts: { numItems: DAILY_MATCH_PAGE_SIZE, cursor } }
        );

        for (const profile of page.page) {
          // Skip incomplete profiles entirely at this level, per the
          // roadmap's explicit instruction - this is the same, unmodified
          // computeProfileCompletion() refreshCandidateMatches itself
          // relies on (D2), so "complete enough to process" is decided
          // identically in both places, never by a second, divergent rule.
          if (!computeProfileCompletion(profile).isComplete) continue;

          candidatesProcessed++;
          // One candidate's failure must never stop the rest of the cycle -
          // each call is isolated in its own try/catch. In the ordinary
          // case this never throws at all: refreshCandidateMatches (D2)
          // already catches its own errors internally and always returns a
          // result object (status "success"/"partial"/"failed") rather than
          // throwing - this try/catch exists only to guard against an
          // unexpected failure in the ctx.runMutation call itself (e.g. a
          // transient platform error), not as the normal error-reporting
          // path for a candidate's own matching failure.
          try {
            const result = await ctx.runMutation(internal.jobDiscovery.refreshCandidateMatches, {
              userId: profile.userId,
              trigger: "daily_cycle",
            });
            matchesWritten += result.matchesWritten;
            matchesPruned += result.matchesPruned;
            if (result.status === "failed") candidateFailures++;
          } catch (err) {
            candidateFailures++;
            console.error(
              `daily matching cycle: unexpected error processing candidate ${profile.userId} -`,
              err instanceof Error ? err.message : err
            );
          }
        }

        cursor = page.continueCursor;
        isDone = page.isDone;
      }
    } catch (err) {
      // A failure in the pagination/listing itself (not a single
      // candidate's matching) - isolated from the per-candidate try/catch
      // above so it's distinguishable in candidateMatchRuns.errorMessage.
      loopError = err instanceof Error ? err.message : "Unknown error while listing candidate profiles.";
      console.error("daily matching cycle: candidate listing failed -", loopError);
    }

    // "If the daily cycle partially completes, record partial rather than
    // incorrectly reporting success" - success only when every eligible
    // candidate that was attempted succeeded AND the listing loop itself
    // never errored; failed only when nothing useful was accomplished at
    // all; partial covers every state in between (some candidates failed,
    // or the listing loop was interrupted after processing some candidates).
    const status: "success" | "partial" | "failed" = loopError
      ? candidatesProcessed > 0
        ? "partial"
        : "failed"
      : candidateFailures === 0
        ? "success"
        : candidateFailures === candidatesProcessed
          ? "failed"
          : "partial";

    const errorMessage =
      loopError ?? (candidateFailures > 0 ? `${candidateFailures} of ${candidatesProcessed} candidate(s) failed - see function logs.` : undefined);

    await ctx.runMutation(internal.jobDiscovery.finishDailyMatchRun, {
      runId,
      status,
      candidatesProcessed,
      matchesWritten,
      matchesPruned,
      errorMessage,
    });
  },
});

// --- Candidate-facing read query (D5) -------------------------------------------
//
// Reads this candidate's persisted recommendations (candidateJobMatches)
// and re-joins each one against the ORIGINAL `jobs` row, read live - no job
// field beyond `jobId` is ever duplicated into candidateJobMatches, exactly
// as D1/D2 were built. Each referenced job's CURRENT `active`/
// `applicationDeadline` state is re-checked here, right now, rather than
// trusted from whenever the row was last generated - a persisted row can
// only ever be stale in the small window between the last refresh (D2/D3/
// D4) and this read, never permanently, since every refresh already prunes
// a row whose job became ineligible; this live re-check just means a
// candidate is never shown a job that is ACTUALLY inactive/expired at this
// exact moment, even inside that small window.
//
// Output shape is deliberately identical to convex/Jobs.ts's GetJobsForUser
// (`{ jobs: JobForUser[] }`, same `match.reasons`/`matchedSkills`/
// `missingSkills`/`score` field names) plus two D5-specific additions
// (`hasPersistedMatches`, `lastRefreshedAt`) - this is what lets the Jobs
// Page/Dashboard pick between this query's result and GetJobsForUser's
// result without any change to their existing rendering, filtering,
// sorting, or pagination code (see those files' own D5 comments).
//
// Ownership note - read before changing this query's args: this takes
// `userId` as a plain argument, exactly like GetJobsForUser already does,
// because this application has no working Convex-Clerk identity
// verification today (confirmed by inspection: no convex/auth.config.ts,
// and app/ConvexClientProvider.tsx uses a plain ConvexProvider, never
// ConvexProviderWithClerk, so ctx.auth.getUserIdentity() returns null on
// every Convex call in this app). This was raised as an explicit blocker
// during D5 and the project owner, when asked, chose to accept the same
// risk level GetJobsForUser already carries rather than block this
// milestone on a broader authentication redesign - see
// PERSONALIZED_JOB_DISCOVERY_IMPLEMENTATION_PROGRESS.md's D5 entry for the
// full record of that decision. This query introduces NO additional
// exposure beyond what GetJobsForUser already has today.
// Doesn't self-reference anything in this module (pure ctx.db reads), so
// this wasn't part of the actual cycle - the explicit return type here is
// added anyway, for the same defense-in-depth reason every other handler
// in this file now has one: it also makes consuming this query from
// outside this file (app/(routes)/jobs/page.tsx, JobsForYou.tsx) resolve
// to a concrete type without relying on inference through `useQuery`.
export interface GetCandidateMatchesResult {
  hasPersistedMatches: boolean;
  lastRefreshedAt: number | null;
  personalized: boolean;
  totalActiveJobs: number;
  jobs: JobForUser[];
}

export const GetCandidateMatches = query({
  args: {
    userId: v.id("UserTable"),
    limit: v.optional(v.number()),
    matchesOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<GetCandidateMatchesResult> => {
    const limit = Math.max(1, Math.min(MAX_JOBS_FOR_MATCHING, Math.floor(args.limit ?? MAX_JOBS_FOR_MATCHING)));
    const today = todayDateKey();

    // "Exclude recommendation records marked as stale or removed" - every
    // row refreshCandidateMatches writes has status "active" (D2 never
    // writes "stale"/"removed"; obsolete rows are deleted outright, not
    // relabeled), so this filter is a no-op today, but it's the correct,
    // forward-compatible way to express the requirement regardless of how
    // many rows currently carry a non-"active" status.
    const rows = await ctx.db
      .query("candidateJobMatches")
      .withIndex("by_user_status", (q) => q.eq("userId", args.userId).eq("status", "active"))
      .collect();

    if (rows.length === 0) {
      // No persisted recommendations at all (incomplete profile, or a
      // complete one whose first refresh hasn't run yet) - the caller is
      // expected to fall back to GetJobsForUser's existing behavior in
      // this case (see app/(routes)/jobs/page.tsx and
      // app/(routes)/dashboard/JobsForYou.tsx's own D5 wiring), so the
      // exact field values below are never actually rendered.
      return { hasPersistedMatches: false, lastRefreshedAt: null as number | null, personalized: false, totalActiveJobs: 0, jobs: [] as JobForUser[] };
    }

    let oldestGeneratedAt: number | undefined;
    // Counts every eligible (active, not expired) recommendation this
    // candidate has - BEFORE the matchesOnly filter below - mirroring
    // GetJobsForUser's own `totalActiveJobs` semantics exactly (there, too,
    // it's the eligible-pool count regardless of matchesOnly, used by the
    // Dashboard's "browse all N openings" link and its "no jobs posted at
    // all" vs. "no strong matches" distinction). Getting this wrong would
    // make the Dashboard show the wrong empty-state message whenever
    // matchesOnly filters out every eligible job.
    let totalEligible = 0;
    const items: JobForUser[] = [];
    for (const row of rows) {
      const job = await ctx.db.get(row.jobId);
      if (!job || !isJobEligible(job, today)) continue; // source of truth re-checked live, never trusted stale
      totalEligible++;
      oldestGeneratedAt = oldestGeneratedAt === undefined ? row.generatedAt : Math.min(oldestGeneratedAt, row.generatedAt);
      if (args.matchesOnly && !row.isMatch) continue;
      const { active: _active, updatedAt: _updatedAt, ...publicJob } = job;
      items.push({
        job: publicJob as PublicJob,
        match: {
          score: row.matchScore,
          reasons: row.matchReasons,
          matchedSkills: row.matchedSkills,
          missingSkills: row.missingSkills,
        },
      });
    }

    // Same ordering GetJobsForUser already uses for its personalized
    // branch - highest score first, most recently posted as the tiebreak.
    items.sort((a, b) => (b.match!.score - a.match!.score) || (b.job.postedAt - a.job.postedAt));

    return {
      hasPersistedMatches: true,
      lastRefreshedAt: oldestGeneratedAt ?? null,
      personalized: true,
      totalActiveJobs: totalEligible,
      jobs: items.slice(0, limit),
    };
  },
});

// --- Initial job search on first profile completion (explicit request) --------
//
// Fires exactly once per candidate, from convex/ProfessionalProfile.ts's
// CreateProfile/UpdateProfile, the moment a profile FIRST becomes complete
// (see decideMatchingRefresh's shouldTriggerJobSearch there) - every
// matching-relevant edit after that keeps relying solely on the existing
// n8n "AI Mock Interview - External Job Synchronization" workflow's own
// 6-hourly schedule for fresh jobs, exactly as instructed ("rest job
// searching trigger will be done according to the cron job"). This file
// does not duplicate any fetch/normalize/persist logic - `syncHimalayas`/
// `syncJobicy` are the exact same functions the admin panel's manual
// buttons and the n8n HTTP gateway already call.
//
// Each provider call is isolated in its own try/catch, mirroring the n8n
// workflow's own two-independent-branches design: Jobicy's one-per-hour
// cooldown (enforced inside syncJobicy via beginSyncRun's minIntervalMs) or
// either provider's "a sync is already running" guard can legitimately
// reject this call (e.g. if the 6-hourly schedule happened to fire around
// the same moment) - that is an expected, handled outcome here, not an
// error that should stop Himalayas, stop the other provider, or prevent
// the matching call below from running against whatever jobs already
// exist.
//
// Matching is chained HERE, after both sync attempts, rather than scheduled
// separately by the caller - this is what actually fixes the timing gap
// found in the "no recommendations after profile creation" investigation:
// scheduling refreshCandidateMatches independently (even via
// ctx.scheduler.runAfter(0, ...)) would let the fast matching call finish
// before this slower external search does, reproducing the exact same
// "matched against zero/stale jobs" outcome. Calling refreshCandidateMatches
// (D2, unmodified) only after both syncs have been attempted guarantees
// this candidate is scored against the freshly-synced pool.
export const triggerInitialJobSearch = internalAction({
  args: { userId: v.id("UserTable") },
  // Explicit return type for the same reason as beginDailyMatchRun above -
  // this function self-references refreshCandidateMatches in this module.
  handler: async (ctx, args): Promise<void> => {
    // (P0) This is an automatic trigger (profile completion, not a button
    // click), so Job Matching Configuration's automaticJobSyncEnabled gates
    // it - same rule convex/http.ts's n8n gateway enforces, applied here for
    // the other automatic entry point. When disabled, this still matches
    // the candidate against whatever is already in `jobs` (reusing stored
    // jobs rather than skipping matching entirely).
    const config = await ctx.runQuery(internal.jobMatchingConfig.GetEffectiveConfig, {});
    if (config.automaticJobSyncEnabled) {
      try {
        await syncHimalayas(ctx);
      } catch (err) {
        console.error(
          "initial job search (profile completion): Himalayas sync rejected/failed -",
          err instanceof Error ? err.message : err
        );
      }
      try {
        await syncJobicy(ctx);
      } catch (err) {
        console.error(
          "initial job search (profile completion): Jobicy sync rejected/failed -",
          err instanceof Error ? err.message : err
        );
      }
    } else {
      console.log("initial job search (profile completion): automatic job synchronization is disabled - matching against already-stored jobs only.");
    }
    await ctx.runMutation(internal.jobDiscovery.refreshCandidateMatches, {
      userId: args.userId,
      trigger: "profile_update",
    });
  },
});
