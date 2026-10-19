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
            // modes is the Interview Mode's display label (e.g. "HR Interview"),
            // falling back to the stored value for a mode the admin
            // has since removed. lang is the Feedback Language code picked on Create
            // Interview; older interviews didn't store one, so fall back to the
            // candidate's Settings feedback language, then English.
            const interviewModes = await convexClient.query(api.InterviewModes.ListInterviewModes, {});
            const modes =
                interviewModes.find((m) => m.value === interview.mode)?.label ?? interview.mode ?? "";
            let lang = interview.feedbackLang;
            if (!lang) {
                const settings = await convexClient.query(api.UserSettings.GetUserSettings, {
                    userId: convexUser._id,
                });
                lang = settings?.feedbackLanguage || "en";
            }

            const feedbackRes = await fetch(FEEDBACK_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: toFeedbackTranscriptString(feedbackMessages),
                    modes,
                    lang,
                }),
            });

            // Read as text first - an n8n "Respond to Webhook" node may return plain
            // text, an array of items, or a raw Gemini candidate object, and a
            // non-JSON body would otherwise throw and drop the feedback entirely.
            const responseText = await feedbackRes.text();
            if (feedbackRes.ok && responseText.trim()) {
                let feedbackData: unknown = responseText;
                try {
                    feedbackData = JSON.parse(responseText);
                } catch {
                    // Plain-text response - saved as-is.
                }
                const item = Array.isArray(feedbackData) ? feedbackData[0] : feedbackData;
                // A raw Gemini candidate object keeps the feedback text at content.parts[0].text.
                const rawFeedback =
                    typeof item === "object" && item !== null
                        ? (item as { content?: { parts?: { text?: unknown }[] } }).content?.parts?.[0]?.text
                        : undefined;
                await convexClient.mutation(api.Interview.SaveInterviewFeedback, {
                    interviewId: interviewId as Id<"InterviewSessionTable">,
                    userId: convexUser._id,
                    feedback: typeof rawFeedback === "string" ? rawFeedback : item,
                });
            } else {
                console.error("Feedback webhook failed:", feedbackRes.status, responseText.slice(0, 500));
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
