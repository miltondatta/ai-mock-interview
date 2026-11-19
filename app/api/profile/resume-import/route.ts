import { NextResponse } from "next/server";
import { addResumeToLibrary, getLibraryResume } from "@/utils/resumeLibrary";
import { profileConvexClient, resolveProfileUserId } from "@/utils/profileAuth";
import { DocxReadError, docxToText, isDocxBuffer } from "@/utils/profile/docxText";
import { extractProfileFromResume, ResumeExtractionError, type ResumeSource } from "@/utils/profile/resumeExtractor";
import type { ResumeImportResponse } from "@/utils/profile/types";

// The AI extraction can take a while for long resumes.
export const maxDuration = 120;

const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const MIN_DOCX_TEXT = 50;

function fail(error: string, status: number) {
    return NextResponse.json({ error }, { status });
}

function isPdf(buf: Buffer): boolean {
    return buf.subarray(0, 5).toString("latin1") === "%PDF-";
}

// POST /api/profile/resume-import
//
// Reads a resume and returns profile fields extracted from it. Nothing is
// saved to the profile here: the client merges the result into the form for
// review, and the user saves it themselves.
//   - multipart/form-data with `file` (PDF or DOCX, up to 10 MB). A PDF is
//     added to the shared resume library (ImageKit, with duplicate detection)
//     through the existing addResumeToLibrary. A DOCX is only read, because
//     the other library features (interviews, Practice Coach, Resume Match)
//     only handle PDF.
//   - application/json `{ resumeId }`: re-reads a resume already in the
//     user's library, after an ownership check.
export async function POST(req: Request) {
    const userId = await resolveProfileUserId();
    if (!userId) return fail("You must be logged in to import a resume.", 401);

    let source: ResumeSource;
    let resume: ResumeImportResponse["resume"] = null;
    let sourceFileName: string;

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
        let form: FormData;
        try {
            form = await req.formData();
        } catch {
            return fail("Invalid upload.", 400);
        }
        const rawFile = form.get("file");
        const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;
        if (!file) return fail("Please choose a resume to upload.", 400);
        if (file.size > MAX_RESUME_BYTES) return fail("Your resume must be 10 MB or smaller.", 400);

        const name = file.name.toLowerCase();
        const bytes = Buffer.from(await file.arrayBuffer());
        sourceFileName = file.name;

        // Check the file's signature, not only its extension.
        if (name.endsWith(".pdf") && isPdf(bytes)) {
            try {
                const saved = await addResumeToLibrary(profileConvexClient, userId, file);
                resume = { id: saved.id, fileName: saved.fileName };
            } catch (e) {
                console.error("Failed to save resume to library:", e instanceof Error ? e.message : e);
                return fail("Unable to upload your resume. Please try again.", 500);
            }
            source = { kind: "pdf", bytes };
        } else if (name.endsWith(".docx") && isDocxBuffer(bytes)) {
            let text: string;
            try {
                text = docxToText(bytes);
            } catch (e) {
                return fail(e instanceof DocxReadError ? e.message : "This DOCX document couldn't be read.", 400);
            }
            if (text.length < MIN_DOCX_TEXT) return fail("We couldn't find any text in this document.", 422);
            source = { kind: "text", text };
        } else {
            return fail("Only PDF and DOCX files are supported.", 400);
        }
    } else {
        let body: { resumeId?: unknown };
        try {
            body = await req.json();
        } catch {
            return fail("Invalid request body.", 400);
        }
        const resumeId = typeof body?.resumeId === "string" ? body.resumeId : "";
        const libraryResume = resumeId ? await getLibraryResume(profileConvexClient, userId, resumeId) : null;
        if (!libraryResume) return fail("Resume not found.", 404);

        let bytes: Buffer;
        try {
            const res = await fetch(libraryResume.fileUrl, { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            bytes = Buffer.from(await res.arrayBuffer());
        } catch (e) {
            console.error("Failed to download library resume:", e instanceof Error ? e.message : e);
            return fail("We couldn't open that resume. Please try again.", 502);
        }
        if (bytes.length > MAX_RESUME_BYTES) return fail("That resume is larger than 10 MB.", 400);
        if (!isPdf(bytes)) return fail("That resume isn't a readable PDF.", 422);
        source = { kind: "pdf", bytes };
        resume = { id: libraryResume.id, fileName: libraryResume.fileName };
        sourceFileName = libraryResume.fileName;
    }

    try {
        const extracted = await extractProfileFromResume(source);
        const payload: ResumeImportResponse = { extracted, resume, sourceFileName };
        return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
        const message = e instanceof ResumeExtractionError ? e.message : "We couldn't read your resume right now. Please try again.";
        if (!(e instanceof ResumeExtractionError)) console.error("Resume extraction failed:", e instanceof Error ? e.message : e);
        return fail(message, 502);
    }
}
