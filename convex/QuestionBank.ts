import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// AI Question Bank - independent module (app/(routes)/question-bank).
// A "collection" is one Generate click; its questions' detailed answers are
// generated on demand by app/api/question-bank/answer and cached in
// questionBankAnswers so re-expanding a question never re-calls the LLM.

const QUESTION_INPUT = v.object({
    question: v.string(),
    difficulty: v.union(v.literal('beginner'), v.literal('intermediate'), v.literal('advanced')),
});

// Called once, server-side, right after /api/question-bank/generate gets a
// validated question set back from Gemini - mirrors how SaveInterviewQuestions
// persists generation results right after they succeed instead of trusting a
// second round trip from the browser.
export const SaveGeneratedCollection = mutation({
    args: {
        userId: v.id('UserTable'),
        title: v.string(),
        generationMode: v.union(v.literal('skill'), v.literal('job')),
        topics: v.array(v.string()),
        jobTitle: v.optional(v.string()),
        jobDescription: v.optional(v.string()),
        language: v.string(),
        questions: v.array(QUESTION_INPUT),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const beginnerCount = args.questions.filter((q) => q.difficulty === 'beginner').length;
        const intermediateCount = args.questions.filter((q) => q.difficulty === 'intermediate').length;
        const advancedCount = args.questions.filter((q) => q.difficulty === 'advanced').length;

        const collectionId = await ctx.db.insert('questionBankCollections', {
            userId: args.userId,
            title: args.title,
            generationMode: args.generationMode,
            topics: args.topics,
            jobTitle: args.jobTitle,
            jobDescription: args.jobDescription,
            totalQuestions: args.questions.length,
            beginnerCount,
            intermediateCount,
            advancedCount,
            language: args.language,
            generationStatus: 'ready',
            isShared: false,
            createdAt: now,
            updatedAt: now,
        });

        for (let i = 0; i < args.questions.length; i++) {
            const q = args.questions[i];
            await ctx.db.insert('questionBankQuestions', {
                collectionId,
                question: q.question,
                difficulty: q.difficulty,
                order: i,
                answerStatus: 'idle',
                createdAt: now,
            });
        }

        return collectionId;
    },
});

// Dashboard-style history list - newest first, questions not included.
export const GetUserCollections = query({
    args: {
        userId: v.id('UserTable'),
    },
    handler: async (ctx, args) => {
        const rows = await ctx.db
            .query('questionBankCollections')
            .withIndex('by_user', (q) => q.eq('userId', args.userId))
            .collect();
        return rows
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((row) => ({
                _id: row._id,
                title: row.title,
                generationMode: row.generationMode,
                topics: row.topics,
                jobTitle: row.jobTitle,
                totalQuestions: row.totalQuestions,
                beginnerCount: row.beginnerCount,
                intermediateCount: row.intermediateCount,
                advancedCount: row.advancedCount,
                isShared: row.isShared,
                shareToken: row.shareToken,
                createdAt: row.createdAt,
            }));
    },
});

// One collection with its questions, opened from the Question Bank page or
// its history. Returns null when the id is malformed or owned by someone else.
export const GetCollection = query({
    args: {
        userId: v.id('UserTable'),
        collectionId: v.string(),
    },
    handler: async (ctx, args) => {
        const id = ctx.db.normalizeId('questionBankCollections', args.collectionId);
        if (!id) return null;
        const collection = await ctx.db.get(id);
        if (!collection || collection.userId !== args.userId) return null;
        const questions = await ctx.db
            .query('questionBankQuestions')
            .withIndex('by_collection_order', (q) => q.eq('collectionId', id))
            .collect();
        return { collection, questions: questions.sort((a, b) => a.order - b.order) };
    },
});

// Read-only view for a collection opened through its share link - no
// ownership check, but only ever returns something when isShared is true, and
// never exposes the owner's userId or other collections.
export const GetSharedCollection = query({
    args: {
        shareToken: v.string(),
    },
    handler: async (ctx, args) => {
        const collection = await ctx.db
            .query('questionBankCollections')
            .withIndex('by_shareToken', (q) => q.eq('shareToken', args.shareToken))
            .unique();
        if (!collection || !collection.isShared) return null;
        const questions = await ctx.db
            .query('questionBankQuestions')
            .withIndex('by_collection_order', (q) => q.eq('collectionId', collection._id))
            .collect();
        return {
            collection: {
                _id: collection._id,
                title: collection.title,
                generationMode: collection.generationMode,
                topics: collection.topics,
                jobTitle: collection.jobTitle,
                totalQuestions: collection.totalQuestions,
                beginnerCount: collection.beginnerCount,
                intermediateCount: collection.intermediateCount,
                advancedCount: collection.advancedCount,
                createdAt: collection.createdAt,
            },
            questions: questions.sort((a, b) => a.order - b.order),
        };
    },
});

