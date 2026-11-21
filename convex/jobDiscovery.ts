import { internalMutation, internalQuery, internalAction, action, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import { computeProfileCompletion } from "./ProfessionalProfile";
import { matchJob } from "./jobMatching";
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

// --- Profile version (D1 field, computed here for the first time) --------------
//
// A plain, deterministic fingerprint - NOT a cryptographic hash - of exactly
// the profile fields convex/jobMatching.ts's matchJob() and
// convex/ProfessionalProfile.ts's computeProfileCompletion() actually read.
// A non-cryptographic hash is deliberate and sufficient: this value is only
// ever used to answer "did anything matching-relevant change since last
// time," never for anything security-sensitive. It is implemented as plain
// arithmetic over character codes (two independent FNV-1a-style passes,
// concatenated) rather than Node's `crypto` module, because this function
// runs inside a Convex internalMutation, which executes in Convex's default
// (non-"use node") runtime - unlike the Next.js-side lib/adminAuth.ts, which
// can use `node:crypto` because API routes run in a Node runtime. Using a
// Node-only API here would risk a runtime error this milestone has no way
// to self-test against (per "don't test yourself").
//
// workExperience is intentionally read in its STORED ORDER and limited to
// the first 3 entries - exactly mirroring matchJob()'s scoreTitle(), which
// only ever looks at `(p.workExperience ?? []).slice(0, 3)` in array order.
// Reordering work experience can change which 3 entries scoreTitle sees, so
// this must NOT be sorted. Every other list below only affects set-membership
// or substring checks in matchJob(), never list order, so each one is
// sorted before hashing - this avoids an unnecessary version bump (and so an
// unnecessary recompute, once D3 wires the trigger) when a candidate merely
// reorders skills/projects/certifications/education without changing their
// content.
function fnv1a(input: string, seed: number): string {
  let hash = seed;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiplication, kept in 32-bit range via >>> 0.
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

// (D3 compatibility adjustment) Widened from `Profile | null` to
// `Partial<Profile> | null` - the one strictly necessary change this
// milestone's own scope restrictions allow in this file. D3's
// CreateProfile/UpdateProfile need to compute a version from a draft
// (existing row merged with an in-flight, not-yet-saved patch), which is
// only a Partial<Profile>, not a full Doc - exactly the same reason
// convex/ProfessionalProfile.ts's own computeProfileCompletion() already
// takes `Partial<ProfileDoc> | null` rather than a full Doc. Every field
// access below was already optional-chained, so this widening changes no
// behavior for the existing D2 caller (a full Doc is a valid
// Partial<Profile>).
export function computeProfileVersion(profile: Partial<Profile> | null): string {
  const relevant = {
    targetJobRole: profile?.targetJobRole ?? null,
    headline: profile?.headline ?? null,
    bio: profile?.bio ?? null,
    yearsOfExperience: profile?.yearsOfExperience ?? null,
    location: profile?.location ?? null,
    targetCompany: profile?.targetCompany ?? null,
    // Order-sensitive - see comment above. Position only, first 3, as-stored.
    recentPositions: (profile?.workExperience ?? []).slice(0, 3).map((w) => w.position),
    // Order-insensitive below - sorted for a stable fingerprint.
    skills: [...(profile?.skills ?? [])].sort(),
    certificationNames: (profile?.certifications ?? []).map((c) => c.name).sort(),
    projectTexts: (profile?.projects ?? []).map((p) => `${p.title}\u0000${p.description ?? ""}`).sort(),
    educationDegrees: (profile?.education ?? []).map((e) => e.degree ?? "").sort(),
  };
  const serialized = JSON.stringify(relevant);
  return `${fnv1a(serialized, 0x811c9dc5)}${fnv1a(serialized, 0x12345679)}`;
}

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
export const refreshCandidateMatches = internalMutation({
  args: {
    userId: v.id("UserTable"),
    trigger: v.union(v.literal("profile_update"), v.literal("daily_cycle")),
  },
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const runId = await ctx.db.insert("candidateMatchRuns", {
      trigger: args.trigger,
      userId: args.userId,
      startedAt,
      status: "running",
    });

    let candidatesProcessed = 0;
    let matchesWritten = 0;
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

        const scanned = await ctx.db
          .query("jobs")
          .withIndex("by_active_posted", (q) => q.eq("active", true))
          .order("desc")
          .take(MAX_JOBS_FOR_MATCHING);
        const eligible = scanned.filter((job) => isJobEligible(job, today));
        const rescoredJobIds = new Set(eligible.map((job) => job._id));

        for (const job of eligible) {
          // matchJob() itself, its weights/thresholds/reasons generation,
          // is used completely unmodified - this only persists what it
          // already returns.
          const result = matchJob(job, profile);
          const existing = await ctx.db
            .query("candidateJobMatches")
            .withIndex("by_user_job", (q) => q.eq("userId", args.userId).eq("jobId", job._id))
            .first();
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
          } else {
            await ctx.db.insert("candidateJobMatches", { userId: args.userId, jobId: job._id, ...fields });
          }
          matchesWritten++;
        }

        // Prune rows for jobs no longer eligible, re-checking each row's OWN
        // referenced job directly (ctx.db.get), NOT merely "was it in this
        // run's scanned/capped pool" - a job that is still genuinely active
        // but simply fell outside the MAX_JOBS_FOR_MATCHING window this run
        // must never be pruned just because of that cap, or a previously
        // valid recommendation would regress for a reason unrelated to the
        // job's own eligibility. Jobs rescored above are skipped here
        // (already known-eligible, already handled).
        for (const row of existingMatches) {
          if (rescoredJobIds.has(row.jobId)) continue;
          const job = await ctx.db.get(row.jobId);
          const stillEligible = !!job && isJobEligible(job, today);
          if (!stillEligible) {
            await ctx.db.delete(row._id);
            matchesPruned++;
          }
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

    // Mirrors convex/jobSyncRunner.ts's own status determination: "failed"
    // only when the error left nothing useful behind; "partial" when some
    // writes/prunes happened before the error; "success" otherwise.
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
      matchesPruned,
      ...(errorMessage ? { errorMessage } : {}),
    });

    return { status, candidatesProcessed, matchesWritten, matchesPruned, errorMessage };
  },
});

