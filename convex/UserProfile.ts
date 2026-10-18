import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Powers the Settings > Profile tab. One row per user. Name, email and avatar
// live in Clerk (synced into UserTable by app/Provider.tsx) - this only holds
// the extra professional details Clerk doesn't track.
export const GetUserProfile = query({
    args: {
        userId: v.id('UserTable'),
    },
    handler: async (ctx, args) => {
        const rows = await ctx.db.query('UserProfileTable').filter(q => q.eq(q.field('userId'), args.userId)).collect();
        return rows[0] ?? null;
    }
});

// Upserts the caller's profile details.
export const SaveUserProfile = mutation({
    args: {
        userId: v.id('UserTable'),
        phone: v.string(),
        headline: v.string(),
        location: v.string(),
        experienceLevel: v.string(),
        linkedinUrl: v.string(),
        bio: v.string(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db.query('UserProfileTable').filter(q => q.eq(q.field('userId'), args.userId)).collect();
        const patch = {
            userId: args.userId,
            phone: args.phone,
            headline: args.headline,
            location: args.location,
            experienceLevel: args.experienceLevel,
            linkedinUrl: args.linkedinUrl,
            bio: args.bio,
            updatedAt: Date.now(),
        };
        if (existing.length > 0) {
            await ctx.db.patch(existing[0]._id, patch);
            return existing[0]._id;
        }
        return await ctx.db.insert('UserProfileTable', patch);
    }
});
