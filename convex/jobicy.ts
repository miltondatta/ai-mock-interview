import { action, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { combineSkills, extractSkillsFromDescription, type SkillVocabularyEntry } from "./extractSkills";
import { computeDedupeKey, stripHtmlToText, type NormalizedProviderJob } from "./jobSyncShared";
import { runProviderSync, type ProviderSyncResult } from "./jobSyncRunner";

// Jobicy job-provider sync (J5, extended by J6). See
// JOB_SEARCH_TECHNICAL_DESIGN.md and JOB_SEARCH_IMPLEMENTATION_ROADMAP.md.
// Manual admin trigger only - there is no schedule/cron/n8n workflow yet (a
// later milestone). This file keeps only what's actually Jobicy-specific
// (the endpoint, pagination shape, and field mapping); fetching through to
// persistence is orchestrated by the shared convex/jobSyncRunner.ts (J6),
// which itself calls convex/jobSyncShared.ts's provider-agnostic pipeline
// (the same one convex/himalayasSync.ts uses) - keyed by
// (provider, externalId) so admin-created rows, and Himalayas' own rows,
// can never be matched or overwritten by this sync.
//
// Endpoint and every field name below were confirmed against a live
// response fetched directly during implementation (not assumed from the
// GitHub README) - see JOB_SEARCH_IMPLEMENTATION_PROGRESS.md for the
// discrepancies that surfaced (the real endpoint is `/api/v2/remote-jobs`,
// not `/api/jobs`, and the observed page size is capped at 100, not 200).

const PROVIDER = "jobicy" as const;
const API_URL = "https://jobicy.com/api/v2/remote-jobs";
// Observed live behavior: requesting `count` above 100 still returns at
// most 100 jobs per page, regardless of the README's stated "1-200" range -
// so 100 is used directly rather than asking for more than is honored.
const PAGE_LIMIT = 100;
// Jobicy's feed is windowed to roughly the last 7 days (per its own docs),
// not a full historical catalog, so this cap is far less likely to be the
// reason a run doesn't finish than Himalayas' was - but it's still a safety
// bound, not a documented requirement, so one manual click can't run away
// fetching forever.
const MAX_PAGES = 30; // up to ~3,000 jobs per run
const PAGE_DELAY_MS = 200;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_DESCRIPTION_LENGTH = 10_000;
// Jobicy's own README: "Do not schedule new automated synchronization
// passes more frequently than once per hour." Enforced via the shared
// beginSyncRun's minIntervalMs (J5 Phase 3) - this is a per-provider
// cooldown between RUNS, deliberately not applied to Himalayas, which
// publishes no such restriction.
const MIN_SYNC_INTERVAL_MS = 60 * 60 * 1000;

const SALARY_PERIOD_MAP: Record<string, "hour" | "month" | "year"> = {
  hourly: "hour",
  monthly: "month",
  yearly: "year",
  // Any other value (none observed in practice) is left unmapped, so a
  // salary in a period the existing jobs schema can't represent is dropped
  // rather than mis-represented under the wrong period - same rule
  // convex/himalayasSync.ts already applies.
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
}

// Jobicy's `id` is numeric in the live response; externalId on `jobs` is a
// string, so this is just a type conversion, not a different identifier.
function externalIdOf(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return str(value);
}

// Maps one raw Jobicy job object (exact shape confirmed against a live
// https://jobicy.com/api/v2/remote-jobs response) into the shared jobs
// schema. Returns null for a record this adapter can't use safely (handle
// incomplete/malformed records without aborting the whole run) rather than
// inventing any missing field.
//
// `vocabulary` should be loaded ONCE per sync run and reused across every
// job passed to this function - not re-loaded per job (same convention
// convex/himalayasSync.ts already follows).
export function normalizeJobicyJob(raw: unknown, vocabulary: readonly SkillVocabularyEntry[]): NormalizedProviderJob | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as Record<string, unknown>;

  const title = str(j.jobTitle);
  const company = str(j.companyName);
  const url = str(j.url);
  const externalId = externalIdOf(j.id);
  // Required for a usable, attributable listing. Jobicy gives one URL for
  // both "apply" and "view the original listing" - there is no separate
  // application link, unlike Himalayas.
  if (!title || !company || !url || !externalId) return null;
  if (!isValidHttpUrl(url)) return null;

  const geo = str(j.jobGeo);
  const employmentTypes = stringArray(j.jobType);

  const minSalary = num(j.salaryMin);
  const maxSalary = num(j.salaryMax);
  const currency = str(j.salaryCurrency);
  const rawPeriod = str(j.salaryPeriod)?.toLowerCase();
  const salaryPeriod = rawPeriod ? SALARY_PERIOD_MAP[rawPeriod] : undefined;
  // Same rule as Himalayas: require min-or-max, a mappable period, AND a
  // stated currency before showing any salary - a partial figure would
  // misrepresent pay, so it's dropped rather than defaulted.
  const hasUsableSalary =
    (minSalary !== undefined || maxSalary !== undefined) && salaryPeriod !== undefined && currency !== undefined;

  // Jobicy returns `jobDescription` as full HTML too - stripped to plain
  // text here for the same reasons as convex/himalayasSync.ts.
  const description = str(j.jobDescription);
  const plainDescription = description ? stripHtmlToText(description) : undefined;

  const pubDateRaw = j.pubDate;
  const parsedPubDate = typeof pubDateRaw === "string" ? Date.parse(pubDateRaw) : NaN;

  return {
    title,
    company,
    companyLogo: str(j.companyLogo),
    // Jobicy gives one geo string per job (e.g. "USA", "Europe", "Anywhere") -
    // both the existing free-text `location` field and `country` carry the
    // same value, since there's nothing more specific to split them with.
    location: geo,
    country: geo,
    // NOTE: deliberately NOT set, same reasoning as convex/himalayasSync.ts -
    // Jobicy's response has no per-job field confirming remote vs. hybrid
    // vs. onsite, so this is left unset rather than assumed.
    workMode: undefined,
    employmentType: employmentTypes.length > 0 ? employmentTypes.join(", ") : undefined,
    salaryMin: hasUsableSalary ? minSalary : undefined,
    salaryMax: hasUsableSalary ? maxSalary : undefined,
    salaryCurrency: hasUsableSalary ? currency : undefined,
    salaryPeriod: hasUsableSalary ? salaryPeriod : undefined,
    description: plainDescription ? plainDescription.slice(0, MAX_DESCRIPTION_LENGTH) : undefined,
    // Extraction runs on the full, untruncated (HTML-stripped) description.
    // Jobicy's `jobIndustry` (e.g. "Sales") is a category tag, not a skill,
    // and `jobLevel` (e.g. "Senior") has no numeric-years field to map into
    // without inventing a number - neither is used here, same reasoning
    // already documented for Himalayas' equivalent fields.
    requiredSkills: combineSkills([], extractSkillsFromDescription(plainDescription, vocabulary)),
    // Jobicy's feed has no per-job expiry/deadline field at all (unlike
    // Himalayas' expiryDate) - left unset rather than invented. This means
    // Jobicy jobs rely entirely on the removed-upstream sweep (see the
    // action below) to ever become inactive, not on the existing
    // applicationDeadline freshness filter.
    applicationDeadline: undefined,
    applyUrl: url,
    source: "Jobicy",
    sourceUrl: url,
    externalId,
    postedAt: Number.isFinite(parsedPubDate) ? parsedPubDate : Date.now(),
    // (J5) Cross-provider dedup key - see convex/jobSyncShared.ts.
    dedupeKey: computeDedupeKey(company, title, url) || undefined,
  };
}

