import { Type } from "@google/genai";
import { getGeminiClient, getQuestionBankModel } from "./geminiClient";
import { GeneratedQuestionsResponseSchema, type GeneratedQuestion } from "./schemas";
import { buildQuestionGenerationPrompt, type QuestionGenerationContext } from "./promptBuilder";
import { computeDifficultyCounts, type DifficultyCounts, type DifficultyRatios } from "./difficultyDistribution";
import { countByDifficulty, dedupeQuestions, missingByDifficulty, trimToCounts } from "./questionValidator";

const QUESTIONS_RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        questions: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    question: { type: Type.STRING },
                    difficulty: { type: Type.STRING, enum: ["beginner", "intermediate", "advanced"] },
                },
                required: ["question", "difficulty"],
            },
        },
    },
    required: ["questions"],
};

async function callGemini(prompt: string): Promise<{ questions: GeneratedQuestion[]; usageMetadata: unknown }> {
    const ai = getGeminiClient();
    const model = getQuestionBankModel();
    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: QUESTIONS_RESPONSE_SCHEMA,
            temperature: 0.9,
        },
    });
    const text = response.text;
    if (!text) throw new Error("The AI provider returned an empty response.");
    const parsed = GeneratedQuestionsResponseSchema.parse(JSON.parse(text));
    return { questions: parsed.questions, usageMetadata: response.usageMetadata };
}

export interface GenerateQuestionsParams {
    context: QuestionGenerationContext;
    totalQuestions: number;
    difficultyRatios?: DifficultyRatios;
}

export interface GenerateQuestionsResult {
    questions: GeneratedQuestion[];
    requestedCounts: DifficultyCounts;
    model: string;
    usageMetadata: unknown;
}

// QuestionGeneratorService: generates the requested count/distribution,
// topping up any difficulty Gemini under-delivered on with a focused
// follow-up call (at most twice) instead of silently returning fewer
// questions than asked for.
export async function generateQuestions(params: GenerateQuestionsParams): Promise<GenerateQuestionsResult> {
    const requestedCounts = computeDifficultyCounts(params.totalQuestions, params.difficultyRatios);
    const prompt = buildQuestionGenerationPrompt(params.context, requestedCounts);

    let usageMetadata: unknown;
    const { questions: first, usageMetadata: firstUsage } = await callGemini(prompt);
    usageMetadata = firstUsage;
    let pool = dedupeQuestions(first);

    for (let attempt = 0; attempt < 2; attempt++) {
        const have = countByDifficulty(pool);
        const missing = missingByDifficulty(have, requestedCounts);
        const stillMissing = missing.beginner + missing.intermediate + missing.advanced;
        if (stillMissing === 0) break;

        const topUpPrompt = [
            buildQuestionGenerationPrompt(params.context, missing),
            "",
            "Do not repeat any of these already-used questions:",
            ...pool.map((q) => `- ${q.question}`),
        ].join("\n");
        const { questions: more, usageMetadata: moreUsage } = await callGemini(topUpPrompt);
        usageMetadata = moreUsage;
        pool = dedupeQuestions([...pool, ...more]);
    }

    const finalCounts = countByDifficulty(pool);
    const stillMissing =
        Math.max(0, requestedCounts.beginner - finalCounts.beginner) +
        Math.max(0, requestedCounts.intermediate - finalCounts.intermediate) +
        Math.max(0, requestedCounts.advanced - finalCounts.advanced);
    if (stillMissing > 0) {
        throw new Error(
            `The AI could only generate ${pool.length - stillMissing} of the ${params.totalQuestions} requested questions. Please try again.`
        );
    }

    const questions = trimToCounts(pool, requestedCounts);
    return { questions, requestedCounts, model: getQuestionBankModel(), usageMetadata };
}
