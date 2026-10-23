import { createHash } from "crypto";
import ImageKit from "imagekit";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ResumeFileToDelete, UserResume } from "@/convex/Resumes";

// Server-side helpers for the shared resume library (convex/Resumes.ts), used
// by Create Interview, Practice Coach and the Resume Match Analyzer.

function createImageKit() {
    return new ImageKit({
        publicKey: process.env.IMAGEKIT_URL_PUBLIC_KEY as string,
        privateKey: process.env.IMAGEKIT_URL_PRIVATE_KEY as string,
        urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT as string,
    });
}

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

    const imagekit = createImageKit();
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

function isNotFound(e: unknown): boolean {
    const status = (e as { $ResponseMetadata?: { statusCode?: number } } | null)?.$ResponseMetadata?.statusCode;
    return status === 404;
}

// Rows imported from before the resume library only have the URL, so the file
// is found by its name and matched on its path.
async function findImageKitFileId(imagekit: ImageKit, fileUrl: string): Promise<string | null> {
    let pathname: string;
    try {
        pathname = decodeURIComponent(new URL(fileUrl).pathname);
    } catch {
        return null;
    }
    const fileName = pathname.split("/").pop();
    if (!fileName) return null;
    const files = await imagekit.listFiles({ searchQuery: `name = "${fileName.replace(/"/g, "")}"` });
    for (const file of files) {
        if ("fileId" in file && "filePath" in file && pathname.endsWith(file.filePath)) {
            return file.fileId;
        }
    }
    return null;
}

// Removes resume files from ImageKit. A file that's already gone counts as
// deleted; any other failure throws so the records are kept and the candidate
// can try again.
export async function deleteResumeFiles(files: ResumeFileToDelete[]): Promise<void> {
    if (files.length === 0) return;
    const imagekit = createImageKit();
    for (const file of files) {
        const fileId = file.imagekitFileId ?? await findImageKitFileId(imagekit, file.fileUrl);
        if (!fileId) continue;
        try {
            await imagekit.deleteFile(fileId);
        } catch (e) {
            if (!isNotFound(e)) throw e;
        }
    }
}
