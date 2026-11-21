import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { SkillVocabularyEntry } from "./extractSkills";
import type { NormalizedProviderJob } from "./jobSyncShared";

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
  error?: string;
  // (J7) The jobSyncRuns row id for this run, as a string. Included so a
  // caller (e.g. the n8n HTTP gateway's failure notification) can reference
  // "the relevant synchronization run ID" per that milestone's requirement,
  // without adding a second place that tracks run identity.
  runId: string;
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

  let jobsFetched = 0;
  let jobsInserted = 0;
  let jobsUpdated = 0;
  let skipped = 0;
  const seenExternalIds: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  let completedFully = false;
  let fetchError: string | undefined;

  try {
    while (pages < maxPages) {
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
        seenExternalIds.push(job.externalId);
      }

      if (normalized.length > 0) {
        try {
          const result = await ctx.runMutation(internal.jobSyncShared.upsertProviderJobsBatch, { provider, jobs: normalized });
          jobsInserted += result.inserted;
          jobsUpdated += result.updated;
        } catch (err) {
          // Database persistence failures are tagged distinctly from fetch
          // failures - both end up in the same jobSyncRuns.errorMessage
          // field (no new schema column), but remain distinguishable.
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
  // never be read as proof that the unseen jobs disappeared.
  if (!fetchError && completedFully && jobsFetched > 0) {
    try {
      jobsExpired = await ctx.runMutation(internal.jobSyncShared.markRemovedUpstream, { provider, seenExternalIds });
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
  const status: "success" | "partial" | "failed" =
    fetchError && jobsFetched === 0 ? "failed" : errorMessage || !completedFully ? "partial" : "success";

  try {
    await ctx.runMutation(internal.jobSyncShared.finishSyncRun, {
      runId,
      status,
      jobsFetched,
      jobsInserted,
      jobsUpdated,
      jobsExpired,
      errorMessage,
    });
  } catch (err) {
    // The run row may be left "running" until beginSyncRun's staleness
    // margin elapses - a documented, bounded degraded fallback, unchanged
    // from J3/J5's own equivalent note.
    console.error(`${provider} sync: [persistence] could not finalize jobSyncRuns row -`, err instanceof Error ? err.message : err);
  }

  return { ok: status !== "failed", status, jobsFetched, jobsInserted, jobsUpdated, jobsExpired, skipped, error: errorMessage, runId };
}
