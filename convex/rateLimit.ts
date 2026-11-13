import { RateLimiter, DAY } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
    // Mirrors the old Arcjet token bucket: capacity 10, refill 5 tokens/24h.
    generateInterviewQuestions: {
        kind: "token bucket",
        rate: 5,
        period: DAY,
        capacity: 10,
    },
    // Resume Match Analyzer - each analysis is two Gemini calls in n8n.
    resumeMatchAnalysis: {
        kind: "token bucket",
        rate: 20,
        period: DAY,
        capacity: 20,
    },
    // AI Question Bank - one Gemini call per collection generation.
    questionBankGenerate: {
        kind: "token bucket",
        rate: 15,
        period: DAY,
        capacity: 15,
    },
    // AI Question Bank - one Gemini call per on-demand answer generation
    // (re-expanding an already-generated answer never consumes this).
    questionBankAnswer: {
        kind: "token bucket",
        rate: 60,
        period: DAY,
        capacity: 60,
    },
    // Study Planner - one Gemini call per AI plan generation (regenerating
    // also consumes this; saving a manual plan never does).
    studyPlanGenerate: {
        kind: "token bucket",
        rate: 10,
        period: DAY,
        capacity: 10,
    },
});

export const consumeResumeMatchAnalysis = mutation({
    args: {
        userId: v.string(),
    },
    handler: async (ctx, { userId }) => {
        return await rateLimiter.limit(ctx, "resumeMatchAnalysis", { key: userId });
    },
});

export const consumeGenerateInterviewQuestions = mutation({
    args: {
        userId: v.string(),
    },
    handler: async (ctx, { userId }) => {
        return await rateLimiter.limit(ctx, "generateInterviewQuestions", {
            key: userId,
            count: 5,
        });
    },
});

export const consumeQuestionBankGenerate = mutation({
    args: {
        userId: v.string(),
    },
    handler: async (ctx, { userId }) => {
        return await rateLimiter.limit(ctx, "questionBankGenerate", { key: userId });
    },
});

export const consumeQuestionBankAnswer = mutation({
    args: {
        userId: v.string(),
    },
    handler: async (ctx, { userId }) => {
        return await rateLimiter.limit(ctx, "questionBankAnswer", { key: userId });
    },
});

export const consumeStudyPlanGenerate = mutation({
    args: {
        userId: v.string(),
    },
    handler: async (ctx, { userId }) => {
        return await rateLimiter.limit(ctx, "studyPlanGenerate", { key: userId });
    },
});
