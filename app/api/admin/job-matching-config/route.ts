import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getAdminSession, getConvexClient } from "@/lib/adminAuth";

// Job Matching Configuration (P0). Same two-layer auth pattern as
// app/api/admin/settings/route.ts: the admin session cookie is checked
// here, and its token is re-verified inside the Convex mutation
// (convex/jobMatchingConfig.ts:UpdateJobMatchingConfig) before anything is
// written - this route never trusts the cookie check alone.

const ALLOWED_KEYS = [
  "minimumMatchScore",
  "requireIsMatch",
  "maxRecommendationsPerCandidate",
  "recommendationSortOrder",
  "reevaluateAfterProfileUpdate",
  "automaticJobSyncEnabled",
] as const;

function convexMessage(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : "";
  return raw.match(/Uncaught Error: ([^\n]+)/)?.[1]?.trim() || raw || fallback;
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    if (key in body) patch[key] = (body as Record<string, unknown>)[key];
  }

  try {
    const result = await getConvexClient().mutation(api.jobMatchingConfig.UpdateJobMatchingConfig, {
      token: session.token,
      ...patch,
    } as never);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: convexMessage(e, "Could not save job matching configuration.") }, { status: 400 });
  }
}
