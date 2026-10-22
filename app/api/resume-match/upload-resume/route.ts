import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { addResumeToLibrary } from "@/utils/resumeLibrary";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const MAX_RESUME_BYTES = 10 * 1024 * 1024;

// Adds a resume from the Resume Match Analyzer to the candidate's resume
// library. Re-uploading a file they already have returns the existing entry.
export async function POST(req: NextRequest) {
    const user = await currentUser();
    if (!user) {
        return NextResponse.json({ error: "You must be logged in to upload a resume." }, { status: 401 });
    }
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const convexUser = await convexClient.query(api.users.GetUserByEmail, { email });
    if (!convexUser) {
        return NextResponse.json({ error: "You must be logged in to upload a resume." }, { status: 401 });
    }

    const formData = await req.formData();
    const rawFile = formData.get("file");
    const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;
    if (!file) {
        return NextResponse.json({ error: "Please choose a resume to upload." }, { status: 400 });
    }
    if (file.size > MAX_RESUME_BYTES) {
        return NextResponse.json({ error: "Your resume must be 10 MB or smaller." }, { status: 400 });
    }
    // Don't rely on the browser-reported type/extension alone - check the PDF signature.
    const signature = Buffer.from(await file.slice(0, 5).arrayBuffer()).toString("latin1");
    if (!file.name.toLowerCase().endsWith(".pdf") || signature !== "%PDF-") {
        return NextResponse.json({ error: "Only PDF files are supported for your resume." }, { status: 400 });
    }

    try {
        const resume = await addResumeToLibrary(convexClient, convexUser._id, file);
        return NextResponse.json({ resumeId: resume.id, fileName: resume.fileName });
    } catch (e) {
        console.error("Failed to upload resume:", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: "Unable to upload your resume. Please try again." }, { status: 500 });
    }
}
