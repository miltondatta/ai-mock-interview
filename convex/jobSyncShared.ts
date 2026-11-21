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

// Looks up every row sharing `dedupeKey` (via the J2 by_dedupe_key index -
// never a full table scan) and deactivates every row except the winner.
// Never deletes a row, never touches any field besides `active`/
// `removedUpstreamAt`, and never modifies the winner at all - including
// when the winner is an admin-created row, whose content this never
// touches. Safe to call repeatedly: once only the winner is active, later
// calls for the same key find nothing left to change.
async function suppressDuplicatesForKey(ctx: MutationCtx, dedupeKey: string): Promise<number> {
  if (!dedupeKey) return 0;
  const rows = await ctx.db
    .query("jobs")
    .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", dedupeKey))
    .collect();
  if (rows.length <= 1) return 0;

  let winner = rows[0];
  for (const row of rows.slice(1)) {
    if (isBetterWinner(row, winner)) winner = row;
  }

  let suppressed = 0;
  const now = Date.now();
  for (const row of rows) {
    if (row._id === winner._id) continue;
    if (row.active) {
      await ctx.db.patch(row._id, { active: false, removedUpstreamAt: row.removedUpstreamAt ?? now });
      suppressed++;
    }
  }
  return suppressed;
}

// Computes and stores a dedupeKey for every job row that doesn't have one
// yet - this is how admin-created rows (which AdminUpsertJob never sets a
// dedupeKey for, and never will - that mutation is intentionally untouched)
// and any provider rows synced before this field existed become visible to
// cross-provider dedup, without changing admin job creation/editing at all.
// Runs the same suppression check for each key it computes, so a
// newly-backfilled admin row immediately suppresses any pre-existing
// provider duplicate. This is a full-table scan (no index can target "rows
// missing a field") - acceptable at the current, still-modest job-table
// size; revisit alongside MAX_JOBS_SCANNED if that changes (see
// JOB_SEARCH_IMPLEMENTATION_ROADMAP.md Milestone 9).
export const backfillDedupeKeys = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ backfilled: number; suppressed: number }> => {
    const rows = await ctx.db.query("jobs").collect();
    let backfilled = 0;
    let suppressed = 0;
    for (const row of rows) {
      if (row.dedupeKey) continue;
      const key = computeDedupeKey(row.company, row.title, row.applyUrl);
      if (!key) continue;
      await ctx.db.patch(row._id, { dedupeKey: key });
      backfilled++;
      suppressed += await suppressDuplicatesForKey(ctx, key);
    }
    return { backfilled, suppressed };
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
export const upsertProviderJobsBatch = internalMutation({
  args: { provider: v.string(), jobs: v.array(providerJobValidator) },
  handler: async (ctx, args) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    let suppressed = 0;
    const provider = args.provider as JobProvider;
    for (const job of args.jobs) {
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
    }
    return { inserted, updated, suppressed };
  },
});

// --- Removed-upstream sweep --------------------------------------------------------

// Deactivates previously-synced rows for a provider that weren't present in
// a run that read the *entire* upstream feed successfully. Scoped to one
// provider via the same index, so admin rows and other providers' rows are
// untouched. Never deletes a row. Callers (convex/himalayasSync.ts,
// convex/jobicy.ts) are responsible for only invoking this after a run that
// genuinely finished reading the feed, not merely hit a page cap - see each
// adapter's own comments.
export const markRemovedUpstream = internalMutation({
  args: { provider: v.string(), seenExternalIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const seen = new Set(args.seenExternalIds);
    const rows = await ctx.db
      .query("jobs")
      .withIndex("by_provider_external_id", (q) => q.eq("provider", args.provider as JobProvider))
      .collect();
    const now = Date.now();
    let removed = 0;
    const affectedDedupeKeys = new Set<string>();
    for (const row of rows) {
      if (row.active && row.externalId && !seen.has(row.externalId)) {
        await ctx.db.patch(row._id, { active: false, removedUpstreamAt: now });
        removed++;
        if (row.dedupeKey) affectedDedupeKeys.add(row.dedupeKey);
      }
    }
    // (J6) A row just deactivated above might have been the "winner" of a
    // cross-provider duplicate group. Re-evaluate those groups immediately
    // (reusing the corrected isBetterWinner above) so a still-active
    // duplicate from a different provider is promoted right away, instead
    // of waiting for that other provider's own next sync to self-correct.
    for (const key of affectedDedupeKeys) {
      await suppressDuplicatesForKey(ctx, key);
    }
    return removed;
  },
});

// --- Skill backfill (J4, generalized for any provider) ---------------------------

// Backfills requiredSkills for a provider's rows already stored with an
// empty list (e.g. synced before J4 existed, or where extraction
// previously found nothing but might now). Entirely local - re-extracts
// from the already-stored `description`, no network call to the provider.
// Scoped to one provider via the same index. Only ever patches
// requiredSkills (+ updatedAt), only when extraction finds something, and
// is safe to run repeatedly.
export const backfillProviderSkills = internalMutation({
  args: { provider: v.string(), vocabulary: v.array(skillVocabularyEntryValidator) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("jobs")
      .withIndex("by_provider_external_id", (q) => q.eq("provider", args.provider as JobProvider))
      .collect();
    const now = Date.now();
    let backfilled = 0;
    for (const row of rows) {
      if (row.requiredSkills.length > 0) continue;
      const extracted = extractSkillsFromDescription(row.description, args.vocabulary);
      if (extracted.length === 0) continue;
      await ctx.db.patch(row._id, { requiredSkills: combineSkills([], extracted), updatedAt: now });
      backfilled++;
    }
    return backfilled;
  },
});
