import type { GeneratedQuestion } from "./schemas";
import type { DifficultyCounts } from "./difficultyDistribution";

// QuestionValidatorService: pure helpers that enforce question-count and
// difficulty-distribution guarantees the prompt alone can't be trusted for.

export function normalizeQuestionText(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[?.!]+$/, "");
}

export function dedupeQuestions(questions: GeneratedQuestion[]): GeneratedQuestion[] {
    const seen = new Set<string>();
    const result: GeneratedQuestion[] = [];
    for (const q of questions) {
        const key = normalizeQuestionText(q.question);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(q);
    }
    return result;
}

export function countByDifficulty(questions: GeneratedQuestion[]): DifficultyCounts {
    return {
        beginner: questions.filter((q) => q.difficulty === "beginner").length,
        intermediate: questions.filter((q) => q.difficulty === "intermediate").length,
        advanced: questions.filter((q) => q.difficulty === "advanced").length,
    };
}

// What's still missing per difficulty vs. the requested counts (never negative).
export function missingByDifficulty(have: DifficultyCounts, want: DifficultyCounts): DifficultyCounts {
    return {
        beginner: Math.max(0, want.beginner - have.beginner),
        intermediate: Math.max(0, want.intermediate - have.intermediate),
        advanced: Math.max(0, want.advanced - have.advanced),
    };
}

// Trims an overshoot down to the exact requested count per difficulty,
// preserving generation order within each level.
export function trimToCounts(questions: GeneratedQuestion[], counts: DifficultyCounts): GeneratedQuestion[] {
    const remaining = { ...counts };
    const result: GeneratedQuestion[] = [];
    for (const q of questions) {
        if (remaining[q.difficulty] > 0) {
            result.push(q);
            remaining[q.difficulty] -= 1;
        }
    }
    return result;
}
