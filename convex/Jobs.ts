import { mutation, query } from "./_generated/server";
import { v, type ObjectType } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireSession } from "./admin";
import { computeProfileCompletion } from "./ProfessionalProfile";
import { matchJob, type MatchResult } from "./jobMatching";

// Jobs module (M7). Admins post openings from /admin/jobs (session-token
// guarded, like the other admin functions). Signed-in users read the active
// ones with GetJobsForUser.

// Newest active jobs considered per request. That keeps matching cheap, and
// Convex caches the query result, recomputing it only when the jobs table or
// the user's profile row changes.
const MAX_JOBS_SCANNED = 300;

const WORK_MODE = v.union(v.literal("onsite"), v.literal("remote"), v.literal("hybrid"));
const SALARY_PERIOD = v.union(v.literal("hour"), v.literal("month"), v.literal("year"));

const jobInput = {
  title: v.string(),
  company: v.string(),
  location: v.optional(v.string()),
  workMode: v.optional(WORK_MODE),
  employmentType: v.optional(v.string()),
  salaryMin: v.optional(v.number()),
  salaryMax: v.optional(v.number()),
  salaryCurrency: v.optional(v.string()),
  salaryPeriod: v.optional(SALARY_PERIOD),
  description: v.optional(v.string()),
  requiredSkills: v.array(v.string()),
  minYearsExperience: v.optional(v.number()),
  maxYearsExperience: v.optional(v.number()),
  educationRequirement: v.optional(v.string()),
  requiredCertifications: v.optional(v.array(v.string())),
  source: v.optional(v.string()),
  applyUrl: v.string(),
  active: v.boolean(),
};

// --- Validation ---------------------------------------------------------------

function text(value: string | undefined, label: string, max: number, required = false): string | undefined {
  const t = (value ?? "").trim();
  if (required && !t) throw new Error(`${label} is required.`);
  if (t.length > max) throw new Error(`${label} must be at most ${max} characters.`);
  return t || undefined;
}

function list(values: string[] | undefined, label: string, maxItems: number, maxLength: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values ?? []) {
    const t = raw.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    if (t.length > maxLength) throw new Error(`Each ${label} must be at most ${maxLength} characters.`);
    seen.add(t.toLowerCase());
    out.push(t);
  }
  if (out.length > maxItems) throw new Error(`At most ${maxItems} ${label}s are allowed.`);
  return out;
}

function nonNegative(value: number | undefined, label: string, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0 || value > max) throw new Error(`${label} must be between 0 and ${max}.`);
  return value;
}

function applyUrl(value: string): string {
  const t = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(t);
  } catch {
    throw new Error("Application link must be a full URL starting with https://");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Application link must be an http(s) URL.");
  if (t.length > 1000) throw new Error("Application link is too long.");
  return t;
}

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as T;
}

function cleanJob(args: ObjectType<typeof jobInput>) {
  const salaryMin = nonNegative(args.salaryMin, "Minimum salary", 100_000_000);
  const salaryMax = nonNegative(args.salaryMax, "Maximum salary", 100_000_000);
  if (salaryMin !== undefined && salaryMax !== undefined && salaryMax < salaryMin) {
    throw new Error("Maximum salary can't be lower than the minimum.");
  }
  const minYears = nonNegative(args.minYearsExperience, "Minimum experience", 60);
  const maxYears = nonNegative(args.maxYearsExperience, "Maximum experience", 60);
  if (minYears !== undefined && maxYears !== undefined && maxYears < minYears) {
    throw new Error("Maximum experience can't be lower than the minimum.");
  }
  const currency = text(args.salaryCurrency, "Currency", 3)?.toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a 3-letter code such as USD.");
  const certs = list(args.requiredCertifications, "certification", 20, 200);
  return stripUndefined({
    title: text(args.title, "Job title", 200, true)!,
    company: text(args.company, "Company", 200, true)!,
    location: text(args.location, "Location", 200),
    workMode: args.workMode,
    employmentType: text(args.employmentType, "Employment type", 50),
    salaryMin,
    salaryMax,
    salaryCurrency: salaryMin !== undefined || salaryMax !== undefined ? currency ?? "USD" : undefined,
    salaryPeriod: salaryMin !== undefined || salaryMax !== undefined ? args.salaryPeriod ?? "year" : undefined,
    description: text(args.description, "Description", 10_000),
    requiredSkills: list(args.requiredSkills, "skill", 50, 60),
    minYearsExperience: minYears,
    maxYearsExperience: maxYears,
    educationRequirement: text(args.educationRequirement, "Education requirement", 200),
    requiredCertifications: certs.length > 0 ? certs : undefined,
    source: text(args.source, "Source", 100),
    applyUrl: applyUrl(args.applyUrl),
    active: args.active,
  });
}

