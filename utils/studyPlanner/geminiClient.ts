import { GoogleGenAI } from "@google/genai";

// Direct LLM integration for the Study Planner module only - independent of
// every other AI feature in this app (Create Interview, Practice Coach,
// Resume Match Analyzer go through n8n; Question Bank has its own isolated
// client in utils/questionBank/geminiClient.ts). Deliberately not shared
// with Question Bank so Study Planner never depends on it, even though both
// happen to use the same provider and API key.

let client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
    if (!client) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error(
                "GEMINI_API_KEY is not configured. Add it to your environment to use AI Study Plan generation."
            );
        }
        client = new GoogleGenAI({ apiKey });
    }
    return client;
}

// Overridable via env, independently of Question Bank's model choice, so the
// two modules can be upgraded on separate schedules.
export function getStudyPlannerModel(): string {
    return process.env.GEMINI_STUDY_PLANNER_MODEL || "gemini-2.5-flash";
}
