import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
    PROFILE_USER_INTENT,
    profileCertificationValidator,
    profileEducationValidator,
    profileProjectValidator,
    profileWorkExperienceValidator,
} from "./schema";

// Professional Profile + User Onboarding backend (M1).
//
// Storage: UserProfileTable is extended in place rather than adding a second
// profile table, so Settings > Profile (convex/UserProfile.ts) and this module
// read and write the same row. There is one row per user, found through the
// by_user index. Convex mutations are serializable transactions, so the
// "look up, then insert if missing" pattern below can't create a duplicate.
//
// Ownership: as in the rest of the app, the client resolves its own
// UserTable id from the Clerk session (app/Provider.tsx), and server routes
// resolve it with currentUser() + users.GetUserByEmail (see
// app/api/profile/*). Every function here only reads or writes the row whose
// userId matches the caller's userId. No function accepts a profile document
// id, so there's no id that could reach another user's row. If Convex is ever
// set up to verify Clerk JWTs (auth.config.ts), assertCaller also checks that
// the verified identity's email matches the user row.
//
// Partial updates: an omitted argument (undefined) leaves the field as it is.
// An empty string or empty array clears a text or list field, and null clears
// yearsOfExperience or resumeId.

type ProfileDoc = Doc<'UserProfileTable'>;
type ProfilePatch = Partial<Omit<ProfileDoc, '_id' | '_creationTime'>>;
type WorkExperience = Infer<typeof profileWorkExperienceValidator>;
type Education = Infer<typeof profileEducationValidator>;
type Certification = Infer<typeof profileCertificationValidator>;
type Project = Infer<typeof profileProjectValidator>;

// --- Limits -----------------------------------------------------------------
const MAX_SHORT_TEXT = 200;
const MAX_LONG_TEXT = 5000;
const MAX_URL = 500;
const MAX_WORK_EXPERIENCE = 30;
const MAX_EDUCATION = 20;
const MAX_SKILLS = 100;
const MAX_SKILL_LENGTH = 60;
const MAX_CERTIFICATIONS = 50;
const MAX_PROJECTS = 50;
const MAX_RESPONSIBILITIES = 30;
const MAX_YEARS_OF_EXPERIENCE = 60;
const MIN_YEAR = 1950;
const MAX_ONBOARDING_STEP = 5;

// --- Argument validators ----------------------------------------------------
const onboardingArgs = {
    userIntent: v.optional(PROFILE_USER_INTENT),
    targetJobRole: v.optional(v.string()),
    yearsOfExperience: v.optional(v.union(v.number(), v.null())),
    targetCompany: v.optional(v.string()),
    interviewTimeline: v.optional(v.string()),
    interviewDate: v.optional(v.union(v.string(), v.null())),
    weeklyAvailability: v.optional(v.string()),
    referralSource: v.optional(v.string()),
};

const professionalArgs = {
    headline: v.optional(v.string()),
    location: v.optional(v.string()),
    phone: v.optional(v.string()),
    // Stored in the existing `bio` column (see schema comment).
    professionalSummary: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    githubUrl: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    // Kept for parity with Settings > Profile.
    experienceLevel: v.optional(v.string()),
    workExperience: v.optional(v.array(profileWorkExperienceValidator)),
    education: v.optional(v.array(profileEducationValidator)),
    skills: v.optional(v.array(v.string())),
    certifications: v.optional(v.array(profileCertificationValidator)),
    projects: v.optional(v.array(profileProjectValidator)),
    // A resume library id (as listed by Resumes.GetUserResumes) or null to unlink.
    resumeId: v.optional(v.union(v.string(), v.null())),
};

type OnboardingInput = {
    userIntent?: Infer<typeof PROFILE_USER_INTENT>;
    targetJobRole?: string;
    yearsOfExperience?: number | null;
    targetCompany?: string;
    interviewTimeline?: string;
    interviewDate?: string | null;
    weeklyAvailability?: string;
    referralSource?: string;
};

type ProfessionalInput = {
    headline?: string;
    location?: string;
    phone?: string;
    professionalSummary?: string;
    linkedinUrl?: string;
    githubUrl?: string;
    websiteUrl?: string;
    experienceLevel?: string;
    workExperience?: WorkExperience[];
    education?: Education[];
    skills?: string[];
    certifications?: Certification[];
    projects?: Project[];
    resumeId?: string | null;
};

