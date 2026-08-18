import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const CreateNewUser = mutation({
    args:{
        name: v.string(),
        email: v.string(),
        imageUrl: v.string(),
    },
    handler: async(ctx,args) => {
        // Check if user exists
        const existingUsers = await ctx.db.query('UserTable').filter(q=>q.eq(q.field('email'),args.email)).collect()

        if(existingUsers.length > 0) {
            return existingUsers[0];
        }

        const userId = await ctx.db.insert('UserTable', {
            email:args.email,
            imageUrl:args.imageUrl,
            name:args.name
        })

        return await ctx.db.get(userId);
    }
})

// Server-side routes resolve the authenticated Clerk user's email (via currentUser())
// and use this to find the authoritative Convex user id, instead of trusting a
// client-supplied userId.
export const GetUserByEmail = query({
    args: {
        email: v.string()
    },
    handler: async (ctx, args) => {
        const users = await ctx.db.query('UserTable').filter(q => q.eq(q.field('email'), args.email)).collect();
        return users[0] ?? null;
    }
})