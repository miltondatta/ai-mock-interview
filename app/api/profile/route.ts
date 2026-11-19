import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { profileConvexClient, profileErrorMessage, readProfileBody, resolveProfileUserId } from "@/utils/profileAuth";

const UNAUTHORIZED = "You must be logged in to manage your profile.";

// GET /api/profile - the signed-in user's professional profile (null if none yet).
export async function GET() {
    const userId = await resolveProfileUserId();
    if (!userId) return NextResponse.json({ error: UNAUTHORIZED }, { status: 401 });
    try {
        const profile = await profileConvexClient.query(api.ProfessionalProfile.GetMyProfile, { userId });
        return NextResponse.json({ profile }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
        console.error("Failed to load profile:", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: "Unable to load your profile. Please refresh the page." }, { status: 500 });
    }
}

// POST /api/profile - create the profile (does nothing if one already exists).
export async function POST(req: Request) {
    const userId = await resolveProfileUserId();
    if (!userId) return NextResponse.json({ error: UNAUTHORIZED }, { status: 401 });
    const body = await readProfileBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    try {
        const result = await profileConvexClient.mutation(api.ProfessionalProfile.CreateProfile, { ...body, userId } as never);
        return NextResponse.json(result, { status: result.created ? 201 : 200 });
    } catch (e) {
        return NextResponse.json({ error: profileErrorMessage(e, "Unable to create your profile.") }, { status: 400 });
    }
}

// PATCH /api/profile - partial update. Only the fields sent are changed.
export async function PATCH(req: Request) {
    const userId = await resolveProfileUserId();
    if (!userId) return NextResponse.json({ error: UNAUTHORIZED }, { status: 401 });
    const body = await readProfileBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    try {
        const result = await profileConvexClient.mutation(api.ProfessionalProfile.UpdateProfile, { ...body, userId } as never);
        return NextResponse.json(result);
    } catch (e) {
        return NextResponse.json({ error: profileErrorMessage(e, "Unable to save your profile.") }, { status: 400 });
    }
}