// --- Ownership --------------------------------------------------------------

// Loads the caller's user row. Returns null when the user doesn't exist, or
// when a verified Convex identity belongs to someone else.
async function resolveCaller(ctx: QueryCtx, userId: Id<'UserTable'>): Promise<Doc<'UserTable'> | null> {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const identity = await ctx.auth.getUserIdentity();
    if (identity?.email && user.email && identity.email.toLowerCase() !== user.email.toLowerCase()) {
        return null;
    }
    return user;
}

async function assertCaller(ctx: QueryCtx, userId: Id<'UserTable'>): Promise<Doc<'UserTable'>> {
    const user = await resolveCaller(ctx, userId);
    if (!user) throw new Error("User not found.");
    return user;
}

async function getProfileRow(ctx: QueryCtx, userId: Id<'UserTable'>): Promise<ProfileDoc | null> {
    // If old rows were duplicated by an earlier filter-based upsert, .first()
    // returns the oldest one, the same row UserProfile.GetUserProfile returns.
    return await ctx.db
        .query('UserProfileTable')
        .withIndex('by_user', q => q.eq('userId', userId))
        .first();
}

// --- Normalization / validation ---------------------------------------------

// Trims a string and checks its length. An empty result returns undefined,
// which clears the field when it's patched.
function cleanText(value: string, label: string, max: number): string | undefined {
    const trimmed = value.trim();
    if (trimmed.length > max) throw new Error(`${label} must be at most ${max} characters.`);
    return trimmed.length > 0 ? trimmed : undefined;
}

function requireText(value: string, label: string, max: number): string {
    const cleaned = cleanText(value, label, max);
    if (!cleaned) throw new Error(`${label} is required.`);
    return cleaned;
}

function cleanUrl(value: string, label: string): string | undefined {
    const trimmed = cleanText(value, label, MAX_URL);
    if (!trimmed) return undefined;
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    let parsed: URL;
    try {
        parsed = new URL(withScheme);
    } catch {
        throw new Error(`${label} is not a valid URL.`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`${label} must be an http(s) URL.`);
    }
    if (!parsed.hostname.includes('.')) throw new Error(`${label} is not a valid URL.`);
    return withScheme;
}

function cleanPhone(value: string): string | undefined {
    const trimmed = cleanText(value, 'Phone', 40);
    if (!trimmed) return undefined;
    if (!/^[+0-9()\-.\s]{5,40}$/.test(trimmed)) throw new Error("Phone number contains invalid characters.");
    return trimmed;
}

function cleanYear(value: number | undefined, label: string): number | undefined {
    if (value === undefined) return undefined;
    const maxYear = new Date().getFullYear() + 10;
    if (!Number.isInteger(value) || value < MIN_YEAR || value > maxYear) {
        throw new Error(`${label} must be a year between ${MIN_YEAR} and ${maxYear}.`);
    }
    return value;
}

// Accepts "YYYY" or "YYYY-MM".
function cleanMonth(value: string | undefined, label: string): string | undefined {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (!/^\d{4}(-(0[1-9]|1[0-2]))?$/.test(trimmed)) throw new Error(`${label} must be in YYYY or YYYY-MM format.`);
    return trimmed;
}

// Only meaningful alongside interviewTimeline === "have_date" - a value
// submitted with any other timeline (or with none) is rejected rather than
// silently stored. `today` is the candidate's own local "YYYY-MM-DD" (the
// server can't know their timezone), so a date earlier than that is rejected.
function cleanInterviewDate(value: string | null | undefined, timeline: string | undefined, today: string | undefined): string | undefined {
    if (value === undefined) return undefined;
    if (value === null) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) throw new Error("Interview date must be a valid date.");
    if (timeline !== "have_date") throw new Error('Interview date can only be set when the interview timeline is "I have a date".');
    if (today && trimmed < today) throw new Error("Interview date can't be in the past.");
    return trimmed;
}