// --- Admin ------------------------------------------------------------------------

export const AdminListJobs = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const jobs = await ctx.db.query("jobs").collect();
    return jobs.sort((a, b) => b.postedAt - a.postedAt);
  },
});

export const AdminUpsertJob = mutation({
  args: { token: v.string(), id: v.optional(v.id("jobs")), ...jobInput },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const { token: _token, id, ...input } = args;
    const job = cleanJob(input);
    const now = Date.now();
    if (id) {
      const existing = await ctx.db.get(id);
      if (!existing) throw new Error("Job not found.");
      // replace (not patch), so clearing a field in the form actually clears it
      await ctx.db.replace(id, { ...job, postedAt: existing.postedAt, updatedAt: now });
      return id;
    }
    return await ctx.db.insert("jobs", { ...job, postedAt: now, updatedAt: now });
  },
});

export const AdminDeleteJob = mutation({
  args: { token: v.string(), id: v.id("jobs") },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    if (await ctx.db.get(args.id)) await ctx.db.delete(args.id);
  },
});

// --- Users ------------------------------------------------------------------------

export type PublicJob = Omit<Doc<"jobs">, "active" | "updatedAt">;

export interface JobForUser {
  job: PublicJob;
  // Only present when the result is personalized (profile complete).
  match?: Pick<MatchResult, "score" | "reasons" | "matchedSkills" | "missingSkills">;
}

// Active jobs for the signed-in user.
//   - Profile complete: every job is scored against the profile (jobMatching.ts)
//     and sorted by score. With matchesOnly, only jobs above the match threshold
//     are returned.
//   - Profile incomplete or missing: newest first, with NO scores and
//     personalized: false, so the UI never presents these as matched to the
//     user. matchesOnly is ignored, because there's nothing to match against.
export const GetJobsForUser = query({
  args: {
    userId: v.id("UserTable"),
    limit: v.optional(v.number()),
    matchesOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(MAX_JOBS_SCANNED, Math.floor(args.limit ?? MAX_JOBS_SCANNED)));
    const user = await ctx.db.get(args.userId);
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_active_posted", q => q.eq("active", true))
      .order("desc")
      .take(MAX_JOBS_SCANNED);

    const profile = user
      ? await ctx.db.query("UserProfileTable").withIndex("by_user", q => q.eq("userId", args.userId)).first()
      : null;
    const personalized = !!profile && computeProfileCompletion(profile).isComplete;

    const strip = ({ active: _a, updatedAt: _u, ...rest }: Doc<"jobs">): PublicJob => rest;

    let items: JobForUser[];
    if (personalized && profile) {
      const scored = jobs.map(job => ({ job, result: matchJob(job, profile) }));
      items = scored
        .filter(s => !args.matchesOnly || s.result.isMatch)
        .sort((a, b) => b.result.score - a.result.score || b.job.postedAt - a.job.postedAt)
        .map(({ job, result }) => ({
          job: strip(job),
          match: {
            score: result.score,
            reasons: result.reasons,
            matchedSkills: result.matchedSkills,
            missingSkills: result.missingSkills,
          },
        }));
    } else {
      items = jobs.map(job => ({ job: strip(job) }));
    }

    return {
      personalized,
      totalActiveJobs: jobs.length,
      jobs: items.slice(0, limit),
    };
  },
});
