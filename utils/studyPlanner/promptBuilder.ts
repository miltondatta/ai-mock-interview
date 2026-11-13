import type { Level } from "./schemas";

export interface StudyPlanGenerationContext {
    subject: string;
    learningGoal?: string;
    additionalInstructions?: string;
    currentLevel: Level;
    targetLevel: Level;
    startDate: string;
    targetEndDate: string;
    availableHoursPerDay: number;
    preferredStudyDays: string[];
    learningPreferences: string[];
}

function daysBetween(startIso: string, endIso: string): number {
    const start = new Date(`${startIso}T00:00:00Z`).getTime();
    const end = new Date(`${endIso}T00:00:00Z`).getTime();
    return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

export function buildStudyPlanGenerationPrompt(ctx: StudyPlanGenerationContext): string {
    const totalDays = daysBetween(ctx.startDate, ctx.targetEndDate);
    const studyDaysLabel = ctx.preferredStudyDays.length > 0 ? ctx.preferredStudyDays.join(", ") : "any day";
    const preferencesLabel = ctx.learningPreferences.length > 0 ? ctx.learningPreferences.join(", ") : "no specific preference";

    return [
        "You are an expert curriculum designer creating a personalized, realistic study plan for a self-directed learner using a career-development product.",
        `Subject / topic: ${ctx.subject}`,
        ctx.learningGoal ? `Learning goal: ${ctx.learningGoal}` : "",
        `Current knowledge level: ${ctx.currentLevel}`,
        `Target knowledge level: ${ctx.targetLevel}`,
        `Study period: ${ctx.startDate} to ${ctx.targetEndDate} (${totalDays} days total).`,
        `Available study time: up to ${ctx.availableHoursPerDay} hour(s) per day, only on: ${studyDaysLabel}.`,
        `Preferred learning style: ${preferencesLabel}.`,
        ctx.additionalInstructions ? `Additional instructions from the learner: ${ctx.additionalInstructions}` : "",
        "",
        "Design a structured learning roadmap broken into logical phases (modules), each phase containing concrete, actionable study tasks, plus a handful of milestones that mark real progress.",
        "Hard requirements:",
        `- Every date you return (phase startDate/endDate, task scheduledDate, milestone targetDate) MUST fall between ${ctx.startDate} and ${ctx.targetEndDate} inclusive. Never return a date outside this range.`,
        `- A task's estimatedDuration is in minutes. The sum of estimatedDuration for tasks scheduled on any single date must not exceed ${Math.round(ctx.availableHoursPerDay * 60)} minutes.`,
        `- Only schedule tasks on these days of the week: ${studyDaysLabel === "any day" ? "any day of the week" : studyDaysLabel}.`,
        "- Every task must be unique - no duplicate or near-duplicate tasks across the whole plan.",
        "- Phases must be sequential and non-overlapping, covering the full study period in order.",
        "- Mix learning activities across tasks where it fits the subject: concept learning, hands-on/practical exercises, revision, self-assessment or practice assignments - not just reading.",
        "- Keep the plan realistic for the stated availability - do not pack in more than the learner can actually do.",
        "- Use exactly these lowercase values for priority: \"low\", \"medium\", or \"high\". Use exactly these lowercase values for currentLevel/targetLevel: \"beginner\", \"intermediate\", or \"advanced\".",
        "Return ONLY the structured JSON result - no commentary, no markdown fences.",
    ]
        .filter(Boolean)
        .join("\n");
}