function cleanYearsOfExperience(value: number): number {
    if (!Number.isFinite(value) || value < 0 || value > MAX_YEARS_OF_EXPERIENCE) {
        throw new Error(`Years of experience must be between 0 and ${MAX_YEARS_OF_EXPERIENCE}.`);
    }
    return Math.round(value * 10) / 10;
}

function capList<T>(items: T[], max: number, label: string): T[] {
    if (items.length > max) throw new Error(`You can add at most ${max} ${label}.`);
    return items;
}

// Entries that are completely blank (e.g. an empty row the UI added) are
// dropped. An entry with some content but no required field is rejected.
function cleanWorkExperience(items: WorkExperience[]): WorkExperience[] {
    const result: WorkExperience[] = [];
    for (const item of items) {
        const responsibilities = (item.responsibilities ?? [])
            .map(r => cleanText(r, 'Responsibility', 1000))
            .filter((r): r is string => !!r);
        const entry: WorkExperience = {
            position: item.position.trim(),
            company: item.company.trim(),
            startDate: cleanMonth(item.startDate, 'Start date'),
            endDate: item.isCurrent ? undefined : cleanMonth(item.endDate, 'End date'),
            isCurrent: item.isCurrent || undefined,
            duration: cleanText(item.duration ?? '', 'Duration', 100),
            responsibilities: responsibilities.length > 0 ? capList(responsibilities, MAX_RESPONSIBILITIES, 'responsibilities per role') : undefined,
        };
        const isBlank = !entry.position && !entry.company && !entry.startDate && !entry.endDate && !entry.duration && !entry.responsibilities;
        if (isBlank) continue;
        entry.position = requireText(entry.position, 'Work experience position', MAX_SHORT_TEXT);
        entry.company = requireText(entry.company, 'Work experience company', MAX_SHORT_TEXT);
        if (entry.startDate && entry.endDate && entry.endDate < entry.startDate) {
            throw new Error(`End date for ${entry.position} at ${entry.company} is before its start date.`);
        }
        result.push(stripUndefined(entry));
    }
    return capList(result, MAX_WORK_EXPERIENCE, 'work experience entries');
}

function cleanEducation(items: Education[]): Education[] {
    const result: Education[] = [];
    for (const item of items) {
        const entry: Education = {
            institution: item.institution.trim(),
            degree: cleanText(item.degree ?? '', 'Degree', MAX_SHORT_TEXT),
            fieldOfStudy: cleanText(item.fieldOfStudy ?? '', 'Field of study', MAX_SHORT_TEXT),
            graduationYear: cleanYear(item.graduationYear, 'Graduation year'),
        };
        if (!entry.institution && !entry.degree && !entry.fieldOfStudy && entry.graduationYear === undefined) continue;
        entry.institution = requireText(entry.institution, 'Education institution', MAX_SHORT_TEXT);
        result.push(stripUndefined(entry));
    }
    return capList(result, MAX_EDUCATION, 'education entries');
}

// Trims skills and removes case-insensitive duplicates, keeping the first spelling.
function cleanSkills(items: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of items) {
        const skill = cleanText(raw, 'Skill', MAX_SKILL_LENGTH);
        if (!skill) continue;
        const key = skill.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(skill);
    }
    return capList(result, MAX_SKILLS, 'skills');
}

function cleanCertifications(items: Certification[]): Certification[] {
    const result: Certification[] = [];
    for (const item of items) {
        const entry: Certification = {
            name: item.name.trim(),
            issuer: cleanText(item.issuer ?? '', 'Certification issuer', MAX_SHORT_TEXT),
            year: cleanYear(item.year, 'Certification year'),
            credentialUrl: cleanUrl(item.credentialUrl ?? '', 'Credential URL'),
        };
        if (!entry.name && !entry.issuer && entry.year === undefined && !entry.credentialUrl) continue;
        entry.name = requireText(entry.name, 'Certification name', MAX_SHORT_TEXT);
        result.push(stripUndefined(entry));
    }
    return capList(result, MAX_CERTIFICATIONS, 'certifications');
}

