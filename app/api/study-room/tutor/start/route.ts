import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { buildStudyRoomDynamicVariables } from "@/utils/studyRoomTutorContext";
import {
  buildStudyPlannerContext,
  buildQuestionBankContext,
  buildResumeMatchContext,
  buildInterviewReviewContext,
  combineIntegrationContext,
} from "@/utils/studyRoom/integrationContext";
import { parseInterviewFeedbackForTutor } from "@/utils/studyRoom/interviewFeedbackParser";

// AI Study Room Tutor - its own ElevenLabs Conversational AI agent, entirely
// separate from the Mock Interview agent. Reuses the same ELEVENLABS_API_KEY
// (one ElevenLabs account, two agents) but a dedicated
// ELEVENLABS_STUDY_ROOM_AGENT_ID, so nothing here can ever read, change or
// otherwise affect the Interview agent's id, prompt, settings or live calls -
// see AI_STUDY_ROOM_IMPLEMENTATION_PROGRESS.md for the exact dashboard setup
// this agent id needs.

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be logged in to start a study session." }, { status: 401 });
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const convexUser = await convexClient.query(api.users.GetUserByEmail, { email });
  if (!convexUser) {
    return NextResponse.json({ error: "You must be logged in to start a study session." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const sessionId = body?.sessionId as string | undefined;
  if (!sessionId) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const data = await convexClient.query(api.StudyRoom.GetStudyRoomSession, {
    userId: convexUser._id,
    sessionId: sessionId as Id<"studyRoomSessions">,
  });
  if (!data) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (data.session.status !== "in_progress") {
    return NextResponse.json({ error: "This session has already ended." }, { status: 400 });
  }

  const priorMessages = await convexClient.query(api.StudyRoom.GetStudyRoomMessages, {
    userId: convexUser._id,
    sessionId: sessionId as Id<"studyRoomSessions">,
  });

  const settings = await convexClient.query(api.UserSettings.GetUserSettings, { userId: convexUser._id });

  // M5 - unified context mechanism: pull live context from whichever
  // source module this room was optionally started from (never stored
  // redundantly on the room itself), each independently ownership-checked
  // by the module's own existing query. A missing/foreign reference is
  // simply skipped - "handle deleted or unavailable source records
  // gracefully" - never blocking the session from starting.
  const room = data.room;
  const integrationParts: string[] = [];

  if (room.studyTaskId) {
    const taskDetails = await convexClient.query(api.StudyPlanner.GetTaskDetails, {
      userId: convexUser._id,
      taskId: room.studyTaskId,
    });
    if (taskDetails) {
      integrationParts.push(
        buildStudyPlannerContext({
          taskTitle: taskDetails.task.title,
          taskDescription: taskDetails.task.description,
          completionCriteria: taskDetails.task.completionCriteria,
          phaseTitle: taskDetails.phase?.title,
          phaseObjectives: taskDetails.phase?.objectives,
        })
      );
    }
  }

  if (room.questionBankCollectionId && room.questionBankQuestionIds && room.questionBankQuestionIds.length > 0) {
    const collectionData = await convexClient.query(api.QuestionBank.GetCollection, {
      userId: convexUser._id,
      collectionId: room.questionBankCollectionId,
    });
    if (collectionData) {
      const selectedIds = new Set(room.questionBankQuestionIds);
      const selected = collectionData.questions.filter((q) => selectedIds.has(q._id));
      if (selected.length > 0) {
        integrationParts.push(
          buildQuestionBankContext({
            collectionTitle: collectionData.collection.title,
            questions: selected.map((q) => ({ question: q.question, difficulty: q.difficulty })),
          })
        );
      }
    }
  }

  if (room.resumeMatchAnalysisId) {
    const analysisRow = await convexClient.query(api.ResumeMatch.GetResumeMatchAnalysis, {
      userId: convexUser._id,
      analysisId: room.resumeMatchAnalysisId,
    });
    if (analysisRow) {
      const analysis = analysisRow.analysis as {
        matchedSkills?: { name: string }[];
        missingSkills?: { name: string }[];
        interviewFocusAreas?: string[];
      };
      integrationParts.push(
        buildResumeMatchContext({
          jobTitle: analysisRow.jobTitle,
          matchedSkills: (analysis?.matchedSkills ?? []).map((s) => s.name).filter(Boolean),
          missingSkills: (analysis?.missingSkills ?? []).map((s) => s.name).filter(Boolean),
          focusAreas: analysis?.interviewFocusAreas ?? [],
        })
      );
    }
  }

  if (room.interviewReviewId) {
    const interview = await convexClient.query(api.Interview.GetInterviewSessionForUser, {
      userId: convexUser._id,
      interviewId: room.interviewReviewId,
    });
    if (interview?.feedback) {
      const parsed = parseInterviewFeedbackForTutor(interview.feedback);
      integrationParts.push(
        buildInterviewReviewContext({
          jobTitle: interview.jobTitle,
          summary: parsed.summary,
          weakAreas: parsed.weakAreas,
          suggestions: parsed.suggestions,
        })
      );
    }
  }

  const integrationContext = combineIntegrationContext(integrationParts);

  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
  const studyRoomAgentId = process.env.ELEVENLABS_STUDY_ROOM_AGENT_ID;
  if (!elevenLabsApiKey || !studyRoomAgentId) {
    console.error("Missing ELEVENLABS_API_KEY or ELEVENLABS_STUDY_ROOM_AGENT_ID environment variables.");
    return NextResponse.json(
      { error: "The AI Tutor is not configured yet. Please try again later." },
      { status: 500 }
    );
  }

  const { dynamicVariables, firstMessage, language } = buildStudyRoomDynamicVariables({
    learnerName: convexUser.name || "there",
    topic: room.topic,
    objective: room.objective,
    category: room.category,
    difficulty: room.difficulty,
    learningPreferences: room.learningPreferences,
    additionalInstructions: room.additionalInstructions,
    language: settings?.interviewLanguage,
    priorMessages: priorMessages.map((m) => ({ role: m.role, text: m.text })),
    integrationContext,
  });

  try {
    const tokenRes = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${studyRoomAgentId}`,
      { headers: { "xi-api-key": elevenLabsApiKey } }
    );

    if (!tokenRes.ok) {
      const errorBody = await tokenRes.text().catch(() => "");
      console.error("ElevenLabs Study Room token request failed:", tokenRes.status, errorBody);
      return NextResponse.json(
        { error: "Unable to start the AI Tutor. Please try again." },
        { status: 500 }
      );
    }

    const tokenData = await tokenRes.json();
    const conversationToken = tokenData?.token as string | undefined;
    const conversationId = tokenData?.conversation_id as string | undefined;

    if (!conversationToken || !conversationId) {
      console.error("ElevenLabs Study Room token response missing token/conversation_id:", tokenData);
      return NextResponse.json(
        { error: "Unable to start the AI Tutor. Please try again." },
        { status: 500 }
      );
    }

    await convexClient.mutation(api.StudyRoom.SaveStudyRoomElevenLabsConversation, {
      userId: convexUser._id,
      sessionId: sessionId as Id<"studyRoomSessions">,
      elevenlabsConversationId: conversationId,
    });

    return NextResponse.json({
      connection: {
        conversationToken,
        dynamicVariables,
        language,
        firstMessage,
        isResume: priorMessages.length > 0,
      },
    });
  } catch (e) {
    console.error("Failed to start Study Room Tutor conversation:", e);
    return NextResponse.json({ error: "Unable to start the AI Tutor. Please try again." }, { status: 500 });
  }
}

export const runtime = "nodejs";
