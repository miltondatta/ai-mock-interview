import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Mirrors the Interview feature's beforeunload -> sendBeacon("/api/interview/end")
// pattern, scoped to Study Room sessions: if the learner closes/refreshes the
// tab mid-session instead of clicking End Session, this marks it ended so it
// never stays "in_progress" forever. M4 - this path always ends a session as
// "abandoned", not "completed" (EndStudyRoomSession's `if (status !==
// "in_progress") return` guard means an explicit End Session click that
// already completed it first always wins - this is only a safety net for
// the tab actually closing uncompleted). No summary is generated here; the
// Session Completion/abandoned-session page triggers that itself on load.
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
  const sessionId = body?.sessionId as string | undefined;
  if (!sessionId) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  try {
    await convexClient.mutation(api.StudyRoom.EndStudyRoomSession, {
      userId: convexUser._id,
      sessionId: sessionId as Id<"studyRoomSessions">,
      reason: "abandoned",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Failed to end Study Room session:", e);
    return NextResponse.json({ error: "Unable to end this session." }, { status: 500 });
  }
}

export const runtime = "nodejs";
