import { action, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { extractSkillsFromDescription, combineSkills, type SkillVocabularyEntry } from "./extractSkills";
import { computeDedupeKey, stripHtmlToText, truncateDescription, type NormalizedProviderJob } from "./jobSyncShared";
import { runProviderSync, type ProviderSyncResult } from "./jobSyncRunner";

// Himalayas job-provider sync (J3, extended by J4/J5/J6). See
// JOB_SEARCH_TECHNICAL_DESIGN.md and JOB_SEARCH_IMPLEMENTATION_ROADMAP.md.
// Manual admin trigger only - there is no schedule/cron/n8n workflow yet (a
// later milestone). This file keeps only what's actually Himalayas-specific
// (the endpoint, pagination shape, and field mapping); fetching through to
// persistence is orchestrated by the shared convex/jobSyncRunner.ts (J6),
// which itself calls convex/jobSyncShared.ts's provider-agnostic upsert/
// dedupe pipeline (shared with convex/jobicy.ts as of J5) - keyed by
// (provider, externalId) so admin-created rows can never be matched or
// overwritten by this sync.

// Cooldown applied only to the user-facing "Check for New Jobs" trigger
// (UserSyncHimalayas below) - Himalayas itself documents no rate limit, and
// AdminSyncHimalayas stays uncapped as before, but this sync is no longer
// admin-only, so any signed-in user clicking repeatedly needs a floor.
const USER_MIN_SYNC_INTERVAL_MS = 30 * 60 * 1000;

const PROVIDER = "himalayas" as const;
const API_URL = "https://himalayas.app/jobs/api";
// Himalayas' own docs: browse `limit` max is 20 per request, and the feed
// "refreshes daily" - polling faster has no benefit. MAX_PAGES is not a rate
// limit; it's a safety cap so one manual trigger can't run away fetching
// forever. Revisit alongside MAX_JOBS_SCANNED (convex/Jobs.ts) once real
// volume is observed - see JOB_SEARCH_IMPLEMENTATION_ROADMAP.md Milestone 9.
const PAGE_LIMIT = 20;
const MAX_PAGES = 50; // up to ~1000 jobs per run
// Self-throttle between page requests. Himalayas doesn't publish a numeric
// limit for unauthenticated calls ("lower limits" than the keyed 60/min), so
// this is a courtesy pause, not a documented requirement.
const PAGE_DELAY_MS = 300;
const FETCH_TIMEOUT_MS = 20_000;
// Same cap convex/Jobs.ts' cleanJob() applies to admin-entered descriptions.
const MAX_DESCRIPTION_LENGTH = 10_000;

const SALARY_PERIOD_MAP: Record<string, "hour" | "month" | "year"> = {
  hourly: "hour",
  monthly: "month",
  annual: "year",
  // Himalayas also allows "weekly"/"fortnightly" periods, which the existing
  // jobs schema has no equivalent for - intentionally left unmapped so a
  // salary in one of those periods is dropped (see normalizeHimalayasJob)
  // rather than mis-represented under the wrong period.
};

// --- Normalization -------------------------------------------------------------

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// "YYYY-MM-DD" from a Unix-seconds timestamp, using the same local-date
// convention convex/Jobs.ts' todayDateKey() already uses, so
// GetJobsForUser's existing `applicationDeadline >= today` comparison
// behaves identically for Himalayas-sourced jobs without any change there.
function dateKeyFromEpochSeconds(epochSeconds: number | undefined): string | undefined {
  if (epochSeconds === undefined) return undefined;
  const d = new Date(epochSeconds * 1000);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Maps one raw Himalayas job object (exact shape confirmed against a live
// https://himalayas.app/jobs/api response - see JOB_SEARCH_IMPLEMENTATION_PROGRESS.md)
// into the shared jobs schema. Returns null for a record this adapter can't
// use safely (handle incomplete/malformed records without aborting the
// whole run) rather than inventing any missing field.
//
// `vocabulary` should be loaded ONCE per sync run via
// extractSkills.loadSkillVocabulary/GetSkillVocabulary and reused across
// every job passed to this function - not re-loaded per job.
export function normalizeHimalayasJob(raw: unknown, vocabulary: readonly SkillVocabularyEntry[]): NormalizedProviderJob | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as Record<string, unknown>;

  const title = str(j.title);
  const company = str(j.companyName);
  const applyUrl = str(j.applicationLink);
  const guid = str(j.guid);
  // Required for a usable, attributable listing (title/company to show,
  // applyUrl to apply, guid as the stable externalId + attribution link).
  if (!title || !company || !applyUrl || !guid) return null;
  if (!isValidHttpUrl(applyUrl) || !isValidHttpUrl(guid)) return null;

  const locations = Array.isArray(j.locationRestrictions)
    ? j.locationRestrictions.filter((l): l is string => typeof l === "string" && l.trim().length > 0)
    : [];
  // Himalayas gives one general geo signal (locationRestrictions); both the
  // existing free-text `location` field and the `country` field carry the
  // same value for Himalayas rows, since there's nothing more specific to
  // split them with.
  const locationText = locations.length > 0 ? locations.join(", ") : undefined;

  const minSalary = num(j.minSalary);
  const maxSalary = num(j.maxSalary);
  const currency = str(j.currency);
  const rawPeriod = str(j.salaryPeriod)?.toLowerCase();
  const salaryPeriod = rawPeriod ? SALARY_PERIOD_MAP[rawPeriod] : undefined;
  // Require every one of min/max, a mappable period AND a stated currency
  // before showing a salary at all - a partial figure (e.g. an amount with
  // no currency) would misrepresent pay, so it's dropped rather than
  // defaulted (no "assume USD" fallback, unlike the admin form's cleanJob()).
  const hasUsableSalary =
    (minSalary !== undefined || maxSalary !== undefined) && salaryPeriod !== undefined && currency !== undefined;

  // Himalayas returns `description` as full HTML - stripped to plain text
  // here (not just at display time) so the stored value itself is clean for
  // every consumer (JobCard's preview, a future admin-edit view, and skill
  // extraction below), and so word-boundary matching in extraction isn't
  // affected by stray tag/attribute text.
  const description = str(j.description);
  const plainDescription = description ? stripHtmlToText(description) : undefined;

  return {
    title,
    company,
    companyLogo: str(j.companyLogo),
    location: locationText,
    country: locationText,
    // NOTE: deliberately NOT set. Himalayas is widely described as a remote
    // job board, but its own API response has no per-job field confirming
    // remote vs. hybrid vs. onsite, and the J1 research explicitly found the
    // docs "do not explicitly address hybrid or onsite listings." Defaulting
    // every row to "remote" would be inventing a specific per-job attribute
    // the source doesn't actually state - see JOB_SEARCH_IMPLEMENTATION_PROGRESS.md.
    workMode: undefined,
    employmentType: str(j.employmentType),
    salaryMin: hasUsableSalary ? minSalary : undefined,
    salaryMax: hasUsableSalary ? maxSalary : undefined,
    salaryCurrency: hasUsableSalary ? currency : undefined,
    salaryPeriod: hasUsableSalary ? salaryPeriod : undefined,
    // P9: surrogate-pair-safe truncation (truncateDescription), not a plain
    // .slice() - see jobSyncShared.ts's own comment on why a plain slice
    // can produce an unpaired trailing surrogate at exactly this boundary.
    description: plainDescription ? truncateDescription(plainDescription, MAX_DESCRIPTION_LENGTH) : undefined,
    // Extraction runs on the full, untruncated (but now HTML-stripped)
    // description, so a skill mentioned past the 10,000-char cutoff is
    // still found. Himalayas has no structured skill list of its own (its
    // `categories`/`parentCategories` are job-role tags, not skills), so
    // the only input to combineSkills is extraction.
    requiredSkills: combineSkills([], extractSkillsFromDescription(plainDescription, vocabulary)),
    applicationDeadline: dateKeyFromEpochSeconds(num(j.expiryDate)),
    applyUrl,
    source: "Himalayas",
    sourceUrl: guid,
    externalId: guid,
    postedAt: (() => {
      const pub = num(j.pubDate);
      return pub !== undefined ? pub * 1000 : Date.now();
    })(),
    // (J5) Cross-provider dedup key - see convex/jobSyncShared.ts.
    dedupeKey: computeDedupeKey(company, title, applyUrl) || undefined,
  };
}

// --- Fetch -----------------------------------------------------------------------

async function fetchHimalayasPage(cursor: string | undefined): Promise<{ jobs: unknown[]; nextCursor?: string }> {
  const url = new URL(API_URL);
  url.searchParams.set("limit", String(PAGE_LIMIT));
  if (cursor) url.searchParams.set("cursor", cursor);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), { headers: { Accept: "application/json" }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Himalayas API returned HTTP ${res.status}.`);

  const data = (await res.json()) as unknown;
  if (!data || typeof data !== "object" || !Array.isArray((data as Record<string, unknown>).jobs)) {
    throw new Error("Himalayas API returned an unexpected response shape.");
  }
  const body = data as Record<string, unknown>;
  const nextCursor = typeof body.nextCursor === "string" ? body.nextCursor : undefined;
  return { jobs: body.jobs as unknown[], nextCursor };
}

// --- Shared entry point (J6/J7) ----------------------------------------------------

// The actual Himalayas sync call, with no auth logic of its own - every
// caller (the admin-triggered action below, and the n8n HTTP gateway in
// convex/http.ts, J7) is responsible for authenticating/authorizing the
// request *before* calling this, then just forwards the ActionCtx here.
// Exported so neither caller needs its own copy of this options object -
// the HTTP gateway reuses this exact function rather than reconstructing
// the sync options, per J7 Phase 2's "do not duplicate synchronization
// logic in the HTTP gateway."
export async function syncHimalayas(ctx: ActionCtx, minIntervalMs?: number): Promise<ProviderSyncResult> {
  return await runProviderSync(ctx, {
    provider: PROVIDER,
    minIntervalMs,
    maxPages: MAX_PAGES,
    pageDelayMs: PAGE_DELAY_MS,
    fetchPage: fetchHimalayasPage,
    normalize: normalizeHimalayasJob,
  });
}

// --- Public action: the manual (admin panel) sync trigger ---------------------------

// Admin-only manual trigger. Mirrors convex/Jobs.ts's AdminUpsertJob pattern:
// the caller passes an admin session token, verified the same way the admin
// panel already verifies it (api.admin.VerifySession) - no new auth
// mechanism, and no public, unauthenticated mutation is exposed. Called from
// app/api/admin/jobs/sync/route.ts, which itself re-checks the admin session
// cookie before reaching here (same two-layer pattern already used by
// /api/admin/jobs). No rate-limit cooldown here (Himalayas has none
// documented) - that's Jobicy-specific, see convex/jobicy.ts.
export const AdminSyncHimalayas = action({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<ProviderSyncResult> => {
    const session = await ctx.runQuery(api.admin.VerifySession, { token: args.token });
    if (!session) throw new Error("Unauthorized");
    return await syncHimalayas(ctx);
  },
});

// --- Public action: the "Check for New Jobs" trigger on /jobs -----------------------

// Any-signed-in-user trigger for the "Check for New Jobs" button on the
// user-facing /jobs page. The caller (app/api/jobs/check-new/route.ts)
// already checks for a logged-in Clerk session before reaching here, the
// same way app/api/resumes/route.ts gates its own user-facing endpoint -
// this has no per-user scoping of its own since a job sync affects the
// shared `jobs` table, not any one candidate's data. Unlike
// AdminSyncHimalayas above, this applies USER_MIN_SYNC_INTERVAL_MS so the
// button can't be used to hammer the Himalayas API.
export const UserSyncHimalayas = action({
  args: {},
  handler: async (ctx): Promise<ProviderSyncResult> => {
    return await syncHimalayas(ctx, USER_MIN_SYNC_INTERVAL_MS);
  },
});
