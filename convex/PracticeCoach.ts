import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const SavePracticeCoachGeneration = mutation({
    args: {
        userId: v.id('UserTable'),
        resumeUrl: v.optional(v.string()),
        jobTitle: v.optional(v.string()),
        jobDescription: v.optional(v.string()),
        webhookResponse: v.any(),
        audioUrl: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const result = await ctx.db.insert('PracticeCoachTable', {
            userId: args.userId,
            resumeUrl: args.resumeUrl,
            jobTitle: args.jobTitle,
            jobDescription: args.jobDescription,
            webhookResponse: args.webhookResponse,
            audioUrl: args.audioUrl,
            createdAt: Date.now(),
        });
        return result;
    }
});

// Used to offer a candidate who hasn't generated a new script this visit the
// audio from their most recent prior generation instead.
export const GetLatestPracticeCoachGeneration = query({
    args: {
        userId: v.id('UserTable'),
    },
    handler: async (ctx, args) => {
        const generations = await ctx.db
            .query('PracticeCoachTable')
            .filter(q => q.eq(q.field('userId'), args.userId))
            .collect();
        if (generations.length === 0) return null;
        return generations.reduce((latest, item) =>
            item.createdAt > latest.createdAt ? item : latest
        );
    }
});

// Scoped to userId so one candidate can't trigger/read another's audio generation.
export const GetPracticeCoachGenerationForUser = query({
    args: {
        id: v.id('PracticeCoachTable'),
        userId: v.id('UserTable'),
    },
    handler: async (ctx, args) => {
        const generation = await ctx.db.get(args.id);
        if (!generation || generation.userId !== args.userId) return null;
        return generation;
    }
});

// Backfills audioUrl on a row generated before on-demand audio generation
// existed (or whose audio generation failed the first time).
export const SetPracticeCoachAudioUrl = mutation({
    args: {
        id: v.id('PracticeCoachTable'),
        audioUrl: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, { audioUrl: args.audioUrl });
    }
});
