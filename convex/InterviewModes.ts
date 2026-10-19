import { query } from "./_generated/server";

// Public list of Interview Modes for Create Interview and Settings > Interview
// Preferences. Managed (add/remove) from the admin panel via convex/admin.ts.
export const ListInterviewModes = query({
    args: {},
    handler: async (ctx) => {
        const rows = await ctx.db.query('InterviewModeTable').collect();
        return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
    }
});
