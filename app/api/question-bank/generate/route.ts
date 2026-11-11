import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { sanitizeCandidateText } from "@/utils/sanitizeText";
import { generateQuestions } from "@/utils/questionBank/questionGenerator";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Direct Gemini calls (question generation, with up to two top-up calls) -
// much faster than the n8n-backed routes, but still generous against cold
// starts / provider latency.
export const maxDuration = 120;

const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 20;
const MAX_TOPIC_LENGTH = 100;
const MAX_TOPICS = 8;
const MAX_JOB_TITLE_LENGTH = 200;
const MAX_JOB_DESCRIPTION_LENGTH = 10000;
const SUPPORTED_LANGUAGES = new Set(["en", "bn"]);

function badRequest(error: string) {
    return NextResponse.json({ error }, { status: 400 });
}

export async function POST(req: NextRequest) {
    const user = await currentUser();
    if (!user) {
        return NextResponse.json({ error: "You must be logged in to generate questions." }, { status: 401 });
    }
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const convexUser = await convexClient.query(api.users.GetUserByEmail, { email });
    if (!convexUser) {
        return NextResponse.json({ error: "You must be logged in to generate questions." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return badRequest("Invalid request.");

    const mode = body.mode === "job" ? "job" : "skill";
    let language = typeof body.language === "string" && SUPPORTED_LANGUAGES.has(body.language) ? body.language : null;
    if (!language) {
        // Falls back to the candidate's Feedback Language setting, same as the
        // Resume Match Analyzer - this module has no language picker of its own.
        const settings = await convexClient.query(api.UserSettings.GetUserSettings, { userId: convexUser._id });
        const settingsLang = settings?.feedbackLanguage;
        language = settingsLang && SUPPORTED_LANGUAGES.has(settingsLang) ? settingsLang : "en";
    }

    const rawTopics: unknown[] = Array.isArray(body.topics) ? body.topics : [];
    const topics = rawTopics
        .map((t) => sanitizeCandidateText(t, { singleLine: true, maxLength: MAX_TOPIC_LENGTH }))
        .filter((t) => t.length > 0)
        .slice(0, MAX_TOPICS);

    const jobTitle = sanitizeCandidateText(body.jobTitle, { singleLine: true, maxLength: MAX_JOB_TITLE_LENGTH });
    const jobDescription = sanitizeCandidateText(body.jobDescription, { maxLength: MAX_JOB_DESCRIPTION_LENGTH });

    if (mode === "skill" && topics.length === 0) {
        return badRequest("Please add at least one topic.");
    }
    if (mode === "job" && !jobTitle) {
        return badRequest("Please enter a job title.");
    }

    const requestedTotal = Number.parseInt(body.totalQuestions, 10);
    const totalQuestions = Number.isFinite(requestedTotal)
        ? Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, requestedTotal))
        : 9;

    const rateLimit = await convexClient.mutation(api.rateLimit.consumeQuestionBankGenerate, {
        userId: convexUser._id,
    });
    if (!rateLimit.ok) {
        return NextResponse.json(
            { error: "You've reached today's question generation limit. Please try again later." },
            { status: 429 }
        );
    }

    try {
        const result = await generateQuestions({
            context: {
                mode,
                topics: mode === "skill" ? topics : [jobTitle],
                jobTitle: mode === "job" ? jobTitle : undefined,
                jobDescription: mode === "job" ? jobDescription : undefined,
                language,
            },
            totalQuestions,
        });

        const title = mode === "job" ? jobTitle : topics.join(", ");

        const collectionId = await convexClient.mutation(api.QuestionBank.SaveGeneratedCollection, {
            userId: convexUser._id,
            title,
            generationMode: mode,
            topics: mode === "skill" ? topics : [jobTitle],
            jobTitle: mode === "job" ? jobTitle : undefined,
            jobDescription: mode === "job" && jobDescription ? jobDescription : undefined,
            language,
            questions: result.questions,
        });

        await convexClient.mutation(api.QuestionBank.LogGeneration, {
            userId: convexUser._id,
            collectionId,
            kind: "questions",
            model: result.model,
            usageMetadata: result.usageMetadata,
            generationStatus: "success",
        });

        return NextResponse.json({ collectionId });
    } catch (e) {
        console.error("Question Bank generation failed:", e);
        await convexClient.mutation(api.QuestionBank.LogGeneration, {
            userId: convexUser._id,
            kind: "questions",
            model: process.env.GEMINI_QUESTION_BANK_MODEL || "gemini-2.5-flash",
            generationStatus: "failed",
            error: e instanceof Error ? e.message : "Unknown error",
        });
        return NextResponse.json(
            { error: "Unable to generate questions right now. Please try again." },
            { status: 502 }
        );
    }
}
