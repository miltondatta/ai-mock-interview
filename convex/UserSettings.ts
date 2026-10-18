import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Powers the Settings > Language tab. One row per user.
export const GetUserSettings = query({
    args: {
        userId: v.id('UserTable'),
    },
    handler: async (ctx, args) => {
        const rows = await ctx.db.query('UserSettingsTable').filter(q => q.eq(q.field('userId'), args.userId)).collect();
        return rows[0] ?? null;
    }
});

// Upserts the caller's default interview mode/level/question count. Patches
// only these fields so the language preferences on the same row are kept.
export const SaveInterviewPreferences = mutation({
    args: {
        userId: v.id('UserTable'),
        defaultInterviewMode: v.string(),
        defaultInterviewLevel: v.string(),
        defaultQuestionCount: v.string(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db.query('UserSettingsTable').filter(q => q.eq(q.field('userId'), args.userId)).collect();
        const patch = {
            userId: args.userId,
            defaultInterviewMode: args.defaultInterviewMode,
            defaultInterviewLevel: args.defaultInterviewLevel,
            defaultQuestionCount: args.defaultQuestionCount,
            updatedAt: Date.now(),
        };
        if (existing.length > 0) {
            await ctx.db.patch(existing[0]._id, patch);
            return existing[0]._id;
        }
        return await ctx.db.insert('UserSettingsTable', patch);
    }
});

// Upserts the caller's language preferences.
export const SaveUserSettings = mutation({
    args: {
        userId: v.id('UserTable'),
        interviewLanguage: v.string(),
        feedbackLanguage: v.string(),
        practiceCoachLanguage: v.string(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db.query('UserSettingsTable').filter(q => q.eq(q.field('userId'), args.userId)).collect();
        const patch = {
            userId: args.userId,
            interviewLanguage: args.interviewLanguage,
            feedbackLanguage: args.feedbackLanguage,
            practiceCoachLanguage: args.practiceCoachLanguage,
            updatedAt: Date.now(),
        };
        if (existing.length > 0) {
            await ctx.db.patch(existing[0]._id, patch);
            return existing[0]._id;
        }
        return await ctx.db.insert('UserSettingsTable', patch);
    }
});