// --- Manual admin trigger (D2 only - a temporary operational facility) ---------
//
// Same two-layer auth pattern as convex/himalayasSync.ts's AdminSyncHimalayas
// / convex/jobicy.ts's AdminSyncJobicy: a public `action` that re-verifies
// the admin session token itself (api.admin.VerifySession) before doing
// anything, rather than trusting whatever already checked the token on the
// way in. The actual matching logic stays in the `internalMutation` above,
// which is NOT exported to the client in any form - this action is the only
// way to reach it from outside Convex, exactly mirroring how
// AdminSyncHimalayas is the only way to reach syncHimalayas(). There is no
// candidate-facing entry point anywhere in this file: an ordinary signed-in
// user has no token that VerifySession will accept, so no candidate can
// trigger a refresh for themselves or anyone else through this action.
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
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(api.admin.VerifySession, { token: args.token });
    if (!session) throw new Error("Unauthorized");
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
  handler: async (ctx) => {
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
  handler: async (ctx, args) => {
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
  handler: async (ctx, args) => {
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
  handler: async (ctx) => {
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
        const page = await ctx.runQuery(internal.jobDiscovery.listCandidateProfilesPage, {
          paginationOpts: { numItems: DAILY_MATCH_PAGE_SIZE, cursor },
        });

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
export const GetCandidateMatches = query({
  args: {
    userId: v.id("UserTable"),
    limit: v.optional(v.number()),
    matchesOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
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
  handler: async (ctx, args) => {
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
    await ctx.runMutation(internal.jobDiscovery.refreshCandidateMatches, {
      userId: args.userId,
      trigger: "profile_update",
    });
  },
});
