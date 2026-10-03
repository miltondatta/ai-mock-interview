import { NextRequest, NextResponse } from "next/server";
import ImageKit from "imagekit";
import axios from "axios";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import {
    extractPracticeScriptNarration,
    extractPracticeScriptSegments,
    generatePracticeCoachAudio,
    QuestionTimelineEntry,
} from "@/utils/practiceCoachAudio";
import { sanitizeFreeText } from "@/utils/sanitizeText";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Video generation via N8N can take a while - match the raised proxy timeout
// used by the other N8N-backed routes.
export const maxDuration = 300;

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

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
        return NextResponse.json({ error: "Please upload your resume first." }, { status: 400 });
    }
    // Pasted job posts drag along bullet glyphs, smart quotes/dashes, and
    // inconsistent line endings that can confuse the n8n prompt - normalize
    // before it's sent.
    const jobTitle = sanitizeFreeText((formData.get("jobTitle") as string | null) ?? "");
    const jobDescription = sanitizeFreeText((formData.get("jobDescription") as string | null) ?? "");
    const selectedQuestionsRaw = (formData.get("selectedQuestions") as string | null) ?? "[]";
    let selectedQuestions: string[] = [];
    try {
        const parsed = JSON.parse(selectedQuestionsRaw);
        if (Array.isArray(parsed)) selectedQuestions = parsed.filter((q): q is string => typeof q === "string");
    } catch {
        // Malformed payload - treat as no questions selected rather than failing the request.
    }

    try {
        const imagekit = new ImageKit({
            publicKey: process.env.IMAGEKIT_URL_PUBLIC_KEY as string,
            privateKey: process.env.IMAGEKIT_URL_PRIVATE_KEY as string,
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT as string,
        });

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const uploadedFile = await imagekit.upload({
            file: buffer,
            fileName: Date.now().toString() + ".pdf",
            isPublished: true,
        });
        const resumeUrl = uploadedFile?.url;

        // N8N expects practice_questions as an object keyed "1", "2", ... rather
        // than an array, and the count varies with how many the user picked.
        const practiceQuestions = selectedQuestions.reduce<Record<string, string>>(
            (acc, question, index) => {
                acc[String(index + 1)] = question;
                return acc;
            },
            {}
        );

        const webhookRes = await axios.post(
            "https://n8n.vistechsolutions.online/webhook/practice_coach",
            {
                resumeUrl,
                job_title: jobTitle,
                job_description: jobDescription,
                practice_questions: practiceQuestions,
            },
            { timeout: 280000 }
        );

        // Narrate the generated script into an audio file via the ElevenLabs voice
        // agent. Best-effort: if this fails, the script itself still saves below -
        // a TTS hiccup shouldn't take down the whole generation request.
        let audioUrl: string | undefined;
        let questionTimeline: QuestionTimelineEntry[] | undefined;
        const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
        const elevenLabsAgentId = process.env.ELEVENLABS_PRACTICE_COACH_AGENT_ID;
        if (elevenLabsApiKey && elevenLabsAgentId) {
            try {
                const segments = extractPracticeScriptSegments(webhookRes.data);
                const narrationText = extractPracticeScriptNarration(webhookRes.data);
                if (narrationText) {
                    const { audio, questionTimeline: timeline } = await generatePracticeCoachAudio({
                        apiKey: elevenLabsApiKey,
                        agentId: elevenLabsAgentId,
                        narrationText,
                        segments,
                        candidateName: convexUser.name || "Candidate",
                    });
                    const uploadedAudio = await imagekit.upload({
                        file: audio,
                        fileName: Date.now().toString() + ".mp3",
                        isPublished: true,
                    });
                    audioUrl = uploadedAudio?.url;
                    questionTimeline = timeline;
                }
            } catch (e) {
                console.error("Failed to generate Practice Coach audio:", e);
            }
        } else {
            console.error(
                "Missing ELEVENLABS_API_KEY or ELEVENLABS_PRACTICE_COACH_AGENT_ID environment variables."
            );
        }

        await convexClient.mutation(api.PracticeCoach.SavePracticeCoachGeneration, {
            userId: convexUser._id,
            resumeUrl,
            jobTitle,
            jobDescription,
            selectedQuestions,
            questionTimeline,
            webhookResponse: webhookRes.data,
            audioUrl,
        });

        return NextResponse.json({ resumeUrl, result: webhookRes.data, audioUrl });
    } catch (e) {
        console.error("Failed to generate practice video:", e);
        return NextResponse.json(
            { error: "Unable to generate the practice video. Please try again." },
            { status: 500 }
        );
    }
}
