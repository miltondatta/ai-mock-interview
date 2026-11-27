import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { v, type Infer } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { combineSkills, extractSkillsFromDescription, skillVocabularyEntryValidator } from "./extractSkills";

// Shared, provider-agnostic job-sync infrastructure (J5), extracted from J3's
// Himalayas-only implementation so Jobicy (and any future provider) reuses
// the same sync-run bookkeeping, upsert/dedupe-by-id logic, skill backfill,
// and cross-provider duplicate suppression, instead of a second copy per
// provider - see JOB_SEARCH_TECHNICAL_DESIGN.md sections 5-7 and
// JOB_SEARCH_IMPLEMENTATION_ROADMAP.md. Each provider adapter
// (convex/himalayasSync.ts, convex/jobicy.ts) keeps only what's actually
// provider-specific: the API endpoint, pagination shape, and field mapping.

// The shared mutations below accept `provider` as a plain v.string() (so
// this module doesn't need to know the full set of providers in advance),
// but the `jobs` table's own `provider` field is the narrower literal union
// from convex/schema.ts. This alias documents that every caller is expected
// to pass one of these values, and is used to cast at the few points where
// a generic string must be written into that union-typed field/index.
type JobProvider = "internal" | "himalayas" | "jobicy" | "remotive";

// Both Himalayas and Jobicy return `description` as full HTML (confirmed
// against live responses from each - see the field-mapping notes in
// JOB_SEARCH_IMPLEMENTATION_PROGRESS.md), but the `jobs.description` field
// is displayed as plain text everywhere in this app (JobCard.tsx's preview
// snippet). Without stripping it first, raw tags/attributes (e.g.
// `<h3>Who We Are</h3><p class="p1">...`) render literally. This is a
// lightweight, dependency-free tag/entity stripper - not a full HTML
// parser - good enough for a short text preview, and safe to run in
// Convex's runtime (no DOM available here, unlike the browser). A near-
// identical copy lives in utils/jobs/format.ts for the client-side display
// path, since convex/ functions don't import from outside convex/ in this
// codebase (same precedent as extractSkills.ts/jobSyncShared.ts's other
// small, intentionally-duplicated helpers).
export function stripHtmlToText(html: string): string {
  return html
    // Block-level boundaries become a space first, so adjacent elements
    // ("</h3><p>...") don't get glued into one run-on word/sentence.
    .replace(/<\/?(p|div|br|li|ul|ol|h[1-6]|blockquote|tr|table|section|article)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Unicode-safe description truncation (P9, Issue 2 fix) ----------------------
//
// A plain `text.slice(0, maxLength)` truncates by UTF-16 code-unit count,
// with no awareness of surrogate pairs - a character outside the Basic
// Multilingual Plane (most emoji, some less-common scripts) occupies TWO
// code units, and a cut landing exactly between them leaves a lone, unpaired
// high surrogate as the string's final code unit. That's valid inside a JS
// string at runtime (no exception here), but has no valid UTF-8/well-formed-
// Unicode representation - JOB_SYNC_P8_ROOT_CAUSE_INVESTIGATION_REPORT.md
// section 3 identified this as the most likely cause of Himalayas' real
// "[persistence] invalid json: unexpected end of hex escape" failures,
// surfacing later when the truncated string crosses a serialization
// boundary (the action-to-mutation argument hand-off). This removes at
// most one additional trailing code unit compared to a plain slice -
// nothing else about the string, or the existing maximum-length policy
// (the caller still passes the same MAX_DESCRIPTION_LENGTH it always did),
// changes.
export function truncateDescription(text: string, maxLength: number): string {
  const sliced = text.slice(0, maxLength);
  const lastCode = sliced.charCodeAt(sliced.length - 1);
  // 0xD800-0xDBFF is a high surrogate - only ever valid immediately
  // followed by a low surrogate (0xDC00-0xDFFF), which a trailing position
  // can't have (the slice ends right there).
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    return sliced.slice(0, -1);
  }
  return sliced;
}

// A "running" jobSyncRuns row older than this is treated as abandoned (e.g.
// the action crashed before reaching its cleanup step) rather than a real
// concurrent run, so one stuck run can't permanently block every future
// sync. This is the concurrency-safety margin, not a schedule.
const STALE_RUN_MS = 15 * 60 * 1000;

// --- Shared normalized-job shape ------------------------------------------------

export const providerJobValidator = v.object({
  title: v.string(),
  company: v.string(),
  companyLogo: v.optional(v.string()),
  location: v.optional(v.string()),
  country: v.optional(v.string()),
  workMode: v.optional(v.union(v.literal("onsite"), v.literal("remote"), v.literal("hybrid"))),
  employmentType: v.optional(v.string()),
  salaryMin: v.optional(v.number()),
  salaryMax: v.optional(v.number()),
  salaryCurrency: v.optional(v.string()),
  salaryPeriod: v.optional(v.union(v.literal("hour"), v.literal("month"), v.literal("year"))),
  description: v.optional(v.string()),
  // Populated via extractSkills.ts during normalization (J4/J5) - a
  // provider's own structured skills (if it has any) combined with locally
  // extracted ones.
  requiredSkills: v.array(v.string()),
  applicationDeadline: v.optional(v.string()),
  applyUrl: v.string(),
  source: v.string(),
  sourceUrl: v.string(),
  externalId: v.string(),
  postedAt: v.number(),
  // (J5) Cross-provider duplicate-detection key - see computeDedupeKey below.
  // Optional because a job with an unusable title/company can't produce a
  // meaningful key; such a job simply never participates in cross-provider
  // dedup (it's still synced and shown normally).
  dedupeKey: v.optional(v.string()),
});
export type NormalizedProviderJob = Infer<typeof providerJobValidator>;

// Drops undefined-valued keys (Convex's own argument serialization would
// drop them anyway) so a `patch` only touches fields that actually have a
// value. Cast back to T since the removed keys were only ever optional ones -
// same convention convex/Jobs.ts' own stripUndefined() already uses.
export function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

// --- Cross-provider dedupe key (J5 Phase 4) -------------------------------------
//
// Approved J1 design (JOB_SEARCH_TECHNICAL_DESIGN.md section 7): normalized
// company + normalized title + the apply URL's domain. This is a heuristic,
// not a guarantee - two genuinely different roles with a generic title at
// the same company could collide, and that tradeoff was already accepted in
// J1 rather than invented here.

// Mirrors convex/jobMatching.ts's TITLE_STOPWORDS exactly, duplicated
// locally (not imported) for the same reason extractSkills.ts duplicates
// normalizeSkill() - jobMatching.ts stays completely unmodified.
const TITLE_DEDUPE_STOPWORDS = new Set([
  "senior", "sr", "junior", "jr", "lead", "principal", "staff", "head", "chief", "associate",
  "assistant", "intern", "trainee", "i", "ii", "iii", "iv", "the", "a", "an", "of", "and",
  "for", "to", "in", "at", "with", "remote", "contract", "part", "time", "full",
]);

// A small set of legal-entity suffixes that would otherwise make the same
// company look like two different ones (e.g. "Snowplow" vs "Snowplow Inc.").
// Deliberately short - extend sparingly, same spirit as extractSkills.ts's
// CURATED_SKILLS.
const COMPANY_SUFFIX_STOPWORDS = new Set(["inc", "llc", "ltd", "limited", "corp", "corporation", "co", "gmbh", "plc", "llp"]);

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function normalizeCompanyForDedupe(company: string): string {
  const words = wordsOf(company).filter((w) => !COMPANY_SUFFIX_STOPWORDS.has(w));
  return words.join(" ").trim();
}

function normalizeTitleForDedupe(title: string): string {
  const words = wordsOf(title).filter((w) => !TITLE_DEDUPE_STOPWORDS.has(w));
  // Sorted + de-duplicated so word-order differences between how two
  // providers phrase the same role (e.g. "Backend Engineer" vs "Engineer,
  // Backend") still land on the same key.
  return Array.from(new Set(words)).sort().join(" ");
}

function applyUrlDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// Returns "" when company or title normalize to nothing usable - callers
// treat an empty key as "this job doesn't participate in cross-provider
// dedup," never as a match against other empty-keyed jobs.
export function computeDedupeKey(company: string, title: string, applyUrl: string): string {
  const c = normalizeCompanyForDedupe(company);
  const t = normalizeTitleForDedupe(title);
  if (!c || !t) return "";
  const d = applyUrlDomain(applyUrl);
  return `${c}|${t}|${d}`;
}

// --- Provider precedence (J5 Phase 5) -------------------------------------------
//
// When two DIFFERENT providers' rows share a dedupeKey, one deterministic
// rule decides which stays visible - documented in
// JOB_SEARCH_IMPLEMENTATION_PROGRESS.md. An admin-created row (provider
// absent/undefined) always outranks every provider row, regardless of this
// table - that is a separate, higher-priority rule, not part of it.
const PROVIDER_PRECEDENCE: Record<string, number> = {
  himalayas: 1,
  jobicy: 2,
};
const UNKNOWN_PROVIDER_RANK = 99;

function precedenceRank(row: Doc<"jobs">): number {
  if (!row.provider) return -1; // admin-created rows always win
  return PROVIDER_PRECEDENCE[row.provider] ?? UNKNOWN_PROVIDER_RANK;
}

// True when `candidate` should replace `current` as the visible row for a
// shared dedupeKey.
//
// Admin rows (rank -1) always win outright, active or not - "admin always
// wins" is an absolute rule (J5 Phase 5), with no exception for an admin who
// deliberately deactivated their own listing.
//
// Between two PROVIDER rows, an active row always beats an inactive one,
// before provider precedence is even considered. (J6 correction - see
// JOB_SEARCH_IMPLEMENTATION_PROGRESS.md: without this, a provider row that
// genuinely disappeared upstream, and so is correctly deactivated by
// markRemovedUpstream, would otherwise go on permanently outranking a
// *different*, still-active provider's listing of the same vacancy on every
// future run, since the original J5 comparison considered only precedence/
// postedAt and never looked at `active` at all.)
//
// Only once active-status (for provider rows) or admin-precedence is tied
// does this fall back to PROVIDER_PRECEDENCE, then the earlier `postedAt` -
// the older listing is kept, for full determinism rather than an arbitrary
// pick.
function isBetterWinner(candidate: Doc<"jobs">, current: Doc<"jobs">): boolean {
  const rc = precedenceRank(candidate);
  const rb = precedenceRank(current);
  if (rc !== rb) {
    if (rc === -1 || rb === -1) return rc < rb; // one side is the admin row
    if (candidate.active !== current.active) return candidate.active;
    return rc < rb;
  }
  return candidate.postedAt < current.postedAt;
}

// --- Bounded duplicate suppression (P9, Issue 1 fix) ----------------------------
//
// Was: ctx.db.query("jobs").withIndex("by_dedupe_key", ...).collect() - every
// row EVER marked with this dedupeKey, active or not. JOB_SYNC_P8_ROOT_CAUSE_
// INVESTIGATION_REPORT.md confirmed, with real data from the live deployment,
// that this is exactly what was exceeding Convex's 16MB-per-execution read
// limit: 100% of sampled provider jobs (both Himalayas and Jobicy) use the
// provider's OWN domain as applyUrl, so computeDedupeKey's third component
// (the apply-URL domain) never differentiates anything for a provider job -
// collisions depend purely on (company, title), and since nothing ever
// deletes a suppressed/inactive duplicate (JOB_MATCHING_P6_IMPLEMENTATION_
// PROGRESS.md), a popular combination's group can only grow, forever, and
// got fully re-read every single time any job shared its key.
//
// Now: two bounded, indexed reads instead of one unbounded one -
// (dedupeKey, active) for every CURRENTLY ACTIVE row sharing the key, and
// (dedupeKey, provider) for an admin-created row (provider absent)
// regardless of its active status. This is a provably equivalent rewrite of
// the SAME algorithm, not a new one - see the case analysis below for why
// every one of the original function's write decisions is preserved exactly:
//
//   1. If no admin row exists and the key has at least one currently-active
//      row: isBetterWinner's own rule (see its comment above - "an active
//      row always beats an inactive one, before provider precedence is even
//      considered") means the original, unbounded version could ALSO never
//      pick an inactive row as the overall winner in this case, for the
//      same reason - so reading only the active rows (never the inactive
//      backlog) yields the identical winner and the identical set of rows
//      patched to inactive.
//   2. If no admin row exists and NO active row exists either: the original
//      version would pick some inactive row as a nominal "winner" among the
//      inactive-only group, but since `if (row.active)` already guards
//      every patch, it would take ZERO actions either way - both versions
//      write nothing. (The new version's `candidates.length <= 1` check
//      below returns 0 immediately in this case, without even needing to
//      distinguish "zero active rows" from "one.")
//   3. If an admin row exists (active or not): admin rows always win
//      outright (rank -1, J5 Phase 5) regardless of anything else - the new
//      version includes it in `candidates` unconditionally via the
//      (dedupeKey, provider) lookup, so it still wins every comparison the
//      same way, and every OTHER active row (never the admin row itself,
//      and never an already-inactive non-admin row, which needs no action
//      either way) still gets correctly deactivated.
//
// One narrow, pre-existing ambiguity is inherited unchanged, not introduced
// here: if TWO admin rows somehow share the same dedupeKey (both provider-
// absent), isBetterWinner's own admin-vs-admin comparison (`rc === -1 &&
// rb === -1` -> `-1 < -1` -> always false) never swaps between them in
// EITHER version - which one "wins" was already an arbitrary artifact of
// iteration order before this change, and remains exactly as arbitrary now.
//
// Never deletes a row, never touches any field besides `active`/
// `removedUpstreamAt`, and never modifies the winner at all - including
// when the winner is an admin-created row, whose content this never
// touches. Safe to call repeatedly: once only the winner is active, later
// calls for the same key find nothing left to change.
async function suppressDuplicatesForKey(ctx: MutationCtx, dedupeKey: string): Promise<number> {
  if (!dedupeKey) return 0;

  const adminRow = await ctx.db
    .query("jobs")
    .withIndex("by_dedupe_key_provider", (q) => q.eq("dedupeKey", dedupeKey).eq("provider", undefined))
    .first();
  const activeRows = await ctx.db
    .query("jobs")
    .withIndex("by_dedupe_key_active", (q) => q.eq("dedupeKey", dedupeKey).eq("active", true))
    .collect();

  const candidatesById = new Map<string, Doc<"jobs">>();
  if (adminRow) candidatesById.set(adminRow._id, adminRow);
  for (const row of activeRows) candidatesById.set(row._id, row);
  const candidates = [...candidatesById.values()];
  if (candidates.length <= 1) return 0;

  let winner = candidates[0];
  for (const row of candidates.slice(1)) {
    if (isBetterWinner(row, winner)) winner = row;
  }

  let suppressed = 0;
  const now = Date.now();
  for (const row of candidates) {
    if (row._id === winner._id) continue;
    if (row.active) {
      await ctx.db.patch(row._id, { active: false, removedUpstreamAt: row.removedUpstreamAt ?? now });
      suppressed++;
    }
  }
  return suppressed;
}

// --- One-time, resumable dedupeKey backfill (P5) --------------------------------
//
// Historically this computed and stored a dedupeKey for every job row
// missing one by reading the ENTIRE `jobs` table with ctx.db.query("jobs").
// collect() on every single synchronization run (manual, scheduled, or
// profile-completion-triggered) - acceptable only "at the current, still-
// modest job-table size" per its own prior comment, and flagged as the
// single largest existing read-cost item in this subsystem by
// JOB_PERSISTENCE_FILTERING_INVESTIGATION_REPORT.md section B.
//
// Two things make a full rescan on every run unnecessary going forward,
// both confirmed by inspection rather than assumed:
//   1. Every PROVIDER-sourced row has already computed its own dedupeKey
//      at normalization time since J5 (convex/himalayasSync.ts:168,
//      convex/jobicy.ts:169 - `computeDedupeKey(...) || undefined`) - never
//      relying on this backfill to begin with.
//   2. As of P5, convex/Jobs.ts's AdminUpsertJob ALSO computes its own
//      dedupeKey at write time (see that file), closing the one real,
//      standing gap this backfill used to exist for - an admin-created row
//      used to NEVER get a dedupeKey any other way.
// With both write paths now self-sufficient, the only rows that can ever
// still be missing a dedupeKey are ones written BEFORE this guarantee
// existed - a fixed, one-time, shrinking set, not something that grows
// forever. Once every such legacy row has been walked once, there is
// structurally nothing left to backfill, ever again (a row whose company/
// title genuinely can't produce a usable key - computeDedupeKey() returning
// "" - will never produce one on a retry either; see the `if (!key)
// continue` below, unchanged from before).
//
// `jobDedupeBackfillState` (schema.ts) is the persistent (survives restarts
// and redeploys - never an in-memory flag) record of how far that one-time
// walk has gotten. Once its `complete` field is true, this function does
// exactly one indexed single-row read and returns - never a table scan
// again. Until then, it processes at most BACKFILL_PAGE_SIZE rows per call
// (a bounded page via ctx.db.query("jobs").paginate(...), never the whole
// table in memory at once) and persists its progress (cursor + running
// counts) before returning, so the next call - whichever synchronization
// run happens to trigger it next - resumes exactly where this one left off.
//
// Concurrency and failure safety come entirely from Convex's own,
// pre-existing guarantees - no new locking was introduced:
//   - This whole function is ONE mutation, so a thrown error (e.g. mid-page)
//     rolls back every write it made this call (the state row's cursor is
//     NOT advanced, and no row patched this call is left behind either) -
//     the next call safely retries the exact same page from the exact same
//     starting cursor. Patching an already-correct dedupeKey, and
//     suppressDuplicatesForKey() itself, are both already idempotent.
//   - Two sync runs that happen to call this concurrently (e.g. the
//     candidate-facing "Check for New Jobs" button, which syncs Himalayas
//     and Jobicy via Promise.all) are naturally serialized by Convex's own
//     optimistic concurrency control on the single `jobDedupeBackfillState`
//     row: whichever commits first wins; the other is automatically retried
//     by Convex against the now-updated state, which simply advances it to
//     the NEXT page rather than reprocessing the same one twice. No
//     "running" status flag is needed for this (unlike jobSyncRuns'
//     beginSyncRun, which exists specifically because THAT operation spans
//     a slow, multi-call action with real external HTTP calls - this
//     function is pure, synchronous-within-one-transaction database work
//     from start to finish, which is exactly the case Convex's own
//     per-mutation transaction guarantee already covers without any extra
//     bookkeeping).
const BACKFILL_PAGE_SIZE = 200;

export const backfillDedupeKeys = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ complete: boolean; processed: number; backfilled: number }> => {
    const rows = await ctx.db.query("jobDedupeBackfillState").collect();
    const state = rows[0] ?? null;

    if (state?.complete) {
      // The one-time walk already finished in an earlier run - nothing
      // written since could possibly be missing a key (see this function's
      // own header comment), so there is nothing left to check. One cheap,
      // indexed single-row read, never a table scan.
      return { complete: true, processed: 0, backfilled: 0 };
    }

    const page = await ctx.db.query("jobs").paginate({ numItems: BACKFILL_PAGE_SIZE, cursor: state?.cursor ?? null });

    let backfilled = 0;
    for (const row of page.page) {
      if (row.dedupeKey) continue;
      const key = computeDedupeKey(row.company, row.title, row.applyUrl);
      if (!key) continue; // genuinely unusable company/title - will never produce a key, nothing to backfill, ever
      await ctx.db.patch(row._id, { dedupeKey: key });
      backfilled++;
      await suppressDuplicatesForKey(ctx, key);
    }

    const isComplete = page.isDone;
    const patch = {
      cursor: isComplete ? undefined : page.continueCursor,
      complete: isComplete,
      processedCount: (state?.processedCount ?? 0) + page.page.length,
      backfilledCount: (state?.backfilledCount ?? 0) + backfilled,
      updatedAt: Date.now(),
    };
    if (state) {
      await ctx.db.patch(state._id, patch);
    } else {
      await ctx.db.insert("jobDedupeBackfillState", patch);
    }

    return { complete: isComplete, processed: page.page.length, backfilled };
  },
});

