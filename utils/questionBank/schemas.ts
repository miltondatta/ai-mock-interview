import { z } from "zod";

export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const GeneratedQuestionSchema = z.object({
    question: z.string().trim().min(8).max(500),
    difficulty: z.enum(DIFFICULTIES),
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;

// What Gemini is asked to return for a question-generation call.
export const GeneratedQuestionsResponseSchema = z.object({
    questions: z.array(GeneratedQuestionSchema),
});

// A detailed answer is free-form GFM markdown - validated for sanity
// (non-empty, not absurdly short/long) rather than a rigid structure, since
// the best structure differs per question (table vs. steps vs. code sample).
export const GeneratedAnswerSchema = z
    .string()
    .trim()
    .min(40, "The generated answer was too short.")
    .max(20000, "The generated answer was too long.");
