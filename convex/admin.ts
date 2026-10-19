import { internalMutation, mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// Password hashing lives in the Next.js API routes (Node `crypto`). Convex only
// stores/reads the resulting salt + digest and mints opaque session tokens.

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

async function findSession(ctx: QueryCtx | MutationCtx, token: string) {
  const rows = await ctx.db
    .query("AdminSessionTable")
    .filter((q) => q.eq(q.field("token"), token))
    .collect();
  const session = rows[0];
  if (!session || session.expiresAt < Date.now()) return null;
  return session;
}

// Throws for any request that doesn't carry a live admin session token. Every
// data-facing admin function funnels through this so the Convex endpoints can't
// be used to read the user base without a valid panel login.
async function requireSession(ctx: QueryCtx | MutationCtx, token: string) {
  const session = await findSession(ctx, token);
  if (!session) throw new Error("Unauthorized");
  return session;
}

async function getAdmin(ctx: QueryCtx | MutationCtx) {
  const rows = await ctx.db.query("AdminTable").collect();
  return rows[0] ?? null;
}

/* ----------------------------- Authentication ----------------------------- */

// Returns the stored credential row for the login route to verify against.
// Returns null when no admin has been provisioned yet (the login route then
// seeds one with the temporary password).
export const GetAdminCredentials = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const admin = await getAdmin(ctx);
    if (!admin || admin.username !== args.username) return null;
    return {
      username: admin.username,
      passwordHash: admin.passwordHash,
      passwordSalt: admin.passwordSalt,
      mustChangePassword: admin.mustChangePassword,
    };
  },
});

// Idempotent - creates the admin row only if none exists yet.
export const SeedAdmin = mutation({
  args: {
    username: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await getAdmin(ctx);
    if (existing) return existing._id;
    return await ctx.db.insert("AdminTable", {
      username: args.username,
      passwordHash: args.passwordHash,
      passwordSalt: args.passwordSalt,
      mustChangePassword: true,
      updatedAt: Date.now(),
    });
  },
});

export const UpdateAdminPassword = mutation({
  args: {
    token: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const admin = await getAdmin(ctx);
    if (!admin) throw new Error("Admin not found");
    await ctx.db.patch(admin._id, {
      passwordHash: args.passwordHash,
      passwordSalt: args.passwordSalt,
      mustChangePassword: false,
      updatedAt: Date.now(),
    });
  },
});

export const CreateSession = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    // Opportunistic cleanup of expired rows so the table doesn't grow forever.
    const stale = await ctx.db
      .query("AdminSessionTable")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();
    await Promise.all(stale.map((s) => ctx.db.delete(s._id)));

    await ctx.db.insert("AdminSessionTable", {
      token: args.token,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    });
    return { expiresAt: now + SESSION_TTL_MS };
  },
});

export const DeleteSession = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("AdminSessionTable")
      .filter((q) => q.eq(q.field("token"), args.token))
      .collect();
    await Promise.all(rows.map((s) => ctx.db.delete(s._id)));
  },
});

// Used by the protected admin layout to gate every panel page.
export const VerifySession = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await findSession(ctx, args.token);
    if (!session) return null;
    const admin = await getAdmin(ctx);
    return {
      username: admin?.username ?? "admin",
      mustChangePassword: admin?.mustChangePassword ?? false,
    };
  },
});

/* -------------------------------- Dashboard ------------------------------- */

export const GetDashboardStats = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);

    const users = await ctx.db.query("UserTable").collect();
    const interviews = await ctx.db.query("InterviewSessionTable").collect();
    const plans = await ctx.db.query("AdminPlanTable").collect();

    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const completed = interviews.filter((i) => i.status === "completed");

    const userName = new Map(users.map((u) => [u._id, u.name || u.email]));

    const recentUsers = [...users]
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 5)
      .map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        imageUrl: u.imageUrl,
        joinedAt: u._creationTime,
      }));

    const recentInterviews = [...interviews]
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 6)
      .map((i) => ({
        _id: i._id,
        jobTitle: i.jobTitle || (i.resumeFileName ? "Resume-based interview" : "Interview"),
        status: i.status,
        level: i.level ?? null,
        userName: userName.get(i.userId) ?? "Unknown",
        createdAt: i._creationTime,
      }));

    return {
      totalUsers: users.length,
      totalInterviews: interviews.length,
      completedInterviews: completed.length,
      draftInterviews: interviews.length - completed.length,
      interviewsLast7Days: interviews.filter((i) => i._creationTime >= weekAgo).length,
      newUsersLast7Days: users.filter((u) => u._creationTime >= weekAgo).length,
      activePlans: plans.filter((p) => p.active).length,
      recentUsers,
      recentInterviews,
    };
  },
});

/* ---------------------------------- Users -------------------------------- */