export const DeleteCollection = mutation({
    args: {
        userId: v.id('UserTable'),
        collectionId: v.id('questionBankCollections'),
    },
    handler: async (ctx, args) => {
        const collection = await ctx.db.get(args.collectionId);
        if (!collection || collection.userId !== args.userId) {
            throw new Error('Collection not found');
        }
        const questions = await ctx.db
            .query('questionBankQuestions')
            .withIndex('by_collection', (q) => q.eq('collectionId', args.collectionId))
            .collect();
        for (const question of questions) {
            const answers = await ctx.db
                .query('questionBankAnswers')
                .withIndex('by_question', (q) => q.eq('questionId', question._id))
                .collect();
            for (const answer of answers) await ctx.db.delete(answer._id);
            await ctx.db.delete(question._id);
        }
        await ctx.db.delete(args.collectionId);
    },
});

// Turns sharing on (minting a fresh token) or off (revoking the existing one -
// the old link stops resolving immediately since GetSharedCollection also
// requires isShared).
export const SetCollectionSharing = mutation({
    args: {
        userId: v.id('UserTable'),
        collectionId: v.id('questionBankCollections'),
        isShared: v.boolean(),
    },
    handler: async (ctx, args) => {
        const collection = await ctx.db.get(args.collectionId);
        if (!collection || collection.userId !== args.userId) {
            throw new Error('Collection not found');
        }
        if (args.isShared) {
            const shareToken = collection.shareToken ?? crypto.randomUUID();
            await ctx.db.patch(args.collectionId, { isShared: true, shareToken, updatedAt: Date.now() });
            return { shareToken };
        }
        await ctx.db.patch(args.collectionId, { isShared: false, updatedAt: Date.now() });
        return { shareToken: null };
    },
});

// Returns the cached answer if one already exists, without any LLM call -
// used by the frontend before deciding whether to hit /api/question-bank/answer.
export const GetAnswer = query({
    args: {
        questionId: v.id('questionBankQuestions'),
    },
    handler: async (ctx, args) => {
        const answer = await ctx.db
            .query('questionBankAnswers')
            .withIndex('by_question', (q) => q.eq('questionId', args.questionId))
            .unique();
        return answer;
    },
});

// Atomic check-and-set: only succeeds (ok: true) when the question wasn't
// already 'generating' or 'ready', so two concurrent expand clicks (or two
// browser tabs) can't both call the LLM for the same question.
export const BeginAnswerGeneration = mutation({
    args: {
        questionId: v.id('questionBankQuestions'),
    },
    handler: async (ctx, args) => {
        const question = await ctx.db.get(args.questionId);
        if (!question) throw new Error('Question not found');
        if (question.answerStatus === 'generating' || question.answerStatus === 'ready') {
            return { ok: false, status: question.answerStatus };
        }
        await ctx.db.patch(args.questionId, { answerStatus: 'generating' });
        return { ok: true, status: 'generating' as const };
    },
});

export const SaveAnswer = mutation({
    args: {
        questionId: v.id('questionBankQuestions'),
        collectionId: v.id('questionBankCollections'),
        structuredAnswer: v.string(),
        modelMetadata: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query('questionBankAnswers')
            .withIndex('by_question', (q) => q.eq('questionId', args.questionId))
            .unique();
        if (existing) {
            await ctx.db.patch(existing._id, {
                structuredAnswer: args.structuredAnswer,
                generatedAt: Date.now(),
                modelMetadata: args.modelMetadata,
            });
        } else {
            await ctx.db.insert('questionBankAnswers', {
                questionId: args.questionId,
                collectionId: args.collectionId,
                structuredAnswer: args.structuredAnswer,
                generatedAt: Date.now(),
                modelMetadata: args.modelMetadata,
            });
        }
        await ctx.db.patch(args.questionId, { answerStatus: 'ready' });
    },
});

export const MarkAnswerFailed = mutation({
    args: {
        questionId: v.id('questionBankQuestions'),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.questionId, { answerStatus: 'error' });
    },
});

export const LogGeneration = mutation({
    args: {
        userId: v.id('UserTable'),
        collectionId: v.optional(v.id('questionBankCollections')),
        questionId: v.optional(v.id('questionBankQuestions')),
        kind: v.union(v.literal('questions'), v.literal('answer')),
        model: v.string(),
        usageMetadata: v.optional(v.any()),
        generationStatus: v.union(v.literal('success'), v.literal('failed')),
        error: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert('questionBankGenerationLogs', { ...args, createdAt: Date.now() });
    },
});

// Looked up server-side (app/api/question-bank/answer) to confirm the caller
// may act on this question: either they own its collection, or it's shared.
export const GetQuestionWithCollection = query({
    args: {
        questionId: v.id('questionBankQuestions'),
    },
    handler: async (ctx, args) => {
        const question = await ctx.db.get(args.questionId);
        if (!question) return null;
        const collection = await ctx.db.get(question.collectionId);
        if (!collection) return null;
        return { question, collection };
    },
});