// --- Sync-run bookkeeping (jobSyncRuns) -----------------------------------------

// Checks-and-inserts inside one transactional mutation, so two near-
// simultaneous triggers can't both "see no running row" and start twice -
// the second writer retries under Convex's normal OCC and then observes the
// first writer's row. `minIntervalMs`, when passed, additionally rejects a
// new run if the most recent run for this provider (of any status) started
// less than that long ago - this is how a provider-specific cooldown (e.g.
// Jobicy's documented "no more than once per hour") is enforced, reusing
// this same mechanism rather than a second rate-limit table. Callers that
// don't pass it (Himalayas) are completely unaffected.
export const beginSyncRun = internalMutation({
  args: { provider: v.string(), minIntervalMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const recent = await ctx.db
      .query("jobSyncRuns")
      .withIndex("by_provider_started", (q) => q.eq("provider", args.provider))
      .order("desc")
      .take(5);

    const running = recent.find((r) => r.status === "running");
    if (running && now - running.startedAt < STALE_RUN_MS) {
      throw new Error(`A ${args.provider} sync is already running (started ${new Date(running.startedAt).toISOString()}).`);
    }

    if (args.minIntervalMs !== undefined && recent.length > 0) {
      const last = recent[0]; // most recent run of any status
      const elapsed = now - last.startedAt;
      if (elapsed < args.minIntervalMs) {
        const retryAt = new Date(last.startedAt + args.minIntervalMs);
        const waitMinutes = Math.ceil((args.minIntervalMs - elapsed) / 60_000);
        throw new Error(
          `${args.provider} can only be synced once every ${Math.round(args.minIntervalMs / 60_000)} minutes. ` +
            `Last synced at ${new Date(last.startedAt).toISOString()} - try again in about ${waitMinutes} minute(s) (after ${retryAt.toISOString()}).`
        );
      }
    }

    return await ctx.db.insert("jobSyncRuns", { provider: args.provider, startedAt: now, status: "running" });
  },
});

