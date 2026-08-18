import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const SaveInterviewQuestions = mutation({
    args: {
        questions: v.any(),
        uid: v.id('UserTable'),
        resumeUrl: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const result = await ctx.db.insert('InterviewSessionTable', {
            interviewQuestion: args.questions,
            resumeUrl: args.resumeUrl,
            userId: args.uid,
            status: 'draft'
        });
        return result;
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

export const SaveTavusConversation = mutation({
    args: {
        interviewId: v.id('InterviewSessionTable'),
        userId: v.id('UserTable'),
        tavusConversationId: v.string(),
        tavusConversationUrl: v.string()
    },
    handler: async (ctx, args) => {
        const interview = await ctx.db.get(args.interviewId);
        if (!interview || interview.userId !== args.userId) {
            throw new Error('Interview not found');
        }
        await ctx.db.patch(args.interviewId, {
            tavusConversationId: args.tavusConversationId,
            tavusConversationUrl: args.tavusConversationUrl,
            status: 'in_progress'
        });
        return await ctx.db.get(args.interviewId);
    }
});

// Idempotent - safe to call more than once (End Call button + transcript webhook
// can both race to complete the same interview).
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

// Webhook-facing lookup: the Tavus callback only carries conversation_id, never a
// Clerk/browser userId. This is the authoritative conversation_id -> interview mapping.
export const GetInterviewByTavusConversationId = query({
    args: {
        tavusConversationId: v.string()
    },
    handler: async (ctx, args) => {
        const interview = await ctx.db.query('InterviewSessionTable')
            .withIndex('by_tavusConversationId', q => q.eq('tavusConversationId', args.tavusConversationId))
            .first();
        return interview ?? null;
    }
});

export const SaveTranscript = mutation({
    args: {
        tavusConversationId: v.string(),
        transcript: v.any()
    },
    handler: async (ctx, args) => {
        const interview = await ctx.db.query('InterviewSessionTable')
            .withIndex('by_tavusConversationId', q => q.eq('tavusConversationId', args.tavusConversationId))
            .first();
        if (!interview) {
            throw new Error('Interview not found for tavusConversationId');
        }
        await ctx.db.patch(interview._id, {
            transcript: args.transcript,
            status: 'completed'
        });
        return await ctx.db.get(interview._id);
    }
});
