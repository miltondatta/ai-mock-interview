import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Resume Match Analyzer results. The resumes themselves live in the shared
// resume library (convex/Resumes.ts).

export const SaveResumeMatchAnalysis = mutation({
    args: {
        userId: v.id('UserTable'),
        resumeId: v.string(),
        resumeUrl: v.string(),
        resumeFileName: v.optional(v.string()),
        jobTitle: v.string(),
        jobDescription: v.optional(v.string()),
        jobDescriptionUrl: v.optional(v.string()),
        lang: v.string(),
        analysis: v.any(),
    },
    handler: async (ctx, args) => {
        const createdAt = Date.now();
        const id = await ctx.db.insert('ResumeMatchAnalysisTable', { ...args, createdAt });
        return { id, createdAt };
    }
});

// Shown when the candidate reopens the screen, so their last result isn't lost.
export const GetLatestResumeMatchAnalysis = query({
    args: {
        userId: v.id('UserTable'),
    },
    handler: async (ctx, args) => {
        const analyses = await ctx.db
            .query('ResumeMatchAnalysisTable')
            .filter(q => q.eq(q.field('userId'), args.userId))
            .collect();
        if (analyses.length === 0) return null;
        const latest = analyses.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
        return {
            _id: latest._id,
            resumeId: latest.resumeId,
            resumeFileName: latest.resumeFileName,
            analysis: latest.analysis,
            createdAt: latest.createdAt,
        };
    }
});
