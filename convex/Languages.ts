import { query } from "./_generated/server";
import { v } from "convex/values";

// Public list of languages for the candidate-facing language pickers (Settings
// > Language, Create Interview, Practice Coach). Managed (add/remove) from the
// admin panel via convex/admin.ts.
export const ListLanguages = query({
    args: {},
    handler: async (ctx) => {
        const rows = await ctx.db.query('AdminLanguageTable').collect();
        return rows.sort((a, b) => a.createdAt - b.createdAt);
    }
});

// Greeting saved for an admin-added language - read by the interview start
// route for languages that have no built-in greeting.
export const GetLanguageGreeting = query({
    args: { code: v.string() },
    handler: async (ctx, args) => {
        const rows = await ctx.db.query('AdminLanguageTable').filter(q => q.eq(q.field('code'), args.code)).collect();
        const language = rows[0];
        if (!language) return null;
        return { greeting: language.greeting ?? null, roleFallback: language.roleFallback ?? null };
    }
});
