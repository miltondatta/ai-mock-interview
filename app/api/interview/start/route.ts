import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { buildTavusConversationalContext } from "@/utils/tavusContext";
import { InterviewQA } from "@/utils/knowledgeBase";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
    const user = await currentUser();
    if (!user) {
        return NextResponse.json(
            { error: "You must be logged in to start an interview." },
            { status: 401 }
        );
    }

    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const convexUser = await convexClient.query(api.users.GetUserByEmail, { email });
    if (!convexUser) {
        return NextResponse.json(
            { error: "You must be logged in to start an interview." },
            { status: 401 }
        );
    }

    const body = await req.json().catch(() => null);
    const interviewId = body?.interviewId as string | undefined;
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

    const questions = (interview.interviewQuestion ?? []) as InterviewQA[];
    if (!Array.isArray(questions) || questions.length === 0) {
        return NextResponse.json(
            { error: "This interview does not contain any questions yet." },
            { status: 400 }
        );
    }

    const tavusApiKey = process.env.TAVUS_API_KEY;
    const tavusPersonaId = process.env.TAVUS_PERSONA_ID;
    if (!tavusApiKey || !tavusPersonaId) {
        console.error("Missing TAVUS_API_KEY or TAVUS_PERSONA_ID environment variables.");
        return NextResponse.json(
            { error: "Unable to start the interview. Please try again." },
            { status: 500 }
        );
    }

    // Reuse an already-active Tavus conversation instead of creating a duplicate
    // (e.g. the candidate refreshed the session page) - but only if Tavus itself
    // still reports it as "active". A conversation whose room the candidate never
    // actually joined (or that has since ended) is stale: silently handing back
    // its URL joins an abandoned/expired room instead of a live one.
    if (interview.tavusConversationId && interview.tavusConversationUrl && interview.status !== "completed") {
        try {
            const statusRes = await fetch(
                `https://tavusapi.com/v2/conversations/${interview.tavusConversationId}`,
                { headers: { "x-api-key": tavusApiKey } }
            );
            if (statusRes.ok) {
                const statusData = await statusRes.json();
                if (statusData?.status === "active") {
                    return NextResponse.json({
                        conversationId: interview.tavusConversationId,
                        conversationUrl: interview.tavusConversationUrl,
                    });
                }
            }
        } catch (e) {
            console.error("Failed to check existing Tavus conversation status:", e);
        }
        // Not active (or the status check itself failed) - fall through and create a fresh one.
    }

    const conversationalContext = buildTavusConversationalContext(questions);

    try {
        const tavusRes = await fetch("https://tavusapi.com/v2/conversations", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": tavusApiKey,
            },
            body: JSON.stringify({
                persona_id: tavusPersonaId,
                conversation_name: `Mock Interview - ${interviewId}`,
                conversational_context: conversationalContext,
                callback_url: new URL("/api/tavus/webhook", req.nextUrl.origin).toString(),
            }),
        });

        if (!tavusRes.ok) {
            const errorBody = await tavusRes.text().catch(() => "");
            console.error("Tavus conversation creation failed:", tavusRes.status, errorBody);
            return NextResponse.json(
                { error: "Unable to start the interview. Please try again." },
                { status: 500 }
            );
        }

        const tavusData = await tavusRes.json();
        const conversationId = tavusData?.conversation_id as string;
        const conversationUrl = tavusData?.conversation_url as string;

        if (!conversationId || !conversationUrl) {
            console.error("Tavus response missing conversation_id/conversation_url:", tavusData);
            return NextResponse.json(
                { error: "Unable to start the interview. Please try again." },
                { status: 500 }
            );
        }

        await convexClient.mutation(api.Interview.SaveTavusConversation, {
            interviewId: interviewId as Id<"InterviewSessionTable">,
            userId: convexUser._id,
            tavusConversationId: conversationId,
            tavusConversationUrl: conversationUrl,
        });

        return NextResponse.json({ conversationId, conversationUrl });
    } catch (e) {
        console.error("Failed to create Tavus conversation:", e);
        return NextResponse.json(
            { error: "Unable to start the interview. Please try again." },
            { status: 500 }
        );
    }
}
