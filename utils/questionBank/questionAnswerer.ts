import { getGeminiClient, getQuestionBankModel } from "./geminiClient";
import { GeneratedAnswerSchema } from "./schemas";
import { buildAnswerGenerationPrompt, type AnswerGenerationContext } from "./promptBuilder";

export interface GenerateAnswerResult {
    markdown: string;
    model: string;
    usageMetadata: unknown;
}

// Strips a leading/trailing ```markdown fence if the model wrapped the whole
// answer in one despite being asked not to.
function stripWholeAnswerFence(text: string): string {
    const match = text.trim().match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);
    return match ? match[1] : text.trim();
}

const MAX_ATTEMPTS = 2;

async function callGemini(ctx: AnswerGenerationContext): Promise<GenerateAnswerResult> {
    const ai = getGeminiClient();
    const model = getQuestionBankModel();
    const response = await ai.models.generateContent({
        model,
        contents: buildAnswerGenerationPrompt(ctx),
        config: {
            temperature: 0.7,
        },
    });
    const text = response.text;
    if (!text) throw new Error("The AI provider returned an empty response.");
    const markdown = GeneratedAnswerSchema.parse(stripWholeAnswerFence(text));
    return { markdown, model, usageMetadata: response.usageMetadata };
}

// QuestionAnswerService: on-demand detailed-answer generation for one
// question. Called only when no cached answer exists yet (see
// convex/QuestionBank.ts GetAnswer / BeginAnswerGeneration). Retries once on
// a thin/invalid response (safety refusal, truncation) before giving up,
// mirroring the top-up resilience in questionGenerator.ts.
export async function generateAnswer(ctx: AnswerGenerationContext): Promise<GenerateAnswerResult> {
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
