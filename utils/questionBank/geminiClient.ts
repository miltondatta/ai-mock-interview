import { GoogleGenAI } from "@google/genai";

// Direct LLM integration for the Question Bank module only - every other AI
// feature in this app (Create Interview, Practice Coach, Resume Match
// Analyzer) goes through n8n instead, so this is intentionally a separate,
// isolated client rather than something shared with those flows.

let client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
    if (!client) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error(
                "GEMINI_API_KEY is not configured. Add it to your environment to use the AI Question Bank."
            );
        }
        client = new GoogleGenAI({ apiKey });
    }
    return client;
}

// Overridable via env so the model can be upgraded without a code change.
export function getQuestionBankModel(): string {
    return process.env.GEMINI_QUESTION_BANK_MODEL || "gemini-2.5-flash";
}
