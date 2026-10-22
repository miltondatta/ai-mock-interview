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
import { addResumeToLibrary, getLibraryResume } from "@/utils/resumeLibrary";
import type { Id } from "@/convex/_generated/dataModel";

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
    const rawFile = formData.get("file");
    const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;
    // Pasted job posts drag along bullet glyphs, smart quotes/dashes, and
    // inconsistent line endings that can confuse the n8n prompt - normalize
    // before it's sent.
    const jobTitle = sanitizeFreeText((formData.get("jobTitle") as string | null) ?? "");
    const jobDescription = sanitizeFreeText((formData.get("jobDescription") as string | null) ?? "");
    // Set instead of `file` when the candidate picked a resume from their library.
    const savedResumeId = (formData.get("resumeId") as string | null) ?? "";
    // Either a resume, or a job title + description on their own, is enough to
    // generate a script.
    if (!file && !savedResumeId && (!jobTitle || !jobDescription)) {
        return NextResponse.json(
            { error: "Please upload your resume or add a job title and job description." },
            { status: 400 }
        );
    }
    const lang = (formData.get("lang") as string | null) || "en";
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

        // A new upload goes into the candidate's resume library (reusing the
        // existing entry if they've uploaded this exact file before); a resume
        // picked from the library is resolved server-side after an ownership check.
        let resumeUrl: string | undefined;
        let resumeId: Id<'ResumeTable'> | undefined;
        if (file) {
            const resume = await addResumeToLibrary(convexClient, convexUser._id, file);
            resumeUrl = resume.fileUrl;
            resumeId = resume.id;
        } else if (savedResumeId) {
            const resume = await getLibraryResume(convexClient, convexUser._id, savedResumeId);
            if (!resume) {
                return NextResponse.json({ error: "The selected resume could not be found." }, { status: 404 });
            }
            resumeUrl = resume.fileUrl;
            resumeId = resume.id;
        }

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
                // Omitted entirely (not sent as empty) for job-description-only requests.
                ...(resumeUrl ? { resumeUrl } : {}),
                job_title: jobTitle,
                job_description: jobDescription,
                practice_questions: practiceQuestions,
                lang,
                interviewType: "",
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
                        language: lang,
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
            resumeId,
            jobTitle,
            jobDescription,
            selectedQuestions,
            lang,
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
