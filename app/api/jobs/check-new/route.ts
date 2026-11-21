import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Manual "Check for New Jobs" trigger for the user-facing /jobs page (any
// signed-in user, unlike /api/admin/jobs/sync[-jobicy] which are
// admin-session-gated). Runs both provider syncs - convex/himalayasSync.ts's
// UserSyncHimalayas and convex/jobicy.ts's UserSyncJobicy, each with its own
// cooldown already built in - and reports both outcomes together. Neither
// action is scoped to this particular user; the Clerk check below only
// gates who may press the button, same pattern as app/api/resumes/route.ts.

function convexMessage(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : "";
  return raw.match(/Uncaught Error: ([^\n]+)/)?.[1]?.trim() || raw || fallback;
}

export async function POST() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be logged in to check for new jobs." }, { status: 401 });
  }

  const [himalayas, jobicy] = await Promise.all([
    convexClient.action(api.himalayasSync.UserSyncHimalayas, {}).then(
      (result) => ({ ok: true as const, result }),
      (e) => ({ ok: false as const, error: convexMessage(e, "Could not sync Himalayas jobs.") })
    ),
    convexClient.action(api.jobicy.UserSyncJobicy, {}).then(
      (result) => ({ ok: true as const, result }),
      (e) => ({ ok: false as const, error: convexMessage(e, "Could not sync Jobicy jobs.") })
    ),
  ]);

  const jobsInserted = (himalayas.ok ? himalayas.result.jobsInserted : 0) + (jobicy.ok ? jobicy.result.jobsInserted : 0);
  const jobsUpdated = (himalayas.ok ? himalayas.result.jobsUpdated : 0) + (jobicy.ok ? jobicy.result.jobsUpdated : 0);
  const jobsExpired = (himalayas.ok ? himalayas.result.jobsExpired : 0) + (jobicy.ok ? jobicy.result.jobsExpired : 0);
  const errors = [himalayas.ok ? null : himalayas.error, jobicy.ok ? null : jobicy.error].filter(
    (e): e is string => e !== null
  );

  // Both providers failing (e.g. both still cooling down) is reported as an
  // error, not a false "0 new, 0 updated" success.
  if (errors.length === 2) {
    return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
  }

  return NextResponse.json({ jobsInserted, jobsUpdated, jobsExpired, errors });
}
