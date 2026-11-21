import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getAdminSession, getConvexClient } from "@/lib/adminAuth";

// Manual Himalayas sync trigger (J3 Phase 6), following app/api/admin/jobs.
// The admin session cookie is checked here, and its token is checked again
// inside the Convex action (api.admin.VerifySession) before anything runs -
// same two-layer pattern as the rest of /api/admin/jobs. There is no
// schedule/cron here; this only runs when an authorized admin presses the
// button on /admin/jobs.

function convexMessage(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : "";
  return raw.match(/Uncaught Error: ([^\n]+)/)?.[1]?.trim() || raw || fallback;
}

export async function POST() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const result = await getConvexClient().action(api.himalayasSync.AdminSyncHimalayas, { token: session.token });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: convexMessage(e, "Could not sync Himalayas jobs.") }, { status: 400 });
  }
}
