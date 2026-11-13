import { Type } from "@google/genai";
import { getGeminiClient, getStudyPlannerModel } from "./geminiClient";
import { GeneratedStudyPlanSchema, type GeneratedStudyPlan } from "./schemas";
import { buildStudyPlanGenerationPrompt, type StudyPlanGenerationContext } from "./promptBuilder";

const STUDY_PLAN_RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        learningGoal: { type: Type.STRING },
        currentLevel: { type: Type.STRING, enum: ["beginner", "intermediate", "advanced"] },
        targetLevel: { type: Type.STRING, enum: ["beginner", "intermediate", "advanced"] },
        startDate: { type: Type.STRING },
        targetEndDate: { type: Type.STRING },
        phases: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    order: { type: Type.NUMBER },
                    startDate: { type: Type.STRING },
                    endDate: { type: Type.STRING },
                    objectives: { type: Type.ARRAY, items: { type: Type.STRING } },
                    tasks: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                title: { type: Type.STRING },
                                description: { type: Type.STRING },
                                priority: { type: Type.STRING, enum: ["low", "medium", "high"] },
                                estimatedDuration: { type: Type.NUMBER },
                                scheduledDate: { type: Type.STRING },
                                completionCriteria: { type: Type.STRING },
                            },
                            required: ["title", "priority", "scheduledDate"],
                        },
                    },
                },
                required: ["title", "order", "startDate", "endDate", "tasks"],
            },
        },
        milestones: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    targetDate: { type: Type.STRING },
                    completionCriteria: { type: Type.STRING },
                },
                required: ["title", "targetDate"],
            },
        },
    },
    required: ["title", "currentLevel", "targetLevel", "startDate", "targetEndDate", "phases"],
};

export interface GenerateStudyPlanResult {
    plan: GeneratedStudyPlan;
    model: string;
    usageMetadata: unknown;
}

// Every date the model returned must fall within the requested study period -
// the prompt asks for this, but LLM output is never trusted on its own.
function assertDatesWithinRange(plan: GeneratedStudyPlan): void {
    const { startDate, targetEndDate } = plan;
    const outOfRange = (date: string) => date < startDate || date > targetEndDate;

    for (const phase of plan.phases) {
        if (outOfRange(phase.startDate) || outOfRange(phase.endDate)) {
            throw new Error("The generated plan included a phase outside the selected study period.");
        }
        for (const task of phase.tasks) {
            if (outOfRange(task.scheduledDate)) {
                throw new Error("The generated plan included a task scheduled outside the selected study period.");
            }
        }
    }
    for (const milestone of plan.milestones) {
        if (outOfRange(milestone.targetDate)) {
            throw new Error("The generated plan included a milestone outside the selected study period.");
        }
    }
}

function normalizeTitle(title: string): string {
    return title.trim().toLowerCase().replace(/\s+/g, " ");
}

// Drops exact-duplicate tasks (by normalized title) across the whole plan
// instead of failing the generation outright - mirrors
// utils/questionBank/questionValidator.ts's dedupeQuestions.
function dedupeTasks(plan: GeneratedStudyPlan): GeneratedStudyPlan {
    const seen = new Set<string>();
    const phases = plan.phases
        .map((phase) => ({
            ...phase,
            tasks: phase.tasks.filter((task) => {
                const key = normalizeTitle(task.title);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            }),
        }))
        .filter((phase) => phase.tasks.length > 0);
    return { ...plan, phases };
}

async function callGemini(ctx: StudyPlanGenerationContext): Promise<GenerateStudyPlanResult> {
    const ai = getGeminiClient();
    const model = getStudyPlannerModel();
    const response = await ai.models.generateContent({
        model,
        contents: buildStudyPlanGenerationPrompt(ctx),
        config: {
            responseMimeType: "application/json",
            responseSchema: STUDY_PLAN_RESPONSE_SCHEMA,
            temperature: 0.8,
        },
    });
    const text = response.text;
    if (!text) throw new Error("The AI provider returned an empty response.");

    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        throw new Error("The AI provider returned a malformed response.");
    }

    const parsed = GeneratedStudyPlanSchema.parse(raw);
    assertDatesWithinRange(parsed);
    const plan = dedupeTasks(parsed);
    if (plan.phases.every((phase) => phase.tasks.length === 0)) {
        throw new Error("The AI generated a plan with no usable tasks.");
    }

    return { plan, model, usageMetadata: response.usageMetadata };
}

const MAX_ATTEMPTS = 2;

// Retries once on a malformed/invalid response (safety refusal, truncated
// JSON, dates outside range) before giving up - the same resilience pattern
// as utils/questionBank/questionAnswerer.ts.
export async function generateStudyPlan(ctx: StudyPlanGenerationContext): Promise<GenerateStudyPlanResult> {
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
