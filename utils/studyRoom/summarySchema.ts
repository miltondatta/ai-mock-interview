import { z } from "zod";

// What Gemini is asked to return for a Study Room session summary (M4).
// Every array may legitimately be empty - the prompt (see
// summaryPromptBuilder.ts) explicitly tells the model to return an empty
// array rather than invent content for a category the transcript doesn't
// support, which is what "do not invent learner performance" and "generate
// only when sufficient information is available" require at the data
// level, not just in UI copy.

export const QaExchangeSchema = z.object({
    tutorQuestion: z.string().trim().min(1).max(500),
    learnerResponse: z.string().trim().min(1).max(1000),
});

export const KeyConceptSchema = z.object({
    term: z.string().trim().min(1).max(200),
    explanation: z.string().trim().min(1).max(600),
});

export const DefinitionSchema = z.object({
    term: z.string().trim().min(1).max(200),
    definition: z.string().trim().min(1).max(600),
});

export const SessionSummarySchema = z.object({
    // A short (2-4 sentence) plain-language overview of what happened in
    // the session - the one freeform field; everything else below is
    // structured so the UI can label "observed" vs "AI-assessed" sections
    // distinctly.
    overview: z.string().trim().min(1).max(1200),
    topicsCovered: z.array(z.string().trim().min(1).max(200)).max(20),
    keyConcepts: z.array(KeyConceptSchema).max(20),
    definitions: z.array(DefinitionSchema).max(20),
    examples: z.array(z.string().trim().min(1).max(600)).max(20),
    // Directly from the transcript - questions the Tutor actually asked,
    // paired with what the learner actually said in response. Never
    // summarized/reworded into a judgment call; that's what the fields
    // below are for.
    qaExchanges: z.array(QaExchangeSchema).max(20),
    understoodWell: z.array(z.string().trim().min(1).max(300)).max(15),
    areasForImprovement: z.array(z.string().trim().min(1).max(300)).max(15),
    misunderstandings: z.array(z.string().trim().min(1).max(300)).max(15),
    revisionTopics: z.array(z.string().trim().min(1).max(200)).max(15),
    nextActivities: z.array(z.string().trim().min(1).max(300)).max(15),
});

export type SessionSummary = z.infer<typeof SessionSummarySchema>;
