import { NextRequest, NextResponse } from "next/server";
import ImageKit from "imagekit";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { extractPracticeScriptNarration, generatePracticeCoachAudio } from "@/utils/practiceCoachAudio";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Backfills audio for a Practice Coach script that was saved before audio
// generation existed (or whose audio generation failed the first time), so
// the candidate can still play it without generating a brand new script.
export const maxDuration = 120;

export async function POST(req: NextRequest) {
    const user = await currentUser();
    if (!user) {
        return NextResponse.json(
            { error: "You must be logged in to use Practice Coach." },
            { status: 401 }
        );
    }

    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const convexUser = await convexClient.query(api.users.GetUserByEmail, { email });
    if (!convexUser) {
        return NextResponse.json(
            { error: "You must be logged in to use Practice Coach." },
            { status: 401 }
        );
    }

    const body = await req.json().catch(() => null);
    const practiceCoachId = body?.practiceCoachId as string | undefined;
    if (!practiceCoachId) {
        return NextResponse.json({ error: "Missing practiceCoachId." }, { status: 400 });
    }

    const generation = await convexClient.query(api.PracticeCoach.GetPracticeCoachGenerationForUser, {
        id: practiceCoachId as Id<"PracticeCoachTable">,
        userId: convexUser._id,
    });
    if (!generation) {
        return NextResponse.json({ error: "Practice script not found." }, { status: 404 });
    }
    if (generation.audioUrl) {
        return NextResponse.json({ audioUrl: generation.audioUrl });
    }

    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    const elevenLabsAgentId = process.env.ELEVENLABS_PRACTICE_COACH_AGENT_ID;
    if (!elevenLabsApiKey || !elevenLabsAgentId) {
        console.error("Missing ELEVENLABS_API_KEY or ELEVENLABS_PRACTICE_COACH_AGENT_ID environment variables.");
        return NextResponse.json(
            { error: "Unable to generate audio. Please try again." },
            { status: 500 }
        );
    }

    const narrationText = extractPracticeScriptNarration(generation.webhookResponse);
    if (!narrationText) {
        return NextResponse.json(
            { error: "This practice script has no readable content to narrate." },
            { status: 400 }
        );
    }

    try {
        const audioBuffer = await generatePracticeCoachAudio({
            apiKey: elevenLabsApiKey,
            agentId: elevenLabsAgentId,
            narrationText,
        });

        const imagekit = new ImageKit({
            publicKey: process.env.IMAGEKIT_URL_PUBLIC_KEY as string,
            privateKey: process.env.IMAGEKIT_URL_PRIVATE_KEY as string,
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT as string,
        });
        const uploadedAudio = await imagekit.upload({
            file: audioBuffer,
            fileName: Date.now().toString() + ".mp3",
            isPublished: true,
        });
        const audioUrl = uploadedAudio?.url;
        if (!audioUrl) {
            throw new Error("ImageKit upload did not return a URL.");
        }

        await convexClient.mutation(api.PracticeCoach.SetPracticeCoachAudioUrl, {
            id: practiceCoachId as Id<"PracticeCoachTable">,
            audioUrl,
        });

        return NextResponse.json({ audioUrl });
    } catch (e) {
        console.error("Failed to generate Practice Coach audio on demand:", e);
        return NextResponse.json(
            { error: "Unable to generate audio. Please try again." },
            { status: 500 }
        );
    }
}
