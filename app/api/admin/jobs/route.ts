import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getAdminSession, getConvexClient } from "@/lib/adminAuth";

// Admin job management (M7), following app/api/admin/plans. The admin session
// cookie is checked here, and its token is checked again in Convex
// (requireSession). Field validation lives in convex/Jobs.ts (cleanJob).

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function strList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(v => String(v));
  if (typeof value === "string") return value.split(",");
  return [];
}

const WORK_MODES = ["onsite", "remote", "hybrid"] as const;
const SALARY_PERIODS = ["hour", "month", "year"] as const;

// Type guard: narrows an unknown body value to one of the allowed literals.
function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function parseJob(body: Record<string, unknown>) {
  const workMode = oneOf(WORK_MODES, body.workMode);
  const salaryPeriod = oneOf(SALARY_PERIODS, body.salaryPeriod);
  return {
    title: str(body.title) ?? "",
    company: str(body.company) ?? "",
    location: str(body.location),
    workMode,
    employmentType: str(body.employmentType),
    salaryMin: num(body.salaryMin),
    salaryMax: num(body.salaryMax),
    salaryCurrency: str(body.salaryCurrency),
    salaryPeriod,
    description: str(body.description),
    requiredSkills: strList(body.requiredSkills),
    minYearsExperience: num(body.minYearsExperience),
    maxYearsExperience: num(body.maxYearsExperience),
    educationRequirement: str(body.educationRequirement),
    requiredCertifications: strList(body.requiredCertifications),
    source: str(body.source),
    applicationDeadline: str(body.applicationDeadline),
    applyUrl: str(body.applyUrl) ?? "",
    active: body.active !== false,
  };
}

// Convex error text looks like "... Uncaught Error: <msg>".
function convexMessage(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : "";
  return raw.match(/Uncaught Error: ([^\n]+)/)?.[1]?.trim() || fallback;
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  try {
    const id = await getConvexClient().mutation(api.Jobs.AdminUpsertJob, {
      token: session.token,
      id: typeof body.id === "string" ? (body.id as Id<"jobs">) : undefined,
      ...parseJob(body),
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: convexMessage(e, "Could not save the job.") }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.id !== "string") return NextResponse.json({ error: "Job id is required." }, { status: 400 });

  try {
    await getConvexClient().mutation(api.Jobs.AdminDeleteJob, { token: session.token, id: body.id as Id<"jobs"> });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: convexMessage(e, "Could not delete the job.") }, { status: 400 });
  }
}
