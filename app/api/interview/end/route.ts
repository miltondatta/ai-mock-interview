import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const FEEDBACK_WEBHOOK_URL = "https://n8n.vistechsolutions.online/webhook/generate_feedback";

type FeedbackMessage = { from: string; text: string };

// The feedback webhook expects a single-line, single-quoted (not standard-JSON)
// string representation of the conversation, e.g. [{'from':'bot','text':'...'}].
function toFeedbackTranscriptString(messages: FeedbackMessage[]): string {
    const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const items = messages.map((m) => `{'from':'${escape(m.from)}','text':'${escape(m.text)}'}`);
    return `[${items.join(",")}]`;
}

export async function POST(req: NextRequest) {
    const user = await currentUser();
    if (!user) {
        return NextResponse.json(
            { error: "You must be logged in to end an interview." },
            { status: 401 }
        );
    }

    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const convexUser = await convexClient.query(api.users.GetUserByEmail, { email });
    if (!convexUser) {
        return NextResponse.json(
            { error: "You must be logged in to end an interview." },
            { status: 401 }
        );
    }

    const body = await req.json().catch(() => null);
    const interviewId = body?.interviewId as string | undefined;
    const feedbackMessages = Array.isArray(body?.messages) ? (body.messages as FeedbackMessage[]) : null;
    if (!interviewId) {
        return NextResponse.json({ error: "Interview not found." }, { status: 404 });
    }

    const interview = await convexClient.query(api.Interview.GetInterviewSessionForUser, {
        interviewId: interviewId as Id<"InterviewSessionTable">,
        userId: convexUser._id,
    });

    if (!interview) {
        return NextResponse.json({ error: "Interview not found." }, { status: 404 });
    }

    // Idempotent: already completed, nothing further to do.
    if (interview.status === "completed") {
        return NextResponse.json({ status: "completed" });
    }

    // --- Tavus agent call paused -------------------------------------------------
    // Commented out (not removed) while switching to a different interviewer agent.
    /*
    const tavusApiKey = process.env.TAVUS_API_KEY;
    if (interview.tavusConversationId && tavusApiKey) {
        try {
            const tavusRes = await fetch(
                `https://tavusapi.com/v2/conversations/${interview.tavusConversationId}/end`,
                {
                    method: "POST",
                    headers: { "x-api-key": tavusApiKey },
                }
            );
            if (!tavusRes.ok) {
                const errorBody = await tavusRes.text().catch(() => "");
                console.error("Tavus end-conversation failed:", tavusRes.status, errorBody);
            }
        } catch (e) {
            console.error("Failed to end Tavus conversation:", e);
        }
    }
    */

    // ElevenLabs has no server-side "terminate" endpoint - the conversation ends
    // when the client's WebRTC connection closes (an explicit endSession() call,
    // or the browser tearing it down on tab close). This is a best-effort
    // transcript sync only: the conversation may still be "processing" for a few
    // seconds after the candidate disconnects, in which case the transcript is
    // simply left unset rather than retried.
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    if (interview.elevenlabsConversationId && elevenLabsApiKey) {
        try {
            const conversationRes = await fetch(
                `https://api.elevenlabs.io/v1/convai/conversations/${interview.elevenlabsConversationId}`,
                { headers: { "xi-api-key": elevenLabsApiKey } }
            );
            if (conversationRes.ok) {
                const conversationData = await conversationRes.json();
                if (conversationData?.status === "done" && conversationData?.transcript) {
                    await convexClient.mutation(api.Interview.SaveAgentTranscript, {
                        interviewId: interviewId as Id<"InterviewSessionTable">,
                        userId: convexUser._id,
                        transcript: conversationData.transcript,
                    });
                }
            } else {
                console.error("ElevenLabs get-conversation failed:", conversationRes.status);
            }
        } catch (e) {
            console.error("Failed to fetch ElevenLabs conversation transcript:", e);
        }
    }

    // Best-effort feedback generation - the candidate should still land back on the
    // dashboard and have the interview marked completed even if this fails.
    if (feedbackMessages && feedbackMessages.length > 0) {
        try {
            const feedbackRes = await fetch(FEEDBACK_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: toFeedbackTranscriptString(feedbackMessages) }),
            });

            if (feedbackRes.ok) {
                const feedbackData = await feedbackRes.json();
                // N8N returns a raw Gemini candidate object; the feedback text lives at content.parts[0].text
                const rawFeedback = feedbackData?.content?.parts?.[0]?.text;
                await convexClient.mutation(api.Interview.SaveInterviewFeedback, {
                    interviewId: interviewId as Id<"InterviewSessionTable">,
                    userId: convexUser._id,
                    feedback: typeof rawFeedback === "string" ? rawFeedback : feedbackData,
                });
            } else {
                console.error("Feedback webhook failed:", feedbackRes.status);
            }
        } catch (e) {
            console.error("Failed to generate interview feedback:", e);
        }
    }

    await convexClient.mutation(api.Interview.CompleteInterview, {
        interviewId: interviewId as Id<"InterviewSessionTable">,
        userId: convexUser._id,
    });

    return NextResponse.json({ status: "completed" });
}