function cleanProjects(items: Project[]): Project[] {
    const result: Project[] = [];
    for (const item of items) {
        const entry: Project = {
            title: item.title.trim(),
            description: cleanText(item.description ?? '', 'Project description', MAX_LONG_TEXT),
            url: cleanUrl(item.url ?? '', 'Project URL'),
        };
        if (!entry.title && !entry.description && !entry.url) continue;
        entry.title = requireText(entry.title, 'Project title', MAX_SHORT_TEXT);
        result.push(stripUndefined(entry));
    }
    return capList(result, MAX_PROJECTS, 'projects');
}

function stripUndefined<T extends object>(obj: T): T {
    return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as T;
}

// An empty list is stored as "field absent" so it reads the same as never-set.
function listOrUndefined<T>(items: T[]): T[] | undefined {
    return items.length > 0 ? items : undefined;
}

// Builds a patch from only the onboarding arguments that were passed.
// `existingTimeline`/`today` are only needed to validate interviewDate: the
// timeline it depends on may already be stored rather than part of this
// call, and "in the past" is judged against the candidate's own local date.
function buildOnboardingPatch(args: OnboardingInput, existingTimeline: string | undefined, today: string | undefined): ProfilePatch {
    const patch: ProfilePatch = {};
    if (args.userIntent !== undefined) patch.userIntent = args.userIntent;
    if (args.targetJobRole !== undefined) patch.targetJobRole = cleanText(args.targetJobRole, 'Target job role', MAX_SHORT_TEXT);
    if (args.yearsOfExperience !== undefined) {
        patch.yearsOfExperience = args.yearsOfExperience === null ? undefined : cleanYearsOfExperience(args.yearsOfExperience);
    }
    if (args.targetCompany !== undefined) patch.targetCompany = cleanText(args.targetCompany, 'Target company', MAX_SHORT_TEXT);
    if (args.interviewTimeline !== undefined) {
        patch.interviewTimeline = cleanText(args.interviewTimeline, 'Interview timeline', 100);
        // Switching away from "have_date" clears a stale date even if the
        // client didn't explicitly send interviewDate for this call.
        if (patch.interviewTimeline !== 'have_date' && args.interviewDate === undefined) patch.interviewDate = undefined;
    }
    if (args.interviewDate !== undefined) {
        const effectiveTimeline = args.interviewTimeline !== undefined ? patch.interviewTimeline : existingTimeline;
        patch.interviewDate = cleanInterviewDate(args.interviewDate, effectiveTimeline, today);
    }
    if (args.weeklyAvailability !== undefined) patch.weeklyAvailability = cleanText(args.weeklyAvailability, 'Weekly availability', 100);
    if (args.referralSource !== undefined) patch.referralSource = cleanText(args.referralSource, 'Referral source', MAX_SHORT_TEXT);
    return patch;
}

// Builds a patch from only the professional arguments that were passed. The
// resume is checked against the caller's library before it's linked.
async function buildProfessionalPatch(ctx: MutationCtx, userId: Id<'UserTable'>, args: ProfessionalInput): Promise<ProfilePatch> {
    const patch: ProfilePatch = {};
    if (args.headline !== undefined) patch.headline = cleanText(args.headline, 'Headline', MAX_SHORT_TEXT);
    if (args.location !== undefined) patch.location = cleanText(args.location, 'Location', MAX_SHORT_TEXT);
    if (args.phone !== undefined) patch.phone = cleanPhone(args.phone);
    if (args.professionalSummary !== undefined) patch.bio = cleanText(args.professionalSummary, 'Professional summary', MAX_LONG_TEXT);
    if (args.linkedinUrl !== undefined) patch.linkedinUrl = cleanUrl(args.linkedinUrl, 'LinkedIn URL');
    if (args.githubUrl !== undefined) patch.githubUrl = cleanUrl(args.githubUrl, 'GitHub URL');
    if (args.websiteUrl !== undefined) patch.websiteUrl = cleanUrl(args.websiteUrl, 'Website URL');
    if (args.experienceLevel !== undefined) patch.experienceLevel = cleanText(args.experienceLevel, 'Experience level', 50);
    if (args.workExperience !== undefined) patch.workExperience = listOrUndefined(cleanWorkExperience(args.workExperience));
    if (args.education !== undefined) patch.education = listOrUndefined(cleanEducation(args.education));
    if (args.skills !== undefined) patch.skills = listOrUndefined(cleanSkills(args.skills));
    if (args.certifications !== undefined) patch.certifications = listOrUndefined(cleanCertifications(args.certifications));
    if (args.projects !== undefined) patch.projects = listOrUndefined(cleanProjects(args.projects));
    if (args.resumeId !== undefined) {
        if (args.resumeId === null) {
            patch.resumeId = undefined;
            patch.resumeLinkedAt = undefined;
        } else {
            const resumeId = await findOwnedResumeId(ctx, userId, args.resumeId);
            if (!resumeId) throw new Error("Resume not found.");
            patch.resumeId = resumeId;
            patch.resumeLinkedAt = Date.now();
        }
    }
    return patch;
}

