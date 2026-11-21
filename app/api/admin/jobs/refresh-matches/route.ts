import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getAdminSession, getConvexClient } from "@/lib/adminAuth";

// Temporary manual trigger for Personalized Job Discovery (D2), for
// controlled verification only - mirrors app/api/admin/jobs/sync/route.ts's
// exact two-layer pattern: the admin session cookie is checked here, and its
// token is checked again inside the Convex action
// (convex/jobDiscovery.ts:AdminRefreshCandidateMatches) before anything
// runs. There is no cron/schedule here, and this route is not linked from
// any admin page - it exists purely so a candidate's matches can be
// recomputed/verified on demand while D3 (automatic profile-save trigger)
// and D4 (daily cycle) remain unbuilt. See
// PERSONALIZED_JOB_DISCOVERY_IMPLEMENTATION_ROADMAP.md Milestone D2.

function convexMessage(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : "";
  return raw.match(/Uncaught Error: ([^\n]+)/)?.[1]?.trim() || raw || fallback;
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const userId = body && typeof body === "object" ? (body as Record<string, unknown>).userId : undefined;
  if (typeof userId !== "string" || !userId) {
    return NextResponse.json({ error: 'A candidate "userId" is required.' }, { status: 400 });
  }

  try {
    const result = await getConvexClient().action(api.jobDiscovery.AdminRefreshCandidateMatches, {
      token: session.token,
      userId: userId as Id<"UserTable">,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: convexMessage(e, "Could not refresh candidate matches.") }, { status: 400 });
  }
}
