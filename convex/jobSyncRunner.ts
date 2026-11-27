import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { PaginationResult } from "convex/server";
import type { Doc } from "./_generated/dataModel";
import type { SkillVocabularyEntry } from "./extractSkills";
import type { NormalizedProviderJob } from "./jobSyncShared";
// P3: reused exactly as-is, never duplicated or modified - matchJob() for
// scoring, computeProfileCompletion() for "is this profile complete"
// (the same, single definition convex/jobDiscovery.ts's own
// refreshCandidateMatches and runDailyMatchingCycle already use), and
// JobMatchingConfig purely as a type (no runtime import, so this file has
// no dependency on convex/jobMatchingConfig.ts's module graph - the actual
// config value is fetched via internal.jobMatchingConfig.GetEffectiveConfig,
// the same action-side access pattern P0 already established).
import { matchJob } from "./jobMatching";
import { computeProfileCompletion } from "./profileMatchingShared";
import type { JobMatchingConfig } from "./jobMatchingConfig";

// Shared synchronization runner (J6). Each provider adapter
// (convex/himalayasSync.ts, convex/jobicy.ts) supplies only what's actually
// provider-specific - its own fetchPage/normalize functions and its own
// page/rate settings - through a consistent options object, and calls this
// from its own thin, session-verified action. Everything else (sync-run
// bookkeeping, dedupe-key backfill, vocabulary loading, per-phase error
// isolation, expiry-sweep gating, and final status determination) lives
// here exactly once, instead of being duplicated per provider as it was
// through J3-J5. This is what lets J7 add unattended scheduling uniformly
// for every provider later, without a third hand-written copy of this
// orchestration.
//
// This file does not change how any job is fetched or normalized - it
// moves the ORCHESTRATION that already existed (duplicated) in
// convex/himalayasSync.ts and convex/jobicy.ts into one place, and reuses
// the exact same convex/jobSyncShared.ts mutations both adapters already
// called directly.

export type ProviderName = "himalayas" | "jobicy" | "remotive";

export interface ProviderFetchPage {
  jobs: unknown[];
  nextCursor?: string;
  // Explicit "more pages exist" flag, when a provider's API exposes one
  // (e.g. Jobicy's `hasMore`). Left undefined for a provider that doesn't
  // (e.g. Himalayas) - the stop condition then falls back to "no
  // nextCursor" / "empty page" alone, exactly as each adapter already did
  // before this milestone.
  hasMore?: boolean;
}

export interface ProviderSyncOptions {
  provider: ProviderName;
  // Per-provider sync cooldown between RUNS (e.g. Jobicy's documented
  // once-per-hour limit). Omit entirely for a provider with no such
  // restriction (Himalayas) - this is intentionally per-call, not global.
  minIntervalMs?: number;
  maxPages: number;
  pageDelayMs: number;
  fetchPage: (cursor: string | undefined) => Promise<ProviderFetchPage>;
  normalize: (raw: unknown, vocabulary: SkillVocabularyEntry[]) => NormalizedProviderJob | null;
}

export interface ProviderSyncResult {
  ok: boolean;
  status: "success" | "partial" | "failed";
  jobsFetched: number;
  jobsInserted: number;
  jobsUpdated: number;
  jobsExpired: number;
  skipped: number;
  // (P9) A job that reached upsertProviderJobsBatch but could not be
  // persisted (e.g. a malformed record, or - before P9's bounded-read fix -
  // an oversized dedupe-key group) - distinct from `skipped`, which counts
  // normalization-stage drops. See convex/jobSyncShared.ts's
  // upsertProviderJobsBatch for where this is actually counted.
  persistenceFailed: number;
  error?: string;
  // (J7) The jobSyncRuns row id for this run, as a string. Included so a
  // caller (e.g. the n8n HTTP gateway's failure notification) can reference
  // "the relevant synchronization run ID" per that milestone's requirement,
  // without adding a second place that tracks run identity.
  runId: string;
}

