import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { getLibraryResume } from "@/utils/resumeLibrary";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function contentDisposition(type: "inline" | "attachment", fileName: string) {
    const fallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "Resume.pdf";
    return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

// Streams one of the signed-in candidate's resumes so the file URL never
// reaches the browser. ?download=1 saves it, otherwise it opens in the tab.
export async function GET(req: NextRequest, { params }: { params: Promise<{ resumeId: string }> }) {
    const user = await currentUser();
    if (!user) {
        return NextResponse.json({ error: "You must be logged in to view your resume." }, { status: 401 });
    }
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const convexUser = await convexClient.query(api.users.GetUserByEmail, { email });
    if (!convexUser) {
        return NextResponse.json({ error: "You must be logged in to view your resume." }, { status: 401 });
    }

    const { resumeId } = await params;
    const resume = await getLibraryResume(convexClient, convexUser._id, resumeId);
    if (!resume) {
        return NextResponse.json({ error: "This resume could not be found." }, { status: 404 });
    }

    let fileRes: Response;
    try {
        fileRes = await fetch(resume.fileUrl, { cache: "no-store", signal: AbortSignal.timeout(30000) });
    } catch (e) {
        console.error("Failed to fetch resume file:", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: "Unable to load your resume. Please try again." }, { status: 502 });
    }
    if (!fileRes.ok || !fileRes.body) {
        console.error("Failed to fetch resume file:", fileRes.status);
        return NextResponse.json({ error: "Unable to load your resume. Please try again." }, { status: 502 });
    }

    const download = req.nextUrl.searchParams.get("download") === "1";
    return new Response(fileRes.body, {
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": contentDisposition(download ? "attachment" : "inline", resume.fileName),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    });
}
