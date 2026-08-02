import { mutation } from "./_generated/server";
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