// Same ownership rule as convex/Resumes.ts: a resume belongs to a user only if
// UserResumeTable maps it to them.
async function findOwnedResumeId(ctx: QueryCtx, userId: Id<'UserTable'>, resumeId: string): Promise<Id<'ResumeTable'> | null> {
    const id = ctx.db.normalizeId('ResumeTable', resumeId);
    if (!id) return null;
    const mapping = await ctx.db
        .query('UserResumeTable')
        .withIndex('by_user_resume', q => q.eq('userId', userId).eq('resumeId', id))
        .first();
    return mapping ? id : null;
}

// --- Completion -------------------------------------------------------------

export type ProfileCompletionField = 'headline' | 'professionalSummary' | 'location' | 'skills' | 'experienceOrEducation';

export interface ProfileCompletion {
    isComplete: boolean;
    // Share of the required sections that are filled in, 0-100.
    percent: number;
    missing: ProfileCompletionField[];
}

// The professional profile is complete only when these core sections are
// filled. Onboarding answers don't count, so a user who has only finished
// onboarding is never treated as having a complete profile. A fresher can
// meet the experience requirement with education alone.
export function computeProfileCompletion(profile: Partial<ProfileDoc> | null): ProfileCompletion {
    const checks: [ProfileCompletionField, boolean][] = [
        ['headline', !!profile?.headline],
        ['professionalSummary', !!profile?.bio],
        ['location', !!profile?.location],
        ['skills', (profile?.skills?.length ?? 0) > 0],
        ['experienceOrEducation', (profile?.workExperience?.length ?? 0) > 0 || (profile?.education?.length ?? 0) > 0],
    ];
    const missing = checks.filter(([, ok]) => !ok).map(([field]) => field);
    return {
        isComplete: missing.length === 0,
        percent: Math.round(((checks.length - missing.length) / checks.length) * 100),
        missing,
    };
}

// Fields to add to a patch so the stored completion flag matches `merged`.
// profileCompletedAt keeps the first time the profile became complete, and
// is cleared if the profile becomes incomplete again.
function completionPatch(existing: ProfileDoc | null, merged: Partial<ProfileDoc>): ProfilePatch {
    const { isComplete } = computeProfileCompletion(merged);
    if (isComplete) {
        return { profileCompleted: true, profileCompletedAt: existing?.profileCompletedAt ?? Date.now() };
    }
    return { profileCompleted: false, profileCompletedAt: undefined };
}

// Applies a patch to the caller's row, inserting the row if it's missing.
// Returns the row id and whether a new row was created.
async function upsertProfile(
    ctx: MutationCtx,
    userId: Id<'UserTable'>,
    existing: ProfileDoc | null,
    patch: ProfilePatch
): Promise<{ profileId: Id<'UserProfileTable'>; created: boolean }> {
    const now = Date.now();
    if (existing) {
        await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
        return { profileId: existing._id, created: false };
    }
    const doc = stripUndefined({
        onboardingStatus: 'not_started' as const,
        ...patch,
        userId,
        createdAt: now,
        updatedAt: now,
    });
    const profileId = await ctx.db.insert('UserProfileTable', doc);
    return { profileId, created: true };
}

// --- Public shape -----------------------------------------------------------

export interface ProfileResumeSummary {
    id: Id<'ResumeTable'>;
    fileName: string;
    fileType: string;
    fileSize?: number;
    uploadedAt: number;
    hasImageKitFile: boolean;
}

