import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Resume Match Analyzer results. The resumes themselves live in the shared
// resume library (convex/Resumes.ts). Analyses are only stored when the
// candidate chooses to save them (app/api/resume-match/save).

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

// Dashboard history - saved analyses, newest first. Only the fields the
// history cards show; the full record is loaded by GetResumeMatchAnalysis.
export const GetUserResumeMatchAnalyses = query({
    args: {
        userId: v.id('UserTable'),
    },
    handler: async (ctx, args) => {
        const analyses = await ctx.db
            .query('ResumeMatchAnalysisTable')
            .withIndex('by_user', q => q.eq('userId', args.userId))
            .collect();
        return analyses
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((row) => ({
                _id: row._id,
                jobTitle: row.jobTitle,
                resumeFileName: row.resumeFileName,
                jobDescriptionSource: row.jobDescriptionUrl ? 'url' as const : 'text' as const,
                overallScore: typeof row.analysis?.overallScore === 'number' ? row.analysis.overallScore as number : null,
                matchLevel: typeof row.analysis?.matchLevel === 'string' ? row.analysis.matchLevel as string : null,
                createdAt: row.createdAt,
            }));
    }
});

// One saved analysis, opened from the dashboard history. Returns null when the
// id is malformed or the record belongs to someone else. The resume's file URL
// is left out - the page views it through /api/resumes/[resumeId]/file.
export const GetResumeMatchAnalysis = query({
    args: {
        userId: v.id('UserTable'),
        analysisId: v.string(),
    },
    handler: async (ctx, args) => {
        const id = ctx.db.normalizeId('ResumeMatchAnalysisTable', args.analysisId);
        if (!id) return null;
        const row = await ctx.db.get(id);
        if (!row || row.userId !== args.userId) return null;
        return {
            _id: row._id,
            resumeId: row.resumeId,
            resumeFileName: row.resumeFileName,
            jobTitle: row.jobTitle,
            jobDescription: row.jobDescription,
            jobDescriptionUrl: row.jobDescriptionUrl,
            analysis: row.analysis,
            createdAt: row.createdAt,
        };
    }
});

// Removes one saved analysis from the candidate's history.
export const DeleteResumeMatchAnalysis = mutation({
    args: {
        userId: v.id('UserTable'),
        analysisId: v.id('ResumeMatchAnalysisTable'),
    },
    handler: async (ctx, args) => {
        const row = await ctx.db.get(args.analysisId);
        if (!row || row.userId !== args.userId) {
            throw new Error('Analysis not found');
        }
        await ctx.db.delete(args.analysisId);
    }
});
