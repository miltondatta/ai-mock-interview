import { NextRequest, NextResponse } from "next/server";
import ImageKit from "imagekit";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Best-effort: looks up the ImageKit file by its filename (parsed from the
// stored URL, since only the URL - not the fileId - is saved on the row) and
// deletes it. A miss here (file already gone, lookup fails) must not block
// deleting the database record below.
async function deleteImageKitFileByUrl(imagekit: ImageKit, fileUrl: string) {
    try {
        const fileName = decodeURIComponent(new URL(fileUrl).pathname.split("/").pop() ?? "");
        if (!fileName) return;
        const files = await imagekit.listFiles({ searchQuery: `name = "${fileName}"` });
        const file = files.find((f) => "fileId" in f);
        if (file && "fileId" in file) {
            await imagekit.deleteFile(file.fileId);
        }
    } catch (e) {
        console.error("Failed to delete Practice Coach audio file from ImageKit:", e);
    }
}

export async function POST(req: NextRequest) {
    const user = await currentUser();
    if (!user) {
        return NextResponse.json(
            { error: "You must be logged in to use Practice Coach." },
            { status: 401 }
        );
    }

    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const convexUser = await convexClient.query(api.users.GetUserByEmail, { email });
    if (!convexUser) {
        return NextResponse.json(
            { error: "You must be logged in to use Practice Coach." },
            { status: 401 }
        );
    }

    const body = await req.json().catch(() => null);
    const practiceCoachId = body?.practiceCoachId as string | undefined;
    if (!practiceCoachId) {
        return NextResponse.json({ error: "Missing practiceCoachId." }, { status: 400 });
    }

    const generation = await convexClient.query(api.PracticeCoach.GetPracticeCoachGenerationForUser, {
        id: practiceCoachId as Id<"PracticeCoachTable">,
        userId: convexUser._id,
    });
    if (!generation) {
        return NextResponse.json({ error: "Practice session not found." }, { status: 404 });
    }

    if (generation.audioUrl) {
        const imagekit = new ImageKit({
            publicKey: process.env.IMAGEKIT_URL_PUBLIC_KEY as string,
            privateKey: process.env.IMAGEKIT_URL_PRIVATE_KEY as string,
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT as string,
        });
        await deleteImageKitFileByUrl(imagekit, generation.audioUrl);
    }

    try {
        await convexClient.mutation(api.PracticeCoach.DeletePracticeCoachGeneration, {
            id: practiceCoachId as Id<"PracticeCoachTable">,
            userId: convexUser._id,
        });
    } catch (e) {
        console.error("Failed to delete Practice Coach generation:", e);
        return NextResponse.json({ error: "Unable to delete this session. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