// Resolves the linked resume from the shared library. Returns null if it was
// removed from the user's library since it was linked. As in
// Resumes.GetUserResumes, the file URL is left out. Server routes get it with
// Resumes.GetUserResume, which checks ownership.
async function resolveLinkedResume(ctx: QueryCtx, profile: ProfileDoc): Promise<ProfileResumeSummary | null> {
    if (!profile.resumeId) return null;
    const ownedId = await findOwnedResumeId(ctx, profile.userId, profile.resumeId);
    if (!ownedId) return null;
    const resume = await ctx.db.get(ownedId);
    if (!resume) return null;
    return {
        id: resume._id,
        fileName: resume.fileName,
        fileType: resume.fileType,
        fileSize: resume.fileSize,
        uploadedAt: resume.uploadedAt,
        hasImageKitFile: !!resume.imagekitFileId,
    };
}

function onboardingStatusOf(profile: ProfileDoc | null) {
    return profile?.onboardingStatus ?? 'not_started';
}

// --- Queries ----------------------------------------------------------------

// The caller's full professional profile, or null when they haven't created
// one yet (or the user can't be resolved). `completion` is computed live from
// the stored fields, so it stays accurate even after Settings > Profile edits
// that don't update the stored `profileCompleted` flag.
export const GetMyProfile = query({
    args: {
        userId: v.id('UserTable'),
    },
    handler: async (ctx, args) => {
        const user = await resolveCaller(ctx, args.userId);
        if (!user) return null;
        const profile = await getProfileRow(ctx, args.userId);
        if (!profile) return null;
        const { bio, ...rest } = profile;
        return {
            ...rest,
            professionalSummary: bio,
            onboardingStatus: onboardingStatusOf(profile),
            resume: await resolveLinkedResume(ctx, profile),
            completion: computeProfileCompletion(profile),
        };
    }
});

// Lightweight status for routing decisions, e.g. whether to send the user to
// onboarding. Returns a "not started" result rather than null when there's no
// profile.
export const GetOnboardingStatus = query({
    args: {
        userId: v.id('UserTable'),
    },
    handler: async (ctx, args) => {
        const user = await resolveCaller(ctx, args.userId);
        const profile = user ? await getProfileRow(ctx, args.userId) : null;
        const status = onboardingStatusOf(profile);
        return {
            hasProfile: !!profile,
            status,
            isOnboardingComplete: status === 'completed',
            onboardingCompletedAt: profile?.onboardingCompletedAt ?? null,
            onboardingStep: profile?.onboardingStep ?? 0,
            userIntent: profile?.userIntent ?? null,
            isProfileComplete: computeProfileCompletion(profile).isComplete,
            profileCompletionPercent: computeProfileCompletion(profile).percent,
            profilePromptDismissed: !!profile?.profilePromptDismissedAt,
            // Raw timestamp. The client compares it with the current time,
            // because a query result doesn't refresh as time passes.
            profilePromptDismissedAt: profile?.profilePromptDismissedAt ?? null,
        };
    }
});

// --- Mutations --------------------------------------------------------------

// Creates the caller's profile. Safe to call more than once: if a row already
// exists (for example one created by Settings > Profile), nothing changes and
// that row's id comes back with created: false. Use UpdateProfile to change it.
export const CreateProfile = mutation({
    args: {
        userId: v.id('UserTable'),
        ...onboardingArgs,
        ...professionalArgs,
        // The caller's own local "YYYY-MM-DD", only used to validate interviewDate.
        clientToday: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const { userId, clientToday, ...input } = args;
        await assertCaller(ctx, userId);
        const existing = await getProfileRow(ctx, userId);
        const existingTimeline = existing?.interviewTimeline;
        if (existing) return { profileId: existing._id, created: false };

        const onboardingPatch = buildOnboardingPatch(input, existingTimeline, clientToday);
        const patch: ProfilePatch = {
            ...onboardingPatch,
            ...(await buildProfessionalPatch(ctx, userId, input)),
        };
        if (Object.keys(onboardingPatch).length > 0) patch.onboardingStatus = 'in_progress';
        Object.assign(patch, completionPatch(null, patch));
        return await upsertProfile(ctx, userId, null, patch);
    }
});

