import { NextResponse } from "next/server";

// --- Tavus agent call paused -------------------------------------------------
// Commented out (not removed) while switching to a different interviewer agent.
// The Convex functions this depended on (GetInterviewByTavusConversationId,
// SaveTranscript) and the tavusConversationId/tavusConversationUrl schema
// fields they looked up by were removed once the interview session table was
// cleaned up - un-pausing this route requires restoring both first.
/*
import { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Tavus does not sign webhook requests, so the only trust boundary is the
// conversation_id -> Convex interview mapping below. Never trust a userId or
// interviewId if one ever showed up in the payload - resolve everything through
// the conversation_id we ourselves generated in /api/interview/start.
export async function POST(req: NextRequest) {
    const payload = await req.json().catch(() => null);
    const eventType = payload?.event_type as string | undefined;
    const conversationId = payload?.conversation_id as string | undefined;

    if (!conversationId) {
        return NextResponse.json({ error: "Missing conversation_id" }, { status: 400 });
    }

    const interview = await convexClient.query(api.Interview.GetInterviewByTavusConversationId, {
        tavusConversationId: conversationId,
    });

    if (!interview) {
        // Unknown/stale conversation_id - acknowledge so Tavus doesn't retry, do nothing.
        return NextResponse.json({ status: "ignored" });
    }

    if (eventType === "application.transcription_ready") {
        const transcript = payload?.properties?.transcript ?? null;
        await convexClient.mutation(api.Interview.SaveTranscript, {
            tavusConversationId: conversationId,
            transcript,
        });
    } else if (eventType === "system.shutdown" && interview.status !== "completed") {
        // Safety net: the room closed (timeout, deletion, etc.) without the candidate
        // explicitly clicking End Call - don't leave the interview stuck "in_progress".
        await convexClient.mutation(api.Interview.CompleteInterview, {
            interviewId: interview._id,
            userId: interview.userId,
        });
    }

    return NextResponse.json({ status: "ok" });
}
*/

export async function POST() {
    return NextResponse.json({ status: "ignored" });
}
