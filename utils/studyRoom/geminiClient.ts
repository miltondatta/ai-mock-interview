import { GoogleGenAI } from "@google/genai";

// Direct LLM integration for the AI Study Room's lesson-summary feature
// only (M4). Mirrors utils/questionBank/geminiClient.ts exactly - its own
// isolated client/model config, reusing the same GEMINI_API_KEY as every
// other direct-Gemini feature in this app, but never imported by or
// importing from Question Bank/Study Planner's copies, keeping the modules
// independent per the module's own isolation rule.

let client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
    if (!client) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error(
                "GEMINI_API_KEY is not configured. Add it to your environment to generate Study Room lesson summaries."
            );
        }
        client = new GoogleGenAI({ apiKey });
    }
    return client;
}

// Overridable via env so the model can be upgraded without a code change.
export function getStudyRoomSummaryModel(): string {
    return process.env.GEMINI_STUDY_ROOM_MODEL || "gemini-2.5-flash";
}
