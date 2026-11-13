import { z } from "zod";

export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];

export const PRIORITIES = ["low", "medium", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z.string().trim().regex(DATE_RE, "Expected a YYYY-MM-DD date.");

// Gemini is asked for lowercase enum values but is prompted in a way that
// could plausibly come back "Beginner"/"High" - normalize case before
// validating against the strict enum instead of rejecting a cosmetic mismatch.
function lenientEnum<T extends readonly [string, ...string[]]>(values: T) {
    return z.preprocess((val) => (typeof val === "string" ? val.trim().toLowerCase() : val), z.enum(values));
}

const levelSchema = lenientEnum(LEVELS);
const prioritySchema = lenientEnum(PRIORITIES);

export const GeneratedTaskSchema = z.object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(2000).optional().default(""),
    priority: prioritySchema,
    estimatedDuration: z.number().int().positive().max(480).optional().default(30),
    scheduledDate: dateSchema,
    completionCriteria: z.string().trim().max(500).optional().default(""),
});
export type GeneratedTask = z.infer<typeof GeneratedTaskSchema>;

export const GeneratedPhaseSchema = z.object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(1000).optional().default(""),
    order: z.number().int().nonnegative(),
    startDate: dateSchema,
    endDate: dateSchema,
    objectives: z.array(z.string().trim().min(1).max(300)).max(10).optional().default([]),
    tasks: z.array(GeneratedTaskSchema).min(1).max(30),
});
export type GeneratedPhase = z.infer<typeof GeneratedPhaseSchema>;

export const GeneratedMilestoneSchema = z.object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(1000).optional().default(""),
    targetDate: dateSchema,
    completionCriteria: z.string().trim().max(500).optional().default(""),
});
export type GeneratedMilestone = z.infer<typeof GeneratedMilestoneSchema>;

export const GeneratedStudyPlanSchema = z.object({
    title: z.string().trim().min(3).max(150),
    description: z.string().trim().max(2000).optional().default(""),
    learningGoal: z.string().trim().max(300).optional().default(""),
    currentLevel: levelSchema,
    targetLevel: levelSchema,
    startDate: dateSchema,
    targetEndDate: dateSchema,
    phases: z.array(GeneratedPhaseSchema).min(1).max(12),
    milestones: z.array(GeneratedMilestoneSchema).max(20).optional().default([]),
});
export type GeneratedStudyPlan = z.infer<typeof GeneratedStudyPlanSchema>;
