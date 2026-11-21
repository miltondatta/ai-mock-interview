import type { Doc } from "./_generated/dataModel";

// Shared, dependency-free home for the two small profile-derived functions
// that BOTH convex/ProfessionalProfile.ts and convex/jobDiscovery.ts need:
// computeProfileCompletion() (originally defined in ProfessionalProfile.ts)
// and computeProfileVersion() (originally defined in jobDiscovery.ts, D3).
//
// Why this file exists: those two functions used to import each other
// directly (jobDiscovery.ts imported computeProfileCompletion from
// ProfessionalProfile.ts; ProfessionalProfile.ts imported
// computeProfileVersion from jobDiscovery.ts), which created a circular
// import between the two modules. That cycle was reasoned at the time to be
// RUNTIME-safe (neither side calls the other's export until deep inside an
// async handler, long after both modules finish loading) - and it is. But a
// production `next build` surfaced a real, separate cost of that cycle: when
// Convex's generated convex/_generated/api.d.ts builds one combined type
// over every module (`import type * as jobDiscovery from "../jobDiscovery.js"`,
// `import type * as ProfessionalProfile from "../ProfessionalProfile.js"`,
// then a single mapped type across all of them), resolving `jobDiscovery`'s
// module type required resolving `ProfessionalProfile`'s module type (because
// of the import), which required resolving `jobDiscovery`'s module type again
// - a genuine circular TYPE dependency, not just a value one. TypeScript's
// fallback for a type it cannot fully resolve is to widen it to `any`,
// silently - no error is reported at the cycle itself, but that `any` then
// propagates through `useQuery(...)` into every consumer, turning their
// `.map()`/destructuring callback parameters into exactly the kind of
// "implicitly has an 'any' type" errors seen three times in a row across
// unrelated-looking files (InterviewOptions.tsx, JobsForYou.tsx) once this
// project's query surface grew enough to depend on it.
//
// The fix is structural, not another per-call-site annotation: both
// functions live here instead, in a module that imports from neither
// ProfessionalProfile.ts nor jobDiscovery.ts, so there is no cycle for
// Convex's generated types to walk into. Both of those files now import
// from here instead of from each other.

type ProfileDoc = Doc<"UserProfileTable">;

// --- Profile completion (moved from convex/ProfessionalProfile.ts) -------------

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

// --- Profile version fingerprint (moved from convex/jobDiscovery.ts, D3) -------
//
// A plain, deterministic fingerprint - NOT a cryptographic hash - of exactly
// the profile fields convex/jobMatching.ts's matchJob() and
// computeProfileCompletion() (above) actually read. A non-cryptographic hash
// is deliberate and sufficient: this value is only ever used to answer "did
// anything matching-relevant change since last time," never for anything
// security-sensitive. It is implemented as plain arithmetic over character
// codes (two independent FNV-1a-style passes, concatenated) rather than
// Node's `crypto` module, because this function is called from Convex
// internalMutations/mutations, which execute in Convex's default
// (non-"use node") runtime.
//
// workExperience is intentionally read in its STORED ORDER and limited to
// the first 3 entries - exactly mirroring matchJob()'s scoreTitle(), which
// only ever looks at `(p.workExperience ?? []).slice(0, 3)` in array order.
// Reordering work experience can change which 3 entries scoreTitle sees, so
// this must NOT be sorted. Every other list below only affects set-membership
// or substring checks in matchJob(), never list order, so each one is
// sorted before hashing - this avoids an unnecessary version bump (and so an
// unnecessary recompute) when a candidate merely reorders skills/projects/
// certifications/education without changing their content.
function fnv1a(input: string, seed: number): string {
    let hash = seed;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        // 32-bit FNV prime multiplication, kept in 32-bit range via >>> 0.
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

export function computeProfileVersion(profile: Partial<ProfileDoc> | null): string {
    const relevant = {
        targetJobRole: profile?.targetJobRole ?? null,
        headline: profile?.headline ?? null,
        bio: profile?.bio ?? null,
        yearsOfExperience: profile?.yearsOfExperience ?? null,
        location: profile?.location ?? null,
        targetCompany: profile?.targetCompany ?? null,
        // Order-sensitive - see comment above. Position only, first 3, as-stored.
        recentPositions: (profile?.workExperience ?? []).slice(0, 3).map((w) => w.position),
        // Order-insensitive below - sorted for a stable fingerprint.
        skills: [...(profile?.skills ?? [])].sort(),
        certificationNames: (profile?.certifications ?? []).map((c) => c.name).sort(),
        projectTexts: (profile?.projects ?? []).map((p) => `${p.title}\u0000${p.description ?? ""}`).sort(),
        educationDegrees: (profile?.education ?? []).map((e) => e.degree ?? "").sort(),
    };
    const serialized = JSON.stringify(relevant);
    return `${fnv1a(serialized, 0x811c9dc5)}${fnv1a(serialized, 0x12345679)}`;
}
