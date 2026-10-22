import { createHash } from "crypto";
import ImageKit from "imagekit";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { UserResume } from "@/convex/Resumes";

// Server-side helpers for the shared resume library (convex/Resumes.ts), used
// by Create Interview, Practice Coach and the Resume Match Analyzer.

// Adds an uploaded resume to the user's library and returns the library
// entry. If the user already has this exact file (same SHA-256), the existing
// entry is returned and nothing is uploaded to ImageKit - so the same resume
// never shows up twice.
export async function addResumeToLibrary(
    convexClient: ConvexHttpClient,
    userId: Id<'UserTable'>,
    file: File
): Promise<UserResume> {
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentHash = createHash("sha256").update(buffer).digest("hex");

    const existing = await convexClient.query(api.Resumes.FindUserResumeByHash, { userId, contentHash });
    if (existing) return existing;

    const imagekit = new ImageKit({
        publicKey: process.env.IMAGEKIT_URL_PUBLIC_KEY as string,
        privateKey: process.env.IMAGEKIT_URL_PRIVATE_KEY as string,
        urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT as string,
    });
    const uploadedFile = await imagekit.upload({
        file: buffer,
        fileName: Date.now().toString() + ".pdf",
        isPublished: true,
    });
    if (!uploadedFile?.url) {
        throw new Error("ImageKit upload returned no URL");
    }

    const fileName = file.name.replace(/[\\/\u0000-\u001f]/g, "").trim().slice(0, 200) || "Resume.pdf";
    const { resume } = await convexClient.mutation(api.Resumes.AddUserResume, {
        userId,
        fileName,
        fileUrl: uploadedFile.url,
        fileType: "PDF",
        fileSize: file.size,
        contentHash,
        imagekitFileId: uploadedFile.fileId,
    });
    return resume;
}

// Ownership-checked lookup of a resume the candidate picked from their
// library. Returns null if it isn't theirs.
export async function getLibraryResume(
    convexClient: ConvexHttpClient,
    userId: Id<'UserTable'>,
    resumeId: string
): Promise<UserResume | null> {
    if (!resumeId) return null;
    return await convexClient.query(api.Resumes.GetUserResume, { userId, resumeId });
}