export const ListUsers = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);

    const users = await ctx.db.query("UserTable").collect();
    const interviews = await ctx.db.query("InterviewSessionTable").collect();

    const byUser = new Map<
      Id<"UserTable">,
      { total: number; completed: number; last: number }
    >();
    for (const i of interviews) {
      const entry = byUser.get(i.userId) ?? { total: 0, completed: 0, last: 0 };
      entry.total += 1;
      if (i.status === "completed") entry.completed += 1;
      entry.last = Math.max(entry.last, i._creationTime);
      byUser.set(i.userId, entry);
    }

    return users
      .map((u) => {
        const stats = byUser.get(u._id);
        return {
          _id: u._id,
          name: u.name,
          email: u.email,
          imageUrl: u.imageUrl,
          joinedAt: u._creationTime,
          interviewCount: stats?.total ?? 0,
          completedCount: stats?.completed ?? 0,
          lastInterviewAt: stats?.last ?? null,
        };
      })
      .sort((a, b) => b.joinedAt - a.joinedAt);
  },
});

/* ------------------------------- Subscription ---------------------------- */

const DEFAULT_PLANS = [
  {
    name: "Free",
    description: "Get started with the essentials.",
    price: 0,
    currency: "USD",
    interval: "month",
    features: ["1 mock interview per month", "Basic feedback report", "Resume-based questions"],
    active: true,
    sortOrder: 0,
  },
  {
    name: "Pro",
    description: "For active job seekers.",
    price: 19,
    currency: "USD",
    interval: "month",
    features: [
      "Unlimited mock interviews",
      "Detailed feedback & scoring",
      "Job-description tailored questions",
      "Interview history",
    ],
    active: true,
    sortOrder: 1,
  },
  {
    name: "Premium",
    description: "Everything in Pro, plus coaching extras.",
    price: 39,
    currency: "USD",
    interval: "month",
    features: [
      "Everything in Pro",
      "Priority AI processing",
      "Downloadable PDF reports",
      "Early access to new features",
    ],
    active: true,
    sortOrder: 2,
  },
];

export const ListPlans = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const plans = await ctx.db.query("AdminPlanTable").collect();
    return plans.sort((a, b) => a.sortOrder - b.sortOrder || a._creationTime - b._creationTime);
  },
});

// Inserts the starter plan set the first time the Subscription page is opened.
export const SeedDefaultPlans = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const existing = await ctx.db.query("AdminPlanTable").collect();
    if (existing.length > 0) return { seeded: false };
    for (const plan of DEFAULT_PLANS) {
      await ctx.db.insert("AdminPlanTable", { ...plan, updatedAt: Date.now() });
    }
    return { seeded: true };
  },
});

export const UpsertPlan = mutation({
  args: {
    token: v.string(),
    id: v.optional(v.id("AdminPlanTable")),
    name: v.string(),
    description: v.optional(v.string()),
    price: v.number(),
    currency: v.string(),
    interval: v.string(),
    features: v.array(v.string()),
    active: v.boolean(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const data = {
      name: args.name,
      description: args.description,
      price: args.price,
      currency: args.currency,
      interval: args.interval,
      features: args.features,
      active: args.active,
      sortOrder: args.sortOrder,
      updatedAt: Date.now(),
    };
    if (args.id) {
      await ctx.db.patch(args.id, data);
      return args.id;
    }
    return await ctx.db.insert("AdminPlanTable", data);
  },
});

export const DeletePlan = mutation({
  args: { token: v.string(), id: v.id("AdminPlanTable") },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await ctx.db.delete(args.id);
  },
});

/* --------------------------------- Settings ------------------------------ */

const DEFAULT_SETTINGS: Record<string, unknown> = {
  siteName: "AI Mock Interview",
  supportEmail: "",
  announcement: "",
  allowNewRegistrations: true,
  maintenanceMode: false,
};

export const GetSettings = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const rows = await ctx.db.query("AdminSettingsTable").collect();
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return { ...DEFAULT_SETTINGS, ...stored };
  },
});

export const SaveSettings = mutation({
  args: { token: v.string(), settings: v.any() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const entries = Object.entries(args.settings ?? {});
    for (const [key, value] of entries) {
      const rows = await ctx.db
        .query("AdminSettingsTable")
        .filter((q) => q.eq(q.field("key"), key))
        .collect();
      if (rows[0]) {
        await ctx.db.patch(rows[0]._id, { value });
      } else {
        await ctx.db.insert("AdminSettingsTable", { key, value });
      }
    }
  },
});

/* -------------------------------- Languages ------------------------------ */

// Mirrors LANGUAGE_OPTIONS in app/(routes)/settings/languages.ts - the
// languages the app shipped with before they became admin-managed.
const DEFAULT_LANGUAGES = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "bn", label: "Bangla (বাংলা)", flag: "🇧🇩" },
  { code: "hi", label: "Hindi (हिन्दी)", flag: "🇮🇳" },
  { code: "es", label: "Spanish (Español)", flag: "🇪🇸" },
  { code: "fr", label: "French (Français)", flag: "🇫🇷" },
  { code: "de", label: "German (Deutsch)", flag: "🇩🇪" },
  { code: "ar", label: "Arabic (العربية)", flag: "🇸🇦" },
  { code: "zh", label: "Chinese (中文)", flag: "🇨🇳" },
];

