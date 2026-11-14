import { Type } from "@google/genai";
import { getGeminiClient, getStudyRoomSummaryModel } from "./geminiClient";
import { SessionSummarySchema, type SessionSummary } from "./summarySchema";
import { buildSummaryPrompt, type SummaryGenerationContext } from "./summaryPromptBuilder";

const SUMMARY_RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        overview: { type: Type.STRING },
        topicsCovered: { type: Type.ARRAY, items: { type: Type.STRING } },
        keyConcepts: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: { term: { type: Type.STRING }, explanation: { type: Type.STRING } },
                required: ["term", "explanation"],
            },
        },
        definitions: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: { term: { type: Type.STRING }, definition: { type: Type.STRING } },
                required: ["term", "definition"],
            },
        },
        examples: { type: Type.ARRAY, items: { type: Type.STRING } },
        qaExchanges: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    tutorQuestion: { type: Type.STRING },
                    learnerResponse: { type: Type.STRING },
                },
                required: ["tutorQuestion", "learnerResponse"],
            },
        },
        understoodWell: { type: Type.ARRAY, items: { type: Type.STRING } },
        areasForImprovement: { type: Type.ARRAY, items: { type: Type.STRING } },
        misunderstandings: { type: Type.ARRAY, items: { type: Type.STRING } },
        revisionTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
        nextActivities: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: [
        "overview",
        "topicsCovered",
        "keyConcepts",
        "definitions",
        "examples",
        "qaExchanges",
        "understoodWell",
        "areasForImprovement",
        "misunderstandings",
        "revisionTopics",
        "nextActivities",
    ],
};

export interface GenerateSummaryResult {
    summary: SessionSummary;
    model: string;
    usageMetadata: unknown;
}

const MAX_ATTEMPTS = 2;

async function callGemini(ctx: SummaryGenerationContext): Promise<GenerateSummaryResult> {
    const ai = getGeminiClient();
    const model = getStudyRoomSummaryModel();
    const response = await ai.models.generateContent({
        model,
        contents: buildSummaryPrompt(ctx),
        config: {
            responseMimeType: "application/json",
            responseSchema: SUMMARY_RESPONSE_SCHEMA,
            temperature: 0.4,
        },
    });
    const text = response.text;
    if (!text) throw new Error("The AI provider returned an empty response.");
    const summary = SessionSummarySchema.parse(JSON.parse(text));
    return { summary, model, usageMetadata: response.usageMetadata };
}

// SummaryGeneratorService: on-demand lesson-summary generation for one
// completed/abandoned Study Room session (see app/api/study-room/summary/
// generate). Retries once on a thin/invalid response, mirroring
// questionAnswerer.ts's resilience.
export async function generateSessionSummary(ctx: SummaryGenerationContext): Promise<GenerateSummaryResult> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
            return await callGemini(ctx);
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError;
}
