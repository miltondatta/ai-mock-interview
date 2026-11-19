import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { profileConvexClient, profileErrorMessage, readProfileBody, resolveProfileUserId } from "@/utils/profileAuth";

const UNAUTHORIZED = "You must be logged in to continue onboarding.";

// GET /api/profile/onboarding - onboarding + profile completion status.
export async function GET() {
    const userId = await resolveProfileUserId();
    if (!userId) return NextResponse.json({ error: UNAUTHORIZED }, { status: 401 });
    try {
        const status = await profileConvexClient.query(api.ProfessionalProfile.GetOnboardingStatus, { userId });
        return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
        console.error("Failed to load onboarding status:", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: "Unable to load onboarding status." }, { status: 500 });
    }
}

// POST /api/profile/onboarding - save some or all onboarding answers. Send
// markCompleted: true to finish onboarding.
export async function POST(req: Request) {
    const userId = await resolveProfileUserId();
    if (!userId) return NextResponse.json({ error: UNAUTHORIZED }, { status: 401 });
    const body = await readProfileBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    try {
        const result = await profileConvexClient.mutation(api.ProfessionalProfile.SaveOnboarding, { ...body, userId } as never);
        return NextResponse.json(result);
    } catch (e) {
        return NextResponse.json({ error: profileErrorMessage(e, "Unable to save onboarding.") }, { status: 400 });
    }
}