// (J7) Read-only lookup of a provider's most recent run, used by
// convex/http.ts's /jobs/status route so one provider's failure
// notification can report whether the *other* provider's latest run
// succeeded - without n8n needing its own copy of synchronization history
// (J7 Phase 5: "use the existing jobSyncRuns audit records as the
// authoritative synchronization history").
export const getLatestSyncRun = internalQuery({
  args: { provider: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("jobSyncRuns")
      .withIndex("by_provider_started", (q) => q.eq("provider", args.provider))
      .order("desc")
      .take(1);
    return rows[0] ?? null;
  },
});

export const finishSyncRun = internalMutation({
  args: {
    runId: v.id("jobSyncRuns"),
    status: v.union(v.literal("success"), v.literal("partial"), v.literal("failed")),
    jobsFetched: v.optional(v.number()),
    jobsInserted: v.optional(v.number()),
    jobsUpdated: v.optional(v.number()),
    jobsExpired: v.optional(v.number()),
    // (P9) A job that reached upsertProviderJobsBatch but failed to persist
    // (isolated there - never aborts the batch). Optional for the same
    // backward-compatibility reason every other counter here already is -
    // a run recorded before P9 simply has no value for this field.
    persistenceFailed: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { runId, ...rest } = args;
    await ctx.db.patch(runId, { ...stripUndefined(rest), finishedAt: Date.now() });
  },
});