// --- P3: pre-insertion candidate-eligibility filter -------------------------------
//
// Evaluates a normalized provider job against every complete candidate
// profile, using the exact same, unmodified matchJob() and the P0/P1
// eligibility rule (score >= minimumMatchScore, plus isMatch === true when
// requireIsMatch is on) that convex/jobDiscovery.ts's refreshCandidateMatches
// already applies at the recommendation layer - this is the identical rule,
// reused rather than reinvented, just evaluated one step earlier (before
// shared persistence) rather than after.

// Mirrors convex/jobDiscovery.ts's own (unexported) DAILY_MATCH_PAGE_SIZE -
// duplicated locally rather than imported, per this codebase's established
// convention (extractSkills.ts/jobSyncShared.ts/Jobs.ts all duplicate small
// constants/helpers rather than widen another module's exports for one use).
const PROFILE_PAGE_SIZE = 50;

// (P11) Defensive bound on the removed-upstream sweep's own page loop
// (convex/jobSyncShared.ts:markRemovedUpstreamPage) - mirrors this file's
// existing `maxPages` convention for the provider-fetch loop. The real
// stop condition is each page's own `isDone` flag, which a finite `jobs`
// table always eventually reaches; this only guards against looping
// forever in some unforeseen, pathological case.
const MAX_REMOVAL_SWEEP_PAGES = 500;

// Pages through EVERY UserProfileTable row via the exact same paginated
// query convex/jobDiscovery.ts's runDailyMatchingCycle already uses
// (internal.jobDiscovery.listCandidateProfilesPage) - never a single
// unbounded ctx.db.query(...).collect() - and keeps only the rows
// computeProfileCompletion() (reused unmodified, never redefined) judges
// complete. Called exactly once per synchronization run, before any
// provider page is fetched, so every page below reuses this same in-memory
// array - no per-page or per-job profile re-fetch.
async function loadCompleteCandidateProfiles(ctx: ActionCtx): Promise<Doc<"UserProfileTable">[]> {
  const complete: Doc<"UserProfileTable">[] = [];
  let cursor: string | null = null;
  let isDone = false;
  while (!isDone) {
    const page: PaginationResult<Doc<"UserProfileTable">> = await ctx.runQuery(
      internal.jobDiscovery.listCandidateProfilesPage,
      { paginationOpts: { numItems: PROFILE_PAGE_SIZE, cursor } }
    );
    for (const profile of page.page) {
      if (computeProfileCompletion(profile).isComplete) complete.push(profile);
    }
    cursor = page.continueCursor;
    isDone = page.isDone;
  }
  return complete;
}

// True as soon as ONE complete profile qualifies - every candidate is
// still checked in order until one does (a job is never rejected merely
// because the first candidate evaluated didn't qualify), but evaluation
// stops the moment a qualifying candidate is found, per this milestone's
// explicit instruction that further evaluation is unnecessary once the
// shared-persistence question is already answered "yes."
//
// matchJob()'s parameter is typed Doc<"jobs"> (the stored, persisted shape)
// - NormalizedProviderJob is a different, pre-persistence shape (no _id,
// no `active`, etc.), so this cast is required to call the function at
// all. It is safe and does not change matchJob()'s behavior: every field
// matchJob() actually reads off a job (title, company, location, workMode,
// employmentType, salary*, requiredSkills) is present on
// NormalizedProviderJob with the same name and type; the handful it reads
// that NormalizedProviderJob has no equivalent for at all
// (minYearsExperience/maxYearsExperience/educationRequirement/
// requiredCertifications - admin-only fields, confirmed absent from
// providerJobValidator in convex/jobSyncShared.ts) come through as
// `undefined`, which scoreExperience()/scoreQualifications() already
// handle as "not assessable" for every provider-sourced job stored in
// `jobs` today (see JOB_DISCOVERY_CURRENT_LOGIC.md section 5) - this cast
// introduces no new behavior there, it only lets the identical, pre-
// existing tolerance apply one step earlier.
function qualifiesForAtLeastOneCandidate(
  job: NormalizedProviderJob,
  completeProfiles: readonly Doc<"UserProfileTable">[],
  config: JobMatchingConfig
): boolean {
  const asJobDoc = job as unknown as Doc<"jobs">;
  for (const profile of completeProfiles) {
    const result = matchJob(asJobDoc, profile);
    if (result.score >= config.minimumMatchScore && (!config.requireIsMatch || result.isMatch)) {
      return true;
    }
  }
  return false;
}

