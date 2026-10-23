import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { deleteResumeFiles } from "@/utils/resumeLibrary";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Deletes one of the signed-in candidate's resumes (Manage Resume): the file
// is removed from ImageKit first, then the resume records (convex/Resumes.ts
// DeleteUserResume). Refused while saved match analyses still use it.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ resumeId: string }> }) {
    const user = await currentUser();
    if (!user) {
        return NextResponse.json({ error: "You must be logged in to delete a resume." }, { status: 401 });
    }
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const convexUser = await convexClient.query(api.users.GetUserByEmail, { email });
    if (!convexUser) {
        return NextResponse.json({ error: "You must be logged in to delete a resume." }, { status: 401 });
    }

    const { resumeId } = await params;
    const plan = await convexClient.query(api.Resumes.GetResumeDeletionPlan, { userId: convexUser._id, resumeId });
    if (!plan) {
        return NextResponse.json({ error: "This resume could not be found. It may have already been deleted." }, { status: 404 });
    }
    // Saved match analyses still use this resume - they must be deleted first.
    if (plan.analysisCount > 0) {
        return NextResponse.json(
            {
                error: `This resume is used by ${plan.analysisCount} saved resume match ${plan.analysisCount === 1 ? "analysis" : "analyses"}. Delete that history first.`,
                analysisCount: plan.analysisCount,
            },
            { status: 409 }
        );
    }

    try {
        await deleteResumeFiles(plan.files);
    } catch (e) {
        console.error("Failed to delete resume file from ImageKit:", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: "Unable to delete your resume file. Please try again." }, { status: 502 });
    }

    try {
        await convexClient.mutation(api.Resumes.DeleteUserResume, { userId: convexUser._id, resumeId });
    } catch (e) {
        console.error("Failed to delete resume records:", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: "Unable to delete your resume. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ success: true, fileName: plan.fileName });
}
