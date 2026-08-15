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