// Partial update of the professional sections. Only the arguments passed are
// changed and everything else on the row is kept. If the row is missing it's
// created. The stored completion flag is recalculated on every save.
export const UpdateProfile = mutation({
    args: {
        userId: v.id('UserTable'),
        ...professionalArgs,
    },
    handler: async (ctx, args) => {
        const { userId, ...input } = args;
        await assertCaller(ctx, userId);
        const existing = await getProfileRow(ctx, userId);
        const patch = await buildProfessionalPatch(ctx, userId, input);
        Object.assign(patch, completionPatch(existing, { ...(existing ?? {}), ...patch }));
        return await upsertProfile(ctx, userId, existing, patch);
    }
});

// Saves onboarding answers, in full or in part. Any save moves the status
// from not_started to in_progress. Passing markCompleted: true finishes
// onboarding, but only when the answers it depends on are present. Editing
// answers later doesn't reopen a completed onboarding. Onboarding never
// changes the professional profile's completion flag.
export const SaveOnboarding = mutation({
    args: {
        userId: v.id('UserTable'),
        ...onboardingArgs,
        markCompleted: v.optional(v.boolean()),
        // Wizard screen to resume at (0 = intent screen, 1-5 = numbered steps).
        currentStep: v.optional(v.number()),
        // The candidate's own local "YYYY-MM-DD", only used to validate interviewDate.
        clientToday: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const { userId, markCompleted, currentStep, clientToday, ...input } = args;
        await assertCaller(ctx, userId);
        const existing = await getProfileRow(ctx, userId);
        const patch = buildOnboardingPatch(input, existing?.interviewTimeline, clientToday);
        const merged = { ...(existing ?? {}), ...patch };
        if (currentStep !== undefined) {
            if (!Number.isInteger(currentStep) || currentStep < 0 || currentStep > MAX_ONBOARDING_STEP) {
                throw new Error("Invalid onboarding step.");
            }
            patch.onboardingStep = currentStep;
        }

        if (markCompleted) {
            // Only the intent is required. The other steps can be skipped in
            // the wizard (M2), so they can't be required here.
            if (!merged.userIntent) throw new Error("Please choose what you'd like to use the app for.");
            patch.onboardingStatus = 'completed';
            patch.onboardingCompletedAt = existing?.onboardingCompletedAt ?? Date.now();
        } else if (onboardingStatusOf(existing) !== 'completed') {
            patch.onboardingStatus = 'in_progress';
        }

        const result = await upsertProfile(ctx, userId, existing, patch);
        return { ...result, onboardingStatus: patch.onboardingStatus ?? onboardingStatusOf(existing) };
    }
});

// "Skip for Now" on the post-signup welcome screen (M5), or "Maybe Later" on
// the dashboard profile invitation (M6). Records when the user last postponed
// set-up. The dashboard hides the full invitation for a while after this
// timestamp and then shows it again until the profile is complete (M6
// policy), so each dismissal moves the timestamp forward. Onboarding status,
// answers and profile completion are left as they are, so dismissing never
// counts as completing anything. Creates the row if it's missing (one per user).
export const DismissProfilePrompt = mutation({
    args: {
        userId: v.id('UserTable'),
    },
    handler: async (ctx, args) => {
        await assertCaller(ctx, args.userId);
        const existing = await getProfileRow(ctx, args.userId);
        return await upsertProfile(ctx, args.userId, existing, { profilePromptDismissedAt: Date.now() });
    }
});

// Recalculates the stored profileCompleted flag from the profile's data and
// saves it. The client can't set the flag directly, so a partly filled
// profile can't be marked complete. Use this after edits made outside
// UpdateProfile, such as Settings > Profile. Returns null if there's no profile.
export const UpdateProfileCompletionStatus = mutation({
    args: {
        userId: v.id('UserTable'),
    },
    handler: async (ctx, args) => {
        await assertCaller(ctx, args.userId);
        const existing = await getProfileRow(ctx, args.userId);
        if (!existing) return null;
        const patch = completionPatch(existing, existing);
        const changed =
            patch.profileCompleted !== existing.profileCompleted ||
            patch.profileCompletedAt !== existing.profileCompletedAt;
        if (changed) await ctx.db.patch(existing._id, { ...patch, updatedAt: Date.now() });
        return computeProfileCompletion(existing);
    }
});
