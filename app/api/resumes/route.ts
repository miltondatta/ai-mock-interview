import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Lists the signed-in candidate's resumes. The user is resolved from the Clerk
// session on the server - never from a client-supplied userId - so a candidate
// only ever sees their own resumes.
export async function GET() {
    const user = await currentUser();
    if (!user) {
        return NextResponse.json({ error: "You must be logged in to view your resumes." }, { status: 401 });
    }
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const convexUser = await convexClient.query(api.users.GetUserByEmail, { email });
    if (!convexUser) {
        return NextResponse.json({ error: "You must be logged in to view your resumes." }, { status: 401 });
    }

    try {
        const resumes = await convexClient.query(api.Resumes.GetUserResumes, { userId: convexUser._id });
        return NextResponse.json({ resumes }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
        console.error("Failed to load resumes:", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: "Unable to load your resumes. Please refresh the page." }, { status: 500 });
    }
}
