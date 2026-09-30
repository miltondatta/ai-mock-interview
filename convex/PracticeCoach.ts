import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const SavePracticeCoachGeneration = mutation({
    args: {
        userId: v.id('UserTable'),
        resumeUrl: v.optional(v.string()),
        jobTitle: v.optional(v.string()),
        jobDescription: v.optional(v.string()),
        webhookResponse: v.any(),
    },
    handler: async (ctx, args) => {
        const result = await ctx.db.insert('PracticeCoachTable', {
            userId: args.userId,
            resumeUrl: args.resumeUrl,
            jobTitle: args.jobTitle,
            jobDescription: args.jobDescription,
            webhookResponse: args.webhookResponse,
            createdAt: Date.now(),
        });
        return result;
    }
});