export async function runProviderSync(ctx: ActionCtx, options: ProviderSyncOptions): Promise<ProviderSyncResult> {
  const { provider, minIntervalMs, maxPages, pageDelayMs, fetchPage, normalize } = options;

  // --- Concurrency + rate-limit gate ---------------------------------------------
  // Throws (uncaught, by design - this propagates to the caller's action,
  // then to the HTTP route, then to the admin UI's existing error banner)
  // when another run for this provider is already in flight, or (only for
  // a provider that passes minIntervalMs, e.g. Jobicy) the last run started
  // too recently. This is a *rejected attempt*, not a failed run - nothing
  // has started yet, so no jobSyncRuns row is created for it; the
  // rejection message and the previous run's own row already capture
  // everything there is to audit about it.
  const runId = await ctx.runMutation(internal.jobSyncShared.beginSyncRun, { provider, minIntervalMs });

  // --- Dedupe-key backfill (shared across every provider's runs) ----------------
  // Persistence-category failure: logged and isolated, never aborts the run -
  // cross-provider dedup is a best-effort enhancement, not a prerequisite
  // for fetching/upserting this provider's own jobs.
  try {
    await ctx.runMutation(internal.jobSyncShared.backfillDedupeKeys, {});
  } catch (err) {
    console.error(`${provider} sync: [persistence] dedupe-key backfill failed -`, err instanceof Error ? err.message : err);
  }

  // --- Skill vocabulary -----------------------------------------------------------
  // Loaded once for the whole run, not per job/page. A failure here degrades
  // to an empty vocabulary (extraction then simply finds nothing) rather
  // than aborting the sync - fetching/upserting jobs is still useful even
  // if skill extraction can't run this time.
  let vocabulary: SkillVocabularyEntry[] = [];
  try {
    vocabulary = await ctx.runQuery(internal.extractSkills.GetSkillVocabulary, {});
  } catch (err) {
    console.error(`${provider} sync: [vocabulary] could not load skill vocabulary -`, err instanceof Error ? err.message : err);
  }

  // --- P3: candidate-eligibility filter inputs, loaded ONCE for this whole run ----
  // The configured minimumMatchScore/requireIsMatch and the full set of
  // complete candidate profiles - both read fresh on every run (never
  // cached across runs, so an administrator's config change or a
  // candidate's profile edit takes effect on the very next sync with no
  // deploy), and both reused unmodified for every page fetched below.
  // Unlike the vocabulary load above, a failure here is NOT allowed to
  // silently degrade into "insert everything unfiltered" - that would
  // defeat this milestone's entire purpose without anyone noticing. It is
  // treated as a real run failure instead, using the exact same
  // fetchError/status mechanism a fetch failure already uses (see below) -
  // jobsFetched stays 0, so the existing status logic correctly reports
  // this run as "failed," never a silent, incomplete "success."
  let eligibilityConfig: JobMatchingConfig | undefined;
  let completeProfiles: Doc<"UserProfileTable">[] = [];
  let fetchError: string | undefined;
  try {
    eligibilityConfig = await ctx.runQuery(internal.jobMatchingConfig.GetEffectiveConfig, {});
    completeProfiles = await loadCompleteCandidateProfiles(ctx);
  } catch (err) {
    fetchError = `[filtering] ${err instanceof Error ? err.message : "Unknown error while preparing the candidate eligibility filter."}`;
    console.error(`${provider} sync: ${fetchError}`);
  }

  let jobsFetched = 0;
  let jobsInserted = 0;
  let jobsUpdated = 0;
  let skipped = 0;
  let persistenceFailed = 0;
  const seenExternalIds: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  let completedFully = false;

  try {
    // When eligibilityConfig failed to load above, fetchError is already
    // set and nothing below can run safely - the while loop is skipped
    // entirely (jobsFetched stays 0), exactly like a fetch failure that
    // happened before any page was read.
    while (!fetchError && pages < maxPages) {
      if (pages > 0) await new Promise((resolve) => setTimeout(resolve, pageDelayMs));

      let page: ProviderFetchPage;
      try {
        page = await fetchPage(cursor);
      } catch (err) {
        // Network/connection failures and unsuccessful HTTP responses
        // (non-2xx, unexpected response shape) are both raised as a plain
        // Error by each adapter's own fetchPage - tagged [fetch] here so
        // the stored jobSyncRuns.errorMessage's category is visible without
        // a schema change.
        throw new Error(`[fetch] ${err instanceof Error ? err.message : "Unknown error while fetching the provider API."}`);
      }
      pages++;

      const rawJobs = page.jobs;
      if (rawJobs.length === 0) {
        completedFully = true;
        break;
      }

      const normalized: NormalizedProviderJob[] = [];
      for (const raw of rawJobs) {
        jobsFetched++;
        // A normalization failure for one record is isolated right here -
        // skip-counted, never thrown - so one malformed listing can never
        // abort the run or be confused with a fetch/persistence failure.
        let job: NormalizedProviderJob | null;
        try {
          job = normalize(raw, vocabulary);
        } catch (err) {
          console.error(`${provider} sync: [normalization] a record could not be normalized -`, err instanceof Error ? err.message : err);
          job = null;
        }
        if (!job) {
          skipped++;
          continue;
        }
        normalized.push(job);
        // seenExternalIds includes EVERY normalized job's externalId,
        // regardless of whether it goes on to qualify for shared insertion
        // below - this is what lets markRemovedUpstream (later in this run)
        // correctly treat an unqualifying-but-still-upstream-present job as
        // "seen," never as "disappeared," so it is never wrongly
        // deactivated just for having failed the new P3 filter (see
        // JOB_MATCHING_P3_IMPLEMENTATION_PROGRESS.md section 6/8).
        seenExternalIds.push(job.externalId);
      }

      // --- P3: filter normalized jobs against complete candidate profiles -------
      // Only a job that qualifies for at least one complete profile under
      // the current configured rule is passed to the existing, unmodified
      // upsertProviderJobsBatch - a job that qualifies for zero complete
      // profiles this run is simply never persisted. eligibilityConfig is
      // guaranteed defined here: fetchError would already be set otherwise,
      // and the surrounding while loop's own condition keeps this code from
      // running at all in that case.
      const qualifying = normalized.filter((job) =>
        qualifiesForAtLeastOneCandidate(job, completeProfiles, eligibilityConfig!)
      );

      if (qualifying.length > 0) {
        try {
          const result = await ctx.runMutation(internal.jobSyncShared.upsertProviderJobsBatch, { provider, jobs: qualifying });
          jobsInserted += result.inserted;
          jobsUpdated += result.updated;
          // (P9) upsertProviderJobsBatch now isolates a single job's own
          // failure internally (never throws for one bad record) - its
          // `failed` count surfaces here instead, so one malformed record
          // no longer aborts the rest of this page or the rest of the run,
          // while the run's own reporting still reflects it accurately
          // (see the status computation below).
          persistenceFailed += result.failed;
        } catch (err) {
          // A thrown error here means something broke the WHOLE batch call
          // itself (e.g. the batch-level 16MB ceiling, before P9's bounded
          // suppression fix made that far less likely) rather than one
          // isolated job - still tagged and still aborts this run, exactly
          // as before.
          throw new Error(`[persistence] ${err instanceof Error ? err.message : "Unknown error while saving jobs."}`);
        }
      }

      const shouldStop = page.hasMore === false || !page.nextCursor;
      if (shouldStop) {
        completedFully = true;
        break;
      }
      cursor = page.nextCursor;
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Unknown error during synchronization.";
    console.error(`${provider} sync: run failed -`, fetchError);
  }

  let jobsExpired = 0;
  let removalError: string | undefined;
  // Only ever deactivate previously-seen jobs when this run read the whole
  // feed successfully end-to-end - never after a partial/failed fetch. A
  // page-cap cutoff (completedFully stays false) or any fetch error must
  // never be read as proof that the unseen jobs disappeared. Unchanged
  // from before P11 - only what happens inside this gate (a loop over
  // bounded pages instead of one unbounded call) changed.
  if (!fetchError && completedFully && jobsFetched > 0) {
    try {
      // (P11) markRemovedUpstream is now page-bounded - this run's own
      // seenExternalIds snapshot stays valid for every page (it doesn't
      // depend on how many pages the provider's existing rows take), so
      // the loop is driven synchronously here, within this one run, rather
      // than spread across future calls the way P5's backfillDedupeKeys
      // is - see convex/jobSyncShared.ts's own comment on
      // markRemovedUpstreamPage for why those two cases differ. Bounded at
      // MAX_REMOVAL_SWEEP_PAGES purely as a defensive safety margin
      // (the loop's own isDone flag is the real stop condition, which a
      // finite table always eventually reaches) - mirrors this file's own
      // existing `maxPages` convention for the provider-fetch loop above.
      let removalCursor: string | null = null;
      let removalDone = false;
      let removalPages = 0;
      while (!removalDone && removalPages < MAX_REMOVAL_SWEEP_PAGES) {
        const page: { removed: number; isDone: boolean; continueCursor: string } = await ctx.runMutation(
          internal.jobSyncShared.markRemovedUpstreamPage,
          {
            provider,
            seenExternalIds,
            cursor: removalCursor,
          }
        );
        jobsExpired += page.removed;
        removalCursor = page.continueCursor;
        removalDone = page.isDone;
        removalPages++;
      }
    } catch (err) {
      removalError = `[persistence] ${err instanceof Error ? err.message : "Unknown error while marking removed listings."}`;
      console.error(`${provider} sync: removal sweep failed -`, removalError);
    }
  }

  // Purely local (re-extracts from already-stored descriptions, no network
  // call), so this runs regardless of the fetch outcome above. Folded into
  // jobsUpdated since this milestone still doesn't add a separate
  // jobSyncRuns counter for it (same choice made in J4/J5).
  let backfillError: string | undefined;
  if (vocabulary.length > 0) {
    try {
      jobsUpdated += await ctx.runMutation(internal.jobSyncShared.backfillProviderSkills, { provider, vocabulary });
    } catch (err) {
      backfillError = `[persistence] ${err instanceof Error ? err.message : "Unknown error while backfilling skills."}`;
      console.error(`${provider} sync: skill backfill failed -`, backfillError);
    }
  }

  const errorMessage = fetchError ?? removalError ?? backfillError;
  // (P9) A run that otherwise fetched/completed cleanly but silently
  // skip-counted some jobs at the persistence layer must never be reported
  // as a plain, full "success" - per this milestone's own "ensure
  // batch-level failures are still reported accurately" requirement.
  const status: "success" | "partial" | "failed" =
    fetchError && jobsFetched === 0
      ? "failed"
      : errorMessage || !completedFully || persistenceFailed > 0
        ? "partial"
        : "success";

  try {
    await ctx.runMutation(internal.jobSyncShared.finishSyncRun, {
      runId,
      status,
      jobsFetched,
      jobsInserted,
      jobsUpdated,
      jobsExpired,
      persistenceFailed,
      errorMessage,
    });
  } catch (err) {
    // The run row may be left "running" until beginSyncRun's staleness
    // margin elapses - a documented, bounded degraded fallback, unchanged
    // from J3/J5's own equivalent note.
    console.error(`${provider} sync: [persistence] could not finalize jobSyncRuns row -`, err instanceof Error ? err.message : err);
  }

  return {
    ok: status !== "failed",
    status,
    jobsFetched,
    jobsInserted,
    jobsUpdated,
    jobsExpired,
    skipped,
    persistenceFailed,
    error: errorMessage,
    runId,
  };
}