export const ListLanguages = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const rows = await ctx.db.query("AdminLanguageTable").collect();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  },
});

// Inserts the starter language set the first time the Settings page is opened.
export const SeedDefaultLanguages = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const existing = await ctx.db.query("AdminLanguageTable").collect();
    if (existing.length > 0) return { seeded: false };
    const now = Date.now();
    for (const [i, language] of DEFAULT_LANGUAGES.entries()) {
      await ctx.db.insert("AdminLanguageTable", { ...language, createdAt: now + i });
    }
    return { seeded: true };
  },
});

export const AddLanguage = mutation({
  args: {
    token: v.string(),
    code: v.string(),
    label: v.string(),
    flag: v.string(),
    greeting: v.optional(v.string()),
    roleFallback: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const existing = await ctx.db
      .query("AdminLanguageTable")
      .filter((q) => q.eq(q.field("code"), args.code))
      .collect();
    if (existing.length > 0) throw new Error("Language already added");
    return await ctx.db.insert("AdminLanguageTable", {
      code: args.code,
      label: args.label,
      flag: args.flag,
      greeting: args.greeting,
      roleFallback: args.roleFallback,
      createdAt: Date.now(),
    });
  },
});

export const UpdateLanguageGreeting = mutation({
  args: {
    token: v.string(),
    id: v.id("AdminLanguageTable"),
    greeting: v.string(),
    roleFallback: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await ctx.db.patch(args.id, { greeting: args.greeting, roleFallback: args.roleFallback });
  },
});

// Internal only (not callable from the browser) - lets a greeting be set from
// the CLI, e.g. `npx convex run admin:SetLanguageGreetingByCode`, when Gemini
// isn't configured.
export const SetLanguageGreetingByCode = internalMutation({
  args: { code: v.string(), greeting: v.string(), roleFallback: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("AdminLanguageTable")
      .filter((q) => q.eq(q.field("code"), args.code))
      .collect();
    if (!rows[0]) throw new Error("Language not found");
    if (!args.greeting.includes("{name}") || !args.greeting.includes("{role}")) {
      throw new Error("Greeting must include {name} and {role}");
    }
    await ctx.db.patch(rows[0]._id, { greeting: args.greeting, roleFallback: args.roleFallback });
  },
});

// English is the app-wide default/fallback language, so it can't be removed.
export const RemoveLanguage = mutation({
  args: { token: v.string(), id: v.id("AdminLanguageTable") },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const language = await ctx.db.get(args.id);
    if (!language) return;
    if (language.code === "en") throw new Error("English is the default language");
    await ctx.db.delete(args.id);
  },
});

/* ----------------------------- Interview Modes --------------------------- */

// Mirrors INTERVIEW_MODES in app/(routes)/_components/InterviewOptions.tsx.
const DEFAULT_INTERVIEW_MODES = [
  { value: "hr", label: "HR Interview" },
  { value: "technical", label: "Technical" },
  { value: "behavioral", label: "Behavioral (STAR-based)" },
  { value: "managerial", label: "Managerial (Leadership & Management)" },
  { value: "system-design", label: "System Design" },
  { value: "coding", label: "Coding" },
  { value: "case-study", label: "Case Study (Business Scenarios)" },
  { value: "project-management", label: "Project Management" },
  { value: "graduate-fresher", label: "Graduate/Fresher" },
  { value: "executive", label: "Executive" },
  { value: "stress", label: "Stress Interview" },
  { value: "rapid-fire", label: "Rapid Fire" },
];

export const SeedDefaultInterviewModes = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const existing = await ctx.db.query("InterviewModeTable").collect();
    if (existing.length > 0) return { seeded: false };
    const now = Date.now();
    for (const [i, mode] of DEFAULT_INTERVIEW_MODES.entries()) {
      await ctx.db.insert("InterviewModeTable", { ...mode, sortOrder: i, createdAt: now });
    }
    return { seeded: true };
  },
});

export const AddInterviewMode = mutation({
  args: { token: v.string(), value: v.string(), label: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const modes = await ctx.db.query("InterviewModeTable").collect();
    if (modes.some((m) => m.value === args.value)) {
      throw new Error("Interview mode already exists");
    }
    const sortOrder = modes.reduce((max, m) => Math.max(max, m.sortOrder), -1) + 1;
    return await ctx.db.insert("InterviewModeTable", {
      value: args.value,
      label: args.label,
      sortOrder,
      createdAt: Date.now(),
    });
  },
});

export const RemoveInterviewMode = mutation({
  args: { token: v.string(), id: v.id("InterviewModeTable") },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await ctx.db.delete(args.id);
  },
});
