import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getAdminSession, getConvexClient } from "@/lib/adminAuth";

// Manual Jobicy sync trigger (J5), following app/api/admin/jobs/sync (the
// Himalayas trigger). The admin session cookie is checked here, and its
// token is checked again inside the Convex action
// (api.admin.VerifySession) before anything runs - same two-layer pattern.
// There is no schedule/cron here; this only runs when an authorized admin
// presses the button on /admin/jobs. The Convex action itself enforces
// Jobicy's documented once-per-hour sync cooldown and returns a clear
// rejection message when it hasn't elapsed - this route just relays it.

function convexMessage(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : "";
  return raw.match(/Uncaught Error: ([^\n]+)/)?.[1]?.trim() || raw || fallback;
}

export async function POST() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const result = await getConvexClient().action(api.jobicy.AdminSyncJobicy, { token: session.token });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: convexMessage(e, "Could not sync Jobicy jobs.") }, { status: 400 });
  }
}
