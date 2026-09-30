import { NextRequest, NextResponse } from "next/server";
import ImageKit from "imagekit";
import axios from "axios";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Video generation via N8N can take a while - match the raised proxy timeout
// used by the other N8N-backed routes.
export const maxDuration = 300;

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

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
        return NextResponse.json({ error: "Please upload your resume first." }, { status: 400 });
    }

    try {
        const imagekit = new ImageKit({
            publicKey: process.env.IMAGEKIT_URL_PUBLIC_KEY as string,
            privateKey: process.env.IMAGEKIT_URL_PRIVATE_KEY as string,
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT as string,
        });

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const uploadedFile = await imagekit.upload({
            file: buffer,
            fileName: Date.now().toString() + ".pdf",
            isPublished: true,
        });
        const resumeUrl = uploadedFile?.url;

        // job_title/job_description are intentionally left blank for now -
        // wired up to the real form values in a later change.
        const webhookRes = await axios.post(
            "https://n8n.vistechsolutions.online/webhook/practice_coach",
            {
                resumeUrl,
                job_title: "",
                job_description: "",
            },
            { timeout: 280000 }
        );

        await convexClient.mutation(api.PracticeCoach.SavePracticeCoachGeneration, {
            userId: convexUser._id,
            resumeUrl,
            jobTitle: "",
            jobDescription: "",
            webhookResponse: webhookRes.data,
        });

        return NextResponse.json({ resumeUrl, result: webhookRes.data });
    } catch (e) {
        console.error("Failed to generate practice video:", e);
        return NextResponse.json(
            { error: "Unable to generate the practice video. Please try again." },
            { status: 500 }
        );
    }
}