// --- Fetch -----------------------------------------------------------------------

async function fetchJobicyPage(cursor: string | undefined): Promise<{ jobs: unknown[]; nextCursor?: string; hasMore: boolean }> {
  const url = new URL(API_URL);
  url.searchParams.set("count", String(PAGE_LIMIT));
  if (cursor) url.searchParams.set("cursor", cursor);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), { headers: { Accept: "application/json" }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Jobicy API returned HTTP ${res.status}.`);

  const data = (await res.json()) as unknown;
  if (!data || typeof data !== "object" || !Array.isArray((data as Record<string, unknown>).jobs)) {
    throw new Error("Jobicy API returned an unexpected response shape.");
  }
  const body = data as Record<string, unknown>;
  const nextCursor = typeof body.nextCursor === "string" ? body.nextCursor : undefined;
  return { jobs: body.jobs as unknown[], nextCursor, hasMore: body.hasMore === true };
}

// --- Shared entry point (J6/J7) ----------------------------------------------------

// The actual Jobicy sync call, with no auth logic of its own - every caller
// (the admin-triggered action below, and the n8n HTTP gateway in
// convex/http.ts, J7) is responsible for authenticating/authorizing the
// request *before* calling this, then just forwards the ActionCtx here.
// Exported so neither caller needs its own copy of this options object,
// and - critically - so MIN_SYNC_INTERVAL_MS (Jobicy's one-hour cooldown)
// is enforced identically for every caller, including n8n, rather than
// being re-specified per caller.
export async function syncJobicy(ctx: ActionCtx): Promise<ProviderSyncResult> {
  return await runProviderSync(ctx, {
    provider: PROVIDER,
    minIntervalMs: MIN_SYNC_INTERVAL_MS,
    maxPages: MAX_PAGES,
    pageDelayMs: PAGE_DELAY_MS,
    fetchPage: fetchJobicyPage,
    normalize: normalizeJobicyJob,
  });
}

// --- Public action: the manual (admin panel) sync trigger ---------------------------

// Admin-only manual trigger, same two-layer auth pattern as
// convex/himalayasSync.ts's AdminSyncHimalayas (caller passes an admin
// session token, independently re-verified here via api.admin.VerifySession;
// called from app/api/admin/jobs/sync-jobicy/route.ts, which itself checks
// the admin session cookie first).
export const AdminSyncJobicy = action({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<ProviderSyncResult> => {
    const session = await ctx.runQuery(api.admin.VerifySession, { token: args.token });
    if (!session) throw new Error("Unauthorized");
    return await syncJobicy(ctx);
  },
});

// --- Public action: the "Check for New Jobs" trigger on /jobs -----------------------

// Any-signed-in-user trigger for the "Check for New Jobs" button on the
// user-facing /jobs page (see convex/himalayasSync.ts's UserSyncHimalayas
// for the matching counterpart and app/api/jobs/check-new/route.ts, the
// only caller, which gates on a logged-in Clerk session). Reuses
// syncJobicy() exactly as AdminSyncJobicy does, including its existing
// once-per-hour MIN_SYNC_INTERVAL_MS cooldown - already global per
// provider, not admin-specific, so no separate cooldown is needed here.
export const UserSyncJobicy = action({
  args: {},
  handler: async (ctx): Promise<ProviderSyncResult> => {
    return await syncJobicy(ctx);
  },
});
