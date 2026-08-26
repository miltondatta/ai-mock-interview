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
            const existingUser = existingUsers[0];
            // Clerk is the source of truth for name/avatar - keep Convex in sync so a
            // blank name captured on first sign-in (e.g. before the user set their
            // Clerk profile name) doesn't stay stuck forever. Only overwrite `name`
            // with a non-empty value so a transient empty `fullName` never blanks out
            // an already-known name.
            const patch: Partial<{ name: string; imageUrl: string }> = {};
            if (args.name && existingUser.name !== args.name) patch.name = args.name;
            if (args.imageUrl && existingUser.imageUrl !== args.imageUrl) patch.imageUrl = args.imageUrl;

            if (Object.keys(patch).length > 0) {
                await ctx.db.patch(existingUser._id, patch);
                return await ctx.db.get(existingUser._id);
            }
            return existingUser;
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