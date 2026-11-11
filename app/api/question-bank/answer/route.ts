import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { generateAnswer } from "@/utils/questionBank/questionAnswerer";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export const maxDuration = 60;

export async function POST(req: NextRequest) {
    const user = await currentUser();
    if (!user) {
        return NextResponse.json({ error: "You must be logged in to view answers." }, { status: 401 });
    }
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const convexUser = await convexClient.query(api.users.GetUserByEmail, { email });
    if (!convexUser) {
        return NextResponse.json({ error: "You must be logged in to view answers." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const questionId = typeof body?.questionId === "string" ? (body.questionId as Id<"questionBankQuestions">) : null;
    if (!questionId) {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const found = await convexClient.query(api.QuestionBank.GetQuestionWithCollection, { questionId });
    if (!found) {
        return NextResponse.json({ error: "Question not found." }, { status: 404 });
    }
    const { question, collection } = found;
    const isOwner = collection.userId === convexUser._id;
    if (!isOwner && !collection.isShared) {
        return NextResponse.json({ error: "You don't have access to this question." }, { status: 403 });
    }

    // Already generated - return the cached answer without touching the LLM
    // or the rate limiter (retrieving a cached answer is free).
    const existing = await convexClient.query(api.QuestionBank.GetAnswer, { questionId });
    if (existing) {
        return NextResponse.json({ answer: existing.structuredAnswer });
    }

    const rateLimit = await convexClient.mutation(api.rateLimit.consumeQuestionBankAnswer, {
        userId: convexUser._id,
    });
    if (!rateLimit.ok) {
        return NextResponse.json(
            { error: "You've reached today's answer generation limit. Please try again later." },
            { status: 429 }
        );
    }

    const lock = await convexClient.mutation(api.QuestionBank.BeginAnswerGeneration, { questionId });
    if (!lock.ok) {
        if (lock.status === "ready") {
            const ready = await convexClient.query(api.QuestionBank.GetAnswer, { questionId });
            if (ready) return NextResponse.json({ answer: ready.structuredAnswer });
        }
        return NextResponse.json(
            { error: "This answer is already being generated. Please wait a moment and try again." },
            { status: 409 }
        );
    }

    try {
        const subject =
            collection.generationMode === "job"
                ? collection.jobTitle || collection.topics.join(", ")
                : collection.topics.join(", ");

        const result = await generateAnswer({
            question: question.question,
            difficulty: question.difficulty,
            subject,
            language: collection.language,
        });

        await convexClient.mutation(api.QuestionBank.SaveAnswer, {
            questionId,
            collectionId: collection._id,
            structuredAnswer: result.markdown,
            modelMetadata: result.usageMetadata,
        });
        await convexClient.mutation(api.QuestionBank.LogGeneration, {
            userId: convexUser._id,
            collectionId: collection._id,
            questionId,
            kind: "answer",
            model: result.model,
            usageMetadata: result.usageMetadata,
            generationStatus: "success",
        });

        return NextResponse.json({ answer: result.markdown });
    } catch (e) {
        console.error("Question Bank answer generation failed:", e);
        await convexClient.mutation(api.QuestionBank.MarkAnswerFailed, { questionId });
        await convexClient.mutation(api.QuestionBank.LogGeneration, {
            userId: convexUser._id,
            collectionId: collection._id,
            questionId,
            kind: "answer",
            model: process.env.GEMINI_QUESTION_BANK_MODEL || "gemini-2.5-flash",
            generationStatus: "failed",
            error: e instanceof Error ? e.message : "Unknown error",
        });
        return NextResponse.json({ error: "Unable to generate this answer right now. Please try again." }, { status: 502 });
    }
}
