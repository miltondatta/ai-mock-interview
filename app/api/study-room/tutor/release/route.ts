import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Phase 1 - releases a tab's single-active-tab Tutor lease when the tab is
// closed/hidden for good (sent with navigator.sendBeacon from
// StudyRoomTutorSession's `pagehide` handler, where an ordinary Convex
// mutation can't be relied on to finish). Only the owning tab's release has
// any effect (see convex/StudyRoom.ts:ReleaseTutorLease). This never ends
// the session itself - that stays the job of /api/study-room/tutor/end.
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const convexUser = await convexClient.query(api.users.GetUserByEmail, { email });
  if (!convexUser) {
    return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const clientId = typeof body?.clientId === "string" ? body.clientId : "";
  if (!sessionId || !clientId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    await convexClient.mutation(api.StudyRoom.ReleaseTutorLease, {
      userId: convexUser._id,
      sessionId: sessionId as Id<"studyRoomSessions">,
      clientId,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Failed to release Study Room Tutor lease:", e);
    return NextResponse.json({ error: "Unable to release this session." }, { status: 500 });
  }
}

export const runtime = "nodejs";