// --- Upsert (insert/update) -------------------------------------------------------

// Inserts new provider listings and updates existing ones, keyed by
// (provider, externalId) via the J2 by_provider_external_id index - never a
// full table scan, and structurally unable to touch an admin-created row
// (those always have provider undefined, never a provider name) or a
// different provider's row (the index key includes provider). After each
// upsert, runs cross-provider duplicate suppression for that job's
// dedupeKey (if it has one) in the same mutation call, so a reactivated
// duplicate (see below) is corrected within the same transaction rather
// than briefly visible.
//
// P9 (Issue 2 fix, per-job isolation): each job's insert/patch/suppress
// sequence is wrapped in its own try/catch, mirroring the per-record
// isolation convex/jobSyncRunner.ts's normalize step already uses - a
// single malformed or oversized record is skip-counted and logged, never
// allowed to abort the rest of the batch. This is deliberately NOT "catch
// or roll back the whole mutation": Convex mutations are all-or-nothing
// transactions, so if this handler ever threw uncaught, EVERY write made
// earlier in this same loop - including every job that succeeded - would
// be rolled back too, destroying far more progress than the one bad
// record ever caused by itself (JOB_SYNC_P9... brief's own explicit
// warning: "do not assume catching an exception inside a mutation
// guarantees partial writes will survive"). By catching INSIDE the loop
// and never re-throwing for a single job's failure, the handler runs to
// normal completion and Convex commits every write actually made - which
// is exactly what makes the already-processed jobs' writes durable.
export const upsertProviderJobsBatch = internalMutation({
  args: { provider: v.string(), jobs: v.array(providerJobValidator) },
  handler: async (ctx, args): Promise<{ inserted: number; updated: number; suppressed: number; failed: number }> => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    let suppressed = 0;
    let failed = 0;
    const provider = args.provider as JobProvider;
    for (const job of args.jobs) {
      try {
        const existing = await ctx.db
          .query("jobs")
          .withIndex("by_provider_external_id", (q) => q.eq("provider", provider).eq("externalId", job.externalId))
          .first();

        if (existing) {
          // Only fields with a defined value this fetch are overwritten - a
          // field the feed temporarily omits is left at its prior value
          // instead of being wiped. postedAt is never touched on update (the
          // first-seen posting date stays stable, same convention
          // AdminUpsertJob already uses for its own `postedAt`). active is
          // forced back to true here even if a prior sync suppressed this row
          // as a cross-provider duplicate or marked it removed-upstream - the
          // suppression check right below immediately re-evaluates and
          // re-deactivates it if a better-ranked row still exists, so the end
          // state after this call is always correct.
          const { externalId: _externalId, postedAt: _postedAt, requiredSkills: newSkills, ...updatable } = job;
          const basePatch = {
            ...stripUndefined(updatable),
            updatedAt: now,
            lastFetchedAt: now,
            active: true,
            removedUpstreamAt: undefined,
          };
          // requiredSkills is only overwritten when extraction found
          // something this time - never regressed to empty, and never set to
          // `undefined` (which would remove this non-optional field). Branching
          // on two fully-typed object literals (rather than building one
          // loosely-typed object and conditionally assigning a key onto it)
          // keeps this checked against `jobs`' real field types.
          if (newSkills.length > 0) {
            await ctx.db.patch(existing._id, { ...basePatch, requiredSkills: newSkills });
          } else {
            await ctx.db.patch(existing._id, basePatch);
          }
          updated++;
        } else {
          await ctx.db.insert("jobs", { ...stripUndefined(job), active: true, provider, lastFetchedAt: now, updatedAt: now });
          inserted++;
        }

        if (job.dedupeKey) suppressed += await suppressDuplicatesForKey(ctx, job.dedupeKey);
      } catch (err) {
        // Captured here (never silently dropped) so the record and reason
        // are identifiable in function logs; the running count surfaces
        // through convex/jobSyncRunner.ts into jobSyncRuns so a run that
        // skipped some records is never reported as a clean, full success.
        failed++;
        const message = err instanceof Error ? err.message : "Unknown error while persisting this job.";
        console.error(
          `upsertProviderJobsBatch: [persistence] ${provider}:${job.externalId} could not be persisted - skipped, continuing with the rest of the batch -`,
          message
        );
      }
    }
    return { inserted, updated, suppressed, failed };
  },
});

