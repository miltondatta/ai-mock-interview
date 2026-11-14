import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { generateSessionSummary } from "@/utils/studyRoom/summaryGenerator";

// AI Study Room - M4 lesson summary generation. Direct Gemini integration
// (utils/studyRoom/*), mirroring Question Bank's own isolated geminiClient -
// never touches the ElevenLabs Tutor pipeline (M2/M3), Study Planner, or
// Question Bank's tables.

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const MIN_MESSAGES = 4;
const MAX_CODE_FILES_IN_PROMPT = 3;
const CODE_EXCERPT_LENGTH = 1500;
const NOTES_EXCERPT_LENGTH = 3000;

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  const force = body?.force === true;
  if (!sessionId) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  const sid = sessionId as Id<"studyRoomSessions">;

  const data = await convexClient.query(api.StudyRoom.GetStudyRoomSession, { userId: convexUser._id, sessionId: sid });
  if (!data) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (data.session.status === "in_progress") {
    return NextResponse.json({ error: "This session hasn't ended yet." }, { status: 400 });
  }

  const messages = await convexClient.query(api.StudyRoom.GetStudyRoomMessages, { userId: convexUser._id, sessionId: sid });
  const learnerCount = messages.filter((m) => m.role === "learner").length;
  if (messages.length < MIN_MESSAGES || learnerCount === 0) {
    return NextResponse.json({ insufficient: true });
  }

  const lock = await convexClient.mutation(api.StudyRoom.BeginSummaryGeneration, {
    userId: convexUser._id,
    sessionId: sid,
    force,
  });
  if (!lock.ok) {
    return NextResponse.json({ status: lock.status }, { status: lock.status === "generating" ? 409 : 200 });
  }

  try {
    const [codeFiles, notes, whiteboard] = await Promise.all([
      convexClient.query(api.StudyRoomWorkspace.GetCodeFiles, { userId: convexUser._id, sessionId: sid }),
      convexClient.query(api.StudyRoomWorkspace.GetNotes, { userId: convexUser._id, sessionId: sid }),
      convexClient.query(api.StudyRoomWorkspace.GetWhiteboard, { userId: convexUser._id, sessionId: sid }),
    ]);

    const whiteboardLabels = Array.isArray(whiteboard?.snapshot?.elements)
      ? whiteboard!.snapshot.elements
          .filter((el: any) => el?.type === "text" && typeof el.text === "string")
          .map((el: any) => el.text as string)
      : [];

    const result = await generateSessionSummary({
      learnerName: convexUser.name || "the learner",
      roomTitle: data.room.title,
      topic: data.room.topic,
      objective: data.room.objective,
      difficulty: data.room.difficulty,
      durationSeconds: data.session.durationSeconds,
      transcript: messages.map((m) => ({ role: m.role, text: m.text })),
      codeFiles: codeFiles.slice(0, MAX_CODE_FILES_IN_PROMPT).map((f) => ({
        filename: f.filename,
        language: f.language,
        contentExcerpt: f.content.slice(0, CODE_EXCERPT_LENGTH),
      })),
      notesExcerpt: notes ? stripHtml(notes.content).slice(0, NOTES_EXCERPT_LENGTH) : undefined,
      whiteboardLabels,
    });

    await convexClient.mutation(api.StudyRoom.SaveSessionSummary, {
      userId: convexUser._id,
      sessionId: sid,
      summary: result.summary,
    });

    return NextResponse.json({ summary: result.summary });
  } catch (e) {
    console.error("Study Room summary generation failed:", e instanceof Error ? e.message : e);
    await convexClient.mutation(api.StudyRoom.MarkSummaryFailed, { userId: convexUser._id, sessionId: sid });
    return NextResponse.json({ error: "Unable to generate a summary right now. Please try again." }, { status: 502 });
  }
}
