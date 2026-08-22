import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
// Tavus agent call paused below - import kept commented alongside it, not removed.
// import { buildTavusConversationalContext } from "@/utils/tavusContext";
import { InterviewQA } from "@/utils/knowledgeBase";
import { buildInterviewDynamicVariables } from "@/utils/elevenlabsContext";

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

    // --- Tavus agent call paused -------------------------------------------------
    // Commented out (not removed) while switching to a different interviewer agent.
    // See the correction plan discussed with the team before re-enabling or replacing
    // this block - the new agent is not a drop-in replacement (different provider,
    // different session/connection model, no equivalent webhook).
    /*
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
    */

    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    const elevenLabsAgentId = process.env.ELEVENLABS_AGENT_ID;
    if (!elevenLabsApiKey || !elevenLabsAgentId) {
        console.error("Missing ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID environment variables.");
        return NextResponse.json(
            { error: "Unable to start the interview. Please try again." },
            { status: 500 }
        );
    }

    const dynamicVariables = buildInterviewDynamicVariables({
        candidateName: convexUser.name || "Candidate",
        questions,
        jobTitle: interview.jobTitle,
        jobDescription: interview.jobDescription,
    });

    // Every call mints a fresh WebRTC conversation token - ElevenLabs has no
    // endpoint to re-mint a token for an existing conversation, so unlike the
    // paused Tavus flow there is nothing to reuse across a page refresh.
    try {
        const tokenRes = await fetch(
            `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${elevenLabsAgentId}`,
            { headers: { "xi-api-key": elevenLabsApiKey } }
        );

        if (!tokenRes.ok) {
            const errorBody = await tokenRes.text().catch(() => "");
            console.error("ElevenLabs conversation token request failed:", tokenRes.status, errorBody);
            return NextResponse.json(
                { error: "Unable to start the interview. Please try again." },
                { status: 500 }
            );
        }

        const tokenData = await tokenRes.json();
        const conversationToken = tokenData?.token as string | undefined;
        const conversationId = tokenData?.conversation_id as string | undefined;

        if (!conversationToken || !conversationId) {
            console.error("ElevenLabs token response missing token/conversation_id:", tokenData);
            return NextResponse.json(
                { error: "Unable to start the interview. Please try again." },
                { status: 500 }
            );
        }

        await convexClient.mutation(api.Interview.SaveElevenLabsConversation, {
            interviewId: interviewId as Id<"InterviewSessionTable">,
            userId: convexUser._id,
            elevenlabsConversationId: conversationId,
        });

        return NextResponse.json({
            connection: { conversationToken, dynamicVariables },
        });
    } catch (e) {
        console.error("Failed to start ElevenLabs conversation:", e);
        return NextResponse.json(
            { error: "Unable to start the interview. Please try again." },
            { status: 500 }
        );
    }
}