// --- Removed-upstream sweep (P11: bounded, paginated) -----------------------------
//
// Was: ctx.db.query("jobs").withIndex("by_provider_external_id", ...).collect()
// - EVERY row (active and inactive) for the provider, in one call.
// JOB_SYNC_P10_PRODUCTION_VERIFICATION_REPORT.md confirmed, via live Convex
// insights telemetry, that this was exceeding the same 16MB-per-execution
// ceiling P9 already fixed inside suppressDuplicatesForKey - but for a
// different underlying reason. P9's fix worked because a dedupe key's
// CURRENTLY ACTIVE rows stay naturally small regardless of how large its
// inactive history grows. That same trick does not apply here: real data
// (JOB_SYNC_P8_ROOT_CAUSE_INVESTIGATION_REPORT.md section 2.1) shows a
// provider's ACTIVE rows are the large majority of its rows (e.g. 2,547 of
// 2,752 sampled Himalayas rows) - filtering to active-only would barely
// reduce the read at all, and would still grow unboundedly as the provider
// accumulates more active jobs over time. The only sound fix is genuine
// pagination: processing the provider's rows in bounded pages across
// MULTIPLE mutation calls (each with its own fresh 16MB budget), not one
// unbounded call.
//
// Unlike P5's backfillDedupeKeys (whose progress persists in a schema
// table and can legitimately span many FUTURE, unrelated sync runs), this
// sweep's correctness depends entirely on `seenExternalIds` - a snapshot
// specific to the ONE run currently in progress. A page processed by some
// LATER, unrelated run would be checked against a stale, wrong seen-set.
// So pagination here is looped synchronously WITHIN the same run, by the
// caller (convex/jobSyncRunner.ts), not spread across future calls - no
// new schema/state table is introduced for this function; the page cursor
// only ever needs to live as a local variable in that one loop.
//
// This one page's own logic - which row qualifies for deactivation, the
// cross-provider dedupe re-evaluation afterward - is byte-for-byte the same
// as before, just scoped to `page.page` instead of an unbounded `rows`.
// Callers (convex/himalayasSync.ts, convex/jobicy.ts, via
// convex/jobSyncRunner.ts) remain responsible for only invoking this sweep
// at all after a run that genuinely finished reading the feed end-to-end,
// not merely hit a page cap - that existing, unrelated safety gate
// (`completedFully`) is entirely unchanged by this milestone.
const REMOVAL_SWEEP_PAGE_SIZE = 200;

