import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { sanitizeCandidateText } from "@/utils/sanitizeText";
import { generateStudyPlan } from "@/utils/studyPlanner/planGenerator";
import { LEVELS, type Level } from "@/utils/studyPlanner/schemas";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Direct Gemini call (with one internal retry) - independent of n8n and of
// every other AI feature in this app, per the Study Planner module's
// independence requirement. This route only generates and validates a plan;
// it is never saved here - saving happens through
// convex/StudyPlanner.ts:CreateStudyPlan once the candidate confirms the
// preview (see app/(routes)/study-planner/create).
export const maxDuration = 120;

const MAX_SUBJECT_LENGTH = 150;
const MAX_GOAL_LENGTH = 300;
const MAX_INSTRUCTIONS_LENGTH = 2000;
const MAX_STUDY_PERIOD_DAYS = 365;
const ALLOWED_DAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function badRequest(error: string) {
    return NextResponse.json({ error }, { status: 400 });
}

function isValidLevel(value: unknown): value is Level {
    return typeof value === "string" && (LEVELS as readonly string[]).includes(value);
}

export async function POST(req: NextRequest) {
    const user = await currentUser();
    if (!user) {
        return NextResponse.json({ error: "You must be logged in to generate a study plan." }, { status: 401 });
    }
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const convexUser = await convexClient.query(api.users.GetUserByEmail, { email });
    if (!convexUser) {
        return NextResponse.json({ error: "You must be logged in to generate a study plan." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return badRequest("Invalid request.");

    const subject = sanitizeCandidateText(body.subject, { singleLine: true, maxLength: MAX_SUBJECT_LENGTH });
    if (!subject) return badRequest("Please describe what you want to learn.");

    const learningGoal = sanitizeCandidateText(body.learningGoal, { singleLine: true, maxLength: MAX_GOAL_LENGTH });
    const additionalInstructions = sanitizeCandidateText(body.additionalInstructions, { maxLength: MAX_INSTRUCTIONS_LENGTH });

    if (!isValidLevel(body.currentLevel)) return badRequest("Please select a valid current knowledge level.");
    if (!isValidLevel(body.targetLevel)) return badRequest("Please select a valid target knowledge level.");

    const startDate = typeof body.startDate === "string" ? body.startDate : "";
    const targetEndDate = typeof body.targetEndDate === "string" ? body.targetEndDate : "";
    if (!DATE_RE.test(startDate) || !DATE_RE.test(targetEndDate)) {
        return badRequest("Please provide valid start and target completion dates.");
    }
    if (targetEndDate < startDate) {
        return badRequest("The target completion date must be on or after the start date.");
    }
    const totalDays = Math.round(
        (new Date(`${targetEndDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86_400_000
    ) + 1;
    if (totalDays > MAX_STUDY_PERIOD_DAYS) {
        return badRequest(`The study period can't be longer than ${MAX_STUDY_PERIOD_DAYS} days.`);
    }

    const availableHoursPerDay = Number(body.availableHoursPerDay);
    if (!Number.isFinite(availableHoursPerDay) || availableHoursPerDay <= 0 || availableHoursPerDay > 16) {
        return badRequest("Please provide a valid number of study hours per day (up to 16).");
    }

    const preferredStudyDays = Array.isArray(body.preferredStudyDays)
        ? Array.from(new Set(body.preferredStudyDays.filter((d: unknown): d is string => typeof d === "string" && ALLOWED_DAYS.has(d))))
        : [];

    const learningPreferences = Array.isArray(body.learningPreferences)
        ? body.learningPreferences
              .filter((p: unknown): p is string => typeof p === "string")
              .map((p: string) => sanitizeCandidateText(p, { singleLine: true, maxLength: 60 }))
              .filter((p: string) => p.length > 0)
              .slice(0, 10)
        : [];

    const rateLimit = await convexClient.mutation(api.rateLimit.consumeStudyPlanGenerate, {
        userId: convexUser._id,
    });
    if (!rateLimit.ok) {
        return NextResponse.json(
            { error: "You've reached today's study plan generation limit. Please try again later." },
            { status: 429 }
        );
    }

    try {
        const result = await generateStudyPlan({
            subject,
            learningGoal: learningGoal || undefined,
            additionalInstructions: additionalInstructions || undefined,
            currentLevel: body.currentLevel,
            targetLevel: body.targetLevel,
            startDate,
            targetEndDate,
            availableHoursPerDay,
            preferredStudyDays,
            learningPreferences,
        });

        return NextResponse.json({ plan: result.plan });
    } catch (e) {
        console.error("Study Planner generation failed:", e instanceof Error ? e.message : e);
        return NextResponse.json(
            { error: "Unable to generate a study plan right now. Please try again." },
            { status: 502 }
        );
    }
}
