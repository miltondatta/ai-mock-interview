import type { Difficulty } from "./schemas";
import type { DifficultyCounts } from "./difficultyDistribution";

export interface QuestionGenerationContext {
    mode: "skill" | "job";
    topics: string[];
    jobTitle?: string;
    jobDescription?: string;
    language: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
    en: "English",
    bn: "Bengali",
};

function languageInstruction(language: string): string {
    const name = LANGUAGE_NAMES[language] || language;
    return `Write every question and answer in ${name}.`;
}

function subjectDescription(ctx: QuestionGenerationContext): string {
    if (ctx.mode === "job") {
        const parts = [`the job role "${ctx.jobTitle || ctx.topics.join(", ")}"`];
        if (ctx.jobDescription) {
            parts.push(`with this job description for context:\n"""\n${ctx.jobDescription}\n"""`);
        }
        return parts.join(" ");
    }
    return `the following skill(s)/topic(s): ${ctx.topics.join(", ")}`;
}

// QuestionPromptBuilder: question-generation call. Asks for a specific count
// per difficulty so the backend can validate the exact distribution rather
// than trusting the model to self-balance.
export function buildQuestionGenerationPrompt(
    ctx: QuestionGenerationContext,
    counts: DifficultyCounts
): string {
    const requestedTotal = counts.beginner + counts.intermediate + counts.advanced;
    return [
        "You are an expert interview and professional-knowledge question writer for a career-preparation product.",
        `Generate exactly ${requestedTotal} professional knowledge questions about ${subjectDescription(ctx)}.`,
        "These are knowledge/interview questions for a candidate to study - NOT a multiple-choice exam. Never include answer options.",
        "Requirements:",
        `- Exactly ${counts.beginner} questions must have difficulty "beginner".`,
        `- Exactly ${counts.intermediate} questions must have difficulty "intermediate".`,
        `- Exactly ${counts.advanced} questions must have difficulty "advanced".`,
        "- Every question must be unique and cover a different aspect of the subject (no near-duplicates, no rephrasing of the same question).",
        "- Questions must be concrete, professionally written, and specific to the subject - not generic filler.",
        "- Beginner questions test foundational definitions and concepts.",
        "- Intermediate questions test applied, scenario-based understanding.",
        "- Advanced questions test strategic, edge-case, or systems-level judgment.",
        languageInstruction(ctx.language),
        "Return ONLY the structured JSON result - no commentary.",
    ].join("\n");
}

export interface AnswerGenerationContext {
    question: string;
    difficulty: Difficulty;
    subject: string;
    language: string;
}

// QuestionPromptBuilder: on-demand detailed-answer call for one expanded
// question. Free-form markdown - the model picks whichever structure (table,
// steps, code sample) best fits this specific question.
export function buildAnswerGenerationPrompt(ctx: AnswerGenerationContext): string {
    return [
        "You are an expert technical writer producing an in-depth knowledge-base answer for a career-preparation product.",
        `Subject area: ${ctx.subject}`,
        `Question (${ctx.difficulty} difficulty): "${ctx.question}"`,
        "Write a comprehensive, educational answer formatted as GitHub-Flavored Markdown.",
        "Structure the answer however best fits this specific question - you do not need to use every element below, only what genuinely helps:",
        "- A short introductory paragraph.",
        "- Section headings (##/###) for distinct sub-topics, where the answer is long enough to need them.",
        "- Bullet lists and/or numbered steps where they aid clarity.",
        "- A markdown comparison table when comparing multiple concepts, options, or categories.",
        "- A concrete, realistic practical example or real-world scenario.",
        "- Short fenced code blocks ONLY for genuinely technical questions where code clarifies the answer - never force code into a non-technical (e.g. management/behavioral) answer.",
        "- A closing 'Key Takeaways' bullet list.",
        "Do not include an MCQ, answer options, or a correctness verdict - this is a knowledge answer, not an exam grading.",
        languageInstruction(ctx.language),
        "Return ONLY the markdown answer text - no JSON wrapper, no preamble like \"Here is the answer\".",
    ].join("\n");
}