export const markRemovedUpstreamPage = internalMutation({
  args: { provider: v.string(), seenExternalIds: v.array(v.string()), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args): Promise<{ removed: number; isDone: boolean; continueCursor: string }> => {
    const seen = new Set(args.seenExternalIds);
    const page = await ctx.db
      .query("jobs")
      .withIndex("by_provider_external_id", (q) => q.eq("provider", args.provider as JobProvider))
      .paginate({ numItems: REMOVAL_SWEEP_PAGE_SIZE, cursor: args.cursor });

    const now = Date.now();
    let removed = 0;
    const affectedDedupeKeys = new Set<string>();
    for (const row of page.page) {
      if (row.active && row.externalId && !seen.has(row.externalId)) {
        await ctx.db.patch(row._id, { active: false, removedUpstreamAt: now });
        removed++;
        if (row.dedupeKey) affectedDedupeKeys.add(row.dedupeKey);
      }
    }
    // (J6) A row just deactivated above might have been the "winner" of a
    // cross-provider duplicate group. Re-evaluate those groups immediately
    // (reusing the corrected isBetterWinner above, and P9's own bounded
    // suppressDuplicatesForKey) so a still-active duplicate from a
    // different provider is promoted right away. Called once per PAGE
    // rather than once for the whole sweep - a key touched by rows in two
    // different pages gets re-evaluated twice, which is harmless (the
    // function is already documented as idempotent/safe to call
    // repeatedly) and far simpler than threading an accumulator set across
    // multiple mutation calls for a cheap, already-bounded operation.
    for (const key of affectedDedupeKeys) {
      await suppressDuplicatesForKey(ctx, key);
    }
    return { removed, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});

// --- Skill backfill (J4, generalized for any provider; P11: bounded, perpetually ---
// --- cycling rather than one-time) ------------------------------------------------
//
// Was: ctx.db.query("jobs").withIndex("by_provider_external_id", ...).collect()
// - every row for the provider, every single sync run, forever. Confirmed
// by JOB_SYNC_P10_PRODUCTION_VERIFICATION_REPORT.md (live Convex insights)
// to be exceeding the 16MB-per-execution ceiling, same as
// markRemovedUpstream above, for the same reason (a provider's row count
// is large and only grows).
//
// This is NOT given P5's one-time "complete forever" treatment, and that
// is a deliberate, reasoned difference, not an inconsistency - re-read
// before assuming the two should look alike. P5's dedupeKey backfill can
// stop forever once done because EVERY future write (provider
// normalization, AdminUpsertJob) now computes its own dedupeKey at write
// time - the gap it closes can never reopen. Skill backfill has no
// equivalent closure: `vocabulary` (convex/extractSkills.ts) is every
// skill any candidate has ever typed into their own profile, which grows
// every time any candidate edits their skills - a job description that
// matched nothing in the vocabulary on every sync so far could legitimately
// start matching something the very next time a new skill is added
// anywhere, no matter how long ago that job was last checked. A "done
// forever" flag would permanently stop re-checking the moment it was set,
// silently breaking that intent. So instead of tracking "done," this
// tracks only a pagination cursor, per provider, and loops back to the
// start once it reaches the end - each call processes one bounded page,
// always making forward progress, and the whole provider's row set gets
// perpetually, incrementally re-considered as the vocabulary evolves,
// without ever reading more than one page at a time.
//
// Re-processing an already-backfilled row on a later cycle costs almost
// nothing and introduces no duplication risk: `if (row.requiredSkills.
// length > 0) continue` (unchanged) skips it instantly, and a row is only
// ever patched the one time its skills go from empty to non-empty - the
// same guarantee the original, unbounded version already had, now just
// checked one page at a time instead of all at once.
const SKILL_BACKFILL_PAGE_SIZE = 200;

export const backfillProviderSkills = internalMutation({
  args: { provider: v.string(), vocabulary: v.array(skillVocabularyEntryValidator) },
  handler: async (ctx, args): Promise<number> => {
    const existing = await ctx.db
      .query("providerSkillBackfillState")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .first();

    const page = await ctx.db
      .query("jobs")
      .withIndex("by_provider_external_id", (q) => q.eq("provider", args.provider as JobProvider))
      .paginate({ numItems: SKILL_BACKFILL_PAGE_SIZE, cursor: existing?.cursor ?? null });

    const now = Date.now();
    let backfilled = 0;
    for (const row of page.page) {
      if (row.requiredSkills.length > 0) continue;
      const extracted = extractSkillsFromDescription(row.description, args.vocabulary);
      if (extracted.length === 0) continue;
      await ctx.db.patch(row._id, { requiredSkills: combineSkills([], extracted), updatedAt: now });
      backfilled++;
    }

    // page.isDone -> this cycle through the provider's rows just finished;
    // resetting the cursor to undefined (not a terminal/"complete" flag)
    // means the very next call simply starts the next cycle from the
    // beginning - see this function's own header comment for why that's
    // the correct behavior here, unlike P5's one-time backfillDedupeKeys.
    const patch = {
      provider: args.provider,
      cursor: page.isDone ? undefined : page.continueCursor,
      processedCount: (existing?.processedCount ?? 0) + page.page.length,
      backfilledCount: (existing?.backfilledCount ?? 0) + backfilled,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("providerSkillBackfillState", patch);
    }

    return backfilled;
  },
});
