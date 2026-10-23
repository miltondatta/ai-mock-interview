import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { sanitizeCandidateText } from "@/utils/sanitizeText";
import { getLibraryResume } from "@/utils/resumeLibrary";
import type { ResumeMatchAnalysis } from "@/utils/resumeMatchAnalysis";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Mirrors the limits enforced by app/api/resume-match/analyze.
const MAX_JOB_TITLE_LENGTH = 200;
const MAX_JOB_DESCRIPTION_LENGTH = 10000;
const MAX_URL_LENGTH = 2048;
// A normalized analysis is a few KB - anything far larger isn't one.
const MAX_ANALYSIS_BYTES = 200 * 1024;

function badRequest(error: string) {
    return NextResponse.json({ error }, { status: 400 });
}

// Loose shape check on the analysis the analyze route returned to the page.
function isAnalysis(value: unknown): value is ResumeMatchAnalysis {
    if (!value || typeof value !== "object") return false;
    const a = value as Record<string, unknown>;
    return typeof a.jobTitle === "string"
        && (a.overallScore === null || typeof a.overallScore === "number")
        && Array.isArray(a.categoryScores)
        && Array.isArray(a.requirements)
        && Array.isArray(a.matchedSkills)
        && Array.isArray(a.missingSkills)
        && Array.isArray(a.unclearSkills)
        && Array.isArray(a.recommendations);
}

// Saves a Resume Match Analyzer result to the candidate's history, only when
// they choose "Save Analysis". The analyze route itself stores nothing.
export async function POST(req: NextRequest) {
    const user = await currentUser();
    if (!user) {
        return NextResponse.json({ error: "You must be logged in to save an analysis." }, { status: 401 });
    }
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const convexUser = await convexClient.query(api.users.GetUserByEmail, { email });
    if (!convexUser) {
        return NextResponse.json({ error: "You must be logged in to save an analysis." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
        return badRequest("Invalid request.");
    }

    const resumeId = typeof body.resumeId === "string" ? body.resumeId : "";
    const mode = body.mode === "url" ? "url" : "text";
    const jobTitle = sanitizeCandidateText(body.jobTitle, { singleLine: true });
    const jobDescription = mode === "text" ? sanitizeCandidateText(body.jobDescription) : "";
    const jobDescriptionUrl = mode === "url" ? sanitizeCandidateText(body.jobDescriptionUrl, { singleLine: true }) : "";
    const lang = typeof body.lang === "string" && /^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})?$/.test(body.lang) ? body.lang : "en";
    const analysis: unknown = body.analysis;

    if (!resumeId) return badRequest("The resume for this analysis is missing.");
    if (!jobTitle || jobTitle.length > MAX_JOB_TITLE_LENGTH) return badRequest("The job title for this analysis is invalid.");
    if (jobDescription.length > MAX_JOB_DESCRIPTION_LENGTH || jobDescriptionUrl.length > MAX_URL_LENGTH) {
        return badRequest("The job description for this analysis is too long.");
    }
    if (!isAnalysis(analysis) || JSON.stringify(analysis).length > MAX_ANALYSIS_BYTES) {
        return badRequest("This analysis can't be saved. Please run the analysis again.");
    }

    const resume = await getLibraryResume(convexClient, convexUser._id, resumeId);
    if (!resume) {
        return NextResponse.json({ error: "The resume used for this analysis could not be found." }, { status: 404 });
    }

    try {
        const saved = await convexClient.mutation(api.ResumeMatch.SaveResumeMatchAnalysis, {
            userId: convexUser._id,
            resumeId,
            resumeUrl: resume.fileUrl,
            resumeFileName: resume.fileName,
            jobTitle,
            jobDescription: jobDescription || undefined,
            jobDescriptionUrl: jobDescriptionUrl || undefined,
            lang,
            analysis,
        });
        return NextResponse.json({ analysisId: saved.id, createdAt: saved.createdAt });
    } catch (e) {
        console.error("Failed to save resume match analysis:", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: "Unable to save this analysis. Please try again." }, { status: 500 });
    }
}
