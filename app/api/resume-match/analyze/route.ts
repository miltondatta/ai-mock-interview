import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { sanitizeCandidateText } from "@/utils/sanitizeText";
import { getLibraryResume } from "@/utils/resumeLibrary";
import { normalizeResumeMatchResponse, ResumeMatchResponseError } from "@/utils/resumeMatchAnalysis";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const RESUME_MATCH_WEBHOOK_URL = "https://n8n.vistechsolutions.online/webhook/resume-job-match";

// Two sequential Gemini calls in n8n - match the raised proxy timeout used by
// the other N8N-backed routes.
export const maxDuration = 300;

const MAX_JOB_TITLE_LENGTH = 200;
// The workflow's Validate Inputs node rejects job text shorter than this.
const MIN_JOB_DESCRIPTION_LENGTH = 100;
const MAX_JOB_DESCRIPTION_LENGTH = 10000;
const MAX_URL_LENGTH = 2048;

// n8n fetches the job URL itself, so keep it to public http(s) addresses.
function isAllowedJobUrl(value: string): boolean {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return false;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
    // IPv6 literals: loopback, unique-local (fc00::/7) and link-local (fe80::/10).
    if (host.includes(":") && (host === "::1" || /^(fc|fd|fe[89ab])/.test(host))) return false;
    const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4) {
        const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
        if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
            return false;
        }
    }
    return true;
}

function badRequest(error: string) {
    return NextResponse.json({ error }, { status: 400 });
}

export async function POST(req: NextRequest) {
    const user = await currentUser();
    if (!user) {
        return NextResponse.json({ error: "You must be logged in to analyze a resume." }, { status: 401 });
    }
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const convexUser = await convexClient.query(api.users.GetUserByEmail, { email });
    if (!convexUser) {
        return NextResponse.json({ error: "You must be logged in to analyze a resume." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
        return badRequest("Invalid request.");
    }

    const resumeId = typeof body.resumeId === "string" ? body.resumeId : "";
    const mode = body.mode === "url" ? "url" : "text";
    // Candidates paste job posts from anywhere (job boards, Word/PDF, HTML,
    // Markdown, email) - normalize to clean plain text before it reaches n8n.
    const jobTitle = sanitizeCandidateText(body.jobTitle, { singleLine: true });
    const jobDescription = mode === "text" ? sanitizeCandidateText(body.jobDescription) : "";
    const jobDescriptionUrl = mode === "url" ? sanitizeCandidateText(body.jobDescriptionUrl, { singleLine: true }) : "";

    if (!resumeId) return badRequest("Please select a resume to analyze.");
    if (!jobTitle) return badRequest("Please enter the job title.");
    if (jobTitle.length > MAX_JOB_TITLE_LENGTH) return badRequest(`The job title must be ${MAX_JOB_TITLE_LENGTH} characters or fewer.`);
    if (mode === "text") {
        if (jobDescription.length < MIN_JOB_DESCRIPTION_LENGTH) {
            return badRequest(`Please paste the full job description (at least ${MIN_JOB_DESCRIPTION_LENGTH} characters).`);
        }
        if (jobDescription.length > MAX_JOB_DESCRIPTION_LENGTH) {
            return badRequest(`The job description must be ${MAX_JOB_DESCRIPTION_LENGTH.toLocaleString()} characters or fewer.`);
        }
    } else if (!jobDescriptionUrl || jobDescriptionUrl.length > MAX_URL_LENGTH || !isAllowedJobUrl(jobDescriptionUrl)) {
        return badRequest("Please enter a valid public job posting URL (http or https).");
    }

    // Resolve the file URL from the candidate's own resume records - the
    // browser only ever sends a reference.
    const resume = await getLibraryResume(convexClient, convexUser._id, resumeId);
    if (!resume) {
        return NextResponse.json({ error: "The selected resume could not be found." }, { status: 404 });
    }

    const rateLimit = await convexClient.mutation(api.rateLimit.consumeResumeMatchAnalysis, { userId: convexUser._id });
    if (!rateLimit.ok) {
        return NextResponse.json(
            { error: "You've reached today's resume analysis limit. Please try again later." },
            { status: 429 }
        );
    }

    const settings = await convexClient.query(api.UserSettings.GetUserSettings, { userId: convexUser._id });
    // Analysis output is evaluation/feedback text, so it follows the
    // candidate's Feedback Language setting.
    const lang = settings?.feedbackLanguage || "en";

    let webhookData: unknown;
    try {
        const webhookRes = await axios.post(
            RESUME_MATCH_WEBHOOK_URL,
            { resumeUrl: resume.fileUrl, jobTitle, jobDescription, jobDescriptionUrl, lang },
            {
                headers: { "Content-Type": "application/json" },
                timeout: 280000, // stay just under the 300s proxy/maxDuration ceiling
                // Keep the raw body so invalid JSON is reported as such.
                responseType: "text",
                transformResponse: (data) => data,
            }
        );
        webhookData = webhookRes.data;
    } catch (e) {
        // Status/code only - the request body holds the candidate's job text and resume URL.
        if (axios.isAxiosError(e)) {
            console.error("Resume match webhook failed:", e.response?.status ?? e.code);
            if (e.code === "ECONNABORTED" || e.code === "ETIMEDOUT") {
                return NextResponse.json(
                    { error: "The analysis took too long to complete. Please try again." },
                    { status: 504 }
                );
            }
            if (e.response) {
                return NextResponse.json(
                    {
                        error: mode === "url"
                            ? "The analysis could not be completed. If the job posting page can't be read, paste the job description instead."
                            : "The analysis could not be completed. Please check your resume and job description and try again.",
                    },
                    { status: 502 }
                );
            }
        } else {
            console.error("Resume match webhook failed:", e instanceof Error ? e.message : e);
        }
        return NextResponse.json(
            { error: "Unable to reach the analysis service. Please try again." },
            { status: 502 }
        );
    }

    let analysis;
    try {
        analysis = normalizeResumeMatchResponse(webhookData, jobTitle);
    } catch (e) {
        console.error("Resume match response rejected:", e instanceof Error ? e.message : e);
        const message = e instanceof ResumeMatchResponseError ? e.message : "The analysis service returned an unexpected response.";
        return NextResponse.json(
            {
                error: mode === "url"
                    ? `${message} If the job posting page can't be read, paste the job description instead.`
                    : `${message} Please try again.`,
            },
            { status: 502 }
        );
    }

    // Nothing is stored here - the candidate decides whether to keep the
    // result, and app/api/resume-match/save records it when they do.
    return NextResponse.json({ analysis, createdAt: Date.now(), resumeFileName: resume.fileName, lang });
}
