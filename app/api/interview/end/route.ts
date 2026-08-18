import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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

    await convexClient.mutation(api.Interview.CompleteInterview, {
        interviewId: interviewId as Id<"InterviewSessionTable">,
        userId: convexUser._id,
    });

    return NextResponse.json({ status: "completed" });
}
