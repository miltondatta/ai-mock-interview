import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { resolveProfileUserId } from "@/utils/profileAuth";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Manual "Check for New Jobs" trigger for the user-facing /jobs page (any
// signed-in user, unlike /api/admin/jobs/sync[-jobicy] which are
// admin-session-gated). Runs both provider syncs - convex/himalayasSync.ts's
// UserSyncHimalayas and convex/jobicy.ts's UserSyncJobicy, each with its own
// cooldown already built in - and reports both outcomes together. Neither
// sync action is scoped to this particular user; the Clerk check below only
// gates who may press the button, same pattern as app/api/resumes/route.ts.
//
// P4: once synchronization has completed, also refreshes the clicking
// candidate's own recommendations (convex/jobDiscovery.ts's
// RefreshMyCandidateMatches), so they see results from jobs this exact
// click just synced without waiting for a profile edit or the daily cron.
// This is strictly additive - the sync gate/auth/cooldown logic above is
// completely unchanged.

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
  // error, not a false "0 new, 0 updated" success - and, since nothing new
  // was actually synced, there is nothing worth rescoring against either,
  // so the matches-refresh step below is never reached in that case.
  if (errors.length === 2) {
    return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
  }

  // P4 (step 5): synchronization has now completed - whether both
  // providers succeeded or only one did (provider failure isolation is
  // unchanged above: jobsInserted/jobsUpdated already reflect only
  // whichever provider(s) actually persisted jobs). Refreshing here
  // reuses the exact same refreshCandidateMatches chain every other trigger
  // in this app already uses - no second matching implementation - and
  // runs exactly once per request, never once per provider, so a candidate
  // never gets two overlapping refreshes from one click. Isolated in its
  // own try/catch: the synchronization response above has already
  // succeeded by this point, and a failure to resolve this candidate's own
  // Convex id or to refresh their matches must never turn that into an
  // error response.
  let matchesRefreshed = false;
  try {
    const userId = await resolveProfileUserId();
    if (userId) {
      await convexClient.action(api.jobDiscovery.RefreshMyCandidateMatches, { userId });
      matchesRefreshed = true;
    }
  } catch (e) {
    console.error("Check for New Jobs: could not refresh candidate matches -", convexMessage(e, "unknown error"));
  }

  return NextResponse.json({ jobsInserted, jobsUpdated, jobsExpired, errors, matchesRefreshed });
}
