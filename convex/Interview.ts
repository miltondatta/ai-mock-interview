import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const SaveInterviewQuestions = mutation({
    args: {
        questions: v.any(),
        uid: v.id('UserTable'),
        resumeUrl: v.optional(v.string()),
        resumeFileName: v.optional(v.string()),
        jobTitle: v.optional(v.string()),
        jobDescription: v.optional(v.string()),
        level: v.optional(v.string()),
        qno: v.optional(v.number())
    },
    handler: async (ctx, args) => {
        const result = await ctx.db.insert('InterviewSessionTable', {
            interviewQuestion: args.questions,
            resumeUrl: args.resumeUrl,
            resumeFileName: args.resumeFileName,
            jobTitle: args.jobTitle,
            jobDescription: args.jobDescription,
            level: args.level,
            qno: args.qno,
            userId: args.uid,
            status: 'draft'
        });
        return result;
    }
});

export const GetUserInterviews = query({
    args: {
        userId: v.id('UserTable')
    },
    handler: async (ctx, args) => {
        const interviews = await ctx.db
            .query('InterviewSessionTable')
            .filter(q => q.eq(q.field('userId'), args.userId))
            .collect();
        return interviews.reverse();
    }
});

export const GetInterviewSession = query({
    args: {
        interviewId: v.id('InterviewSessionTable')
    },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.interviewId);
    }
});

// Ownership-checked lookup - returns null (not a thrown error) on mismatch so callers
// can surface a generic "not found/unauthorized" message without leaking whether
// another user's interview exists.
export const GetInterviewSessionForUser = query({
    args: {
        interviewId: v.id('InterviewSessionTable'),
        userId: v.id('UserTable')
    },
    handler: async (ctx, args) => {
        const interview = await ctx.db.get(args.interviewId);
        if (!interview || interview.userId !== args.userId) {
            return null;
        }
        return interview;
    }
});

export const SaveElevenLabsConversation = mutation({
    args: {
        interviewId: v.id('InterviewSessionTable'),
        userId: v.id('UserTable'),
        elevenlabsConversationId: v.string()
    },
    handler: async (ctx, args) => {
        const interview = await ctx.db.get(args.interviewId);
        if (!interview || interview.userId !== args.userId) {
            throw new Error('Interview not found');
        }
        await ctx.db.patch(args.interviewId, {
            elevenlabsConversationId: args.elevenlabsConversationId,
            status: 'in_progress'
        });
        return await ctx.db.get(args.interviewId);
    }
});

export const SaveAgentTranscript = mutation({
    args: {
        interviewId: v.id('InterviewSessionTable'),
        userId: v.id('UserTable'),
        transcript: v.any()
    },
    handler: async (ctx, args) => {
        const interview = await ctx.db.get(args.interviewId);
        if (!interview || interview.userId !== args.userId) {
            throw new Error('Interview not found');
        }
        await ctx.db.patch(args.interviewId, {
            transcript: args.transcript
        });
        return await ctx.db.get(args.interviewId);
    }
});

export const SaveInterviewFeedback = mutation({
    args: {
        interviewId: v.id('InterviewSessionTable'),
        userId: v.id('UserTable'),
        feedback: v.any()
    },
    handler: async (ctx, args) => {
        const interview = await ctx.db.get(args.interviewId);
        if (!interview || interview.userId !== args.userId) {
            throw new Error('Interview not found');
        }
        await ctx.db.patch(args.interviewId, {
            feedback: args.feedback
        });
        return await ctx.db.get(args.interviewId);
    }
});

// Idempotent - safe to call more than once (the End Call route calls this after
// SaveAgentTranscript, and beforeunload's sendBeacon can race a manual End Call).
export const CompleteInterview = mutation({
    args: {
        interviewId: v.id('InterviewSessionTable'),
        userId: v.id('UserTable')
    },
    handler: async (ctx, args) => {
        const interview = await ctx.db.get(args.interviewId);
        if (!interview || interview.userId !== args.userId) {
            throw new Error('Interview not found');
        }
        if (interview.status === 'completed') {
            return interview;
        }
        await ctx.db.patch(args.interviewId, { status: 'completed' });
        return await ctx.db.get(args.interviewId);
    }
});

