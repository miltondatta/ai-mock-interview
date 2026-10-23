import { internalAction, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

// Resume library shared by Create Interview, Practice Coach and the Resume
// Match Analyzer. ResumeTable holds one row per distinct file; UserResumeTable
// maps each row to the candidate who owns it. Duplicates are detected by the
// SHA-256 of the file bytes (contentHash), so uploading the same PDF again
// reuses the original entry instead of listing it twice.

export interface ResumeListItem {
    id: Id<'ResumeTable'>;
    fileName: string;
    fileType: string;
    fileSize?: number;
    uploadedAt: number;
}

export interface UserResume extends ResumeListItem {
    fileUrl: string;
}

function toUserResume(resume: Doc<'ResumeTable'>): UserResume {
    return {
        id: resume._id,
        fileName: resume.fileName,
        fileType: resume.fileType,
        fileSize: resume.fileSize,
        uploadedAt: resume.uploadedAt,
        fileUrl: resume.fileUrl,
    };
}

async function getOwnedResume(ctx: QueryCtx, userId: Id<'UserTable'>, resumeId: string): Promise<Doc<'ResumeTable'> | null> {
    const id = ctx.db.normalizeId('ResumeTable', resumeId);
    if (!id) return null;
    const mapping = await ctx.db
        .query('UserResumeTable')
        .withIndex('by_user_resume', q => q.eq('userId', userId).eq('resumeId', id))
        .first();
    if (!mapping) return null;
    return await ctx.db.get(id);
}

// Candidate's resumes, newest first. File URLs are left out - server routes
// resolve them with GetUserResume after checking ownership.
export const GetUserResumes = query({
    args: {
        userId: v.id('UserTable'),
    },
    handler: async (ctx, args): Promise<ResumeListItem[]> => {
        const mappings = await ctx.db
            .query('UserResumeTable')
            .withIndex('by_user', q => q.eq('userId', args.userId))
            .collect();

        const seenHashes = new Set<string>();
        const resumes: ResumeListItem[] = [];
        for (const mapping of mappings) {
            const resume = await ctx.db.get(mapping.resumeId);
            if (!resume) continue;
            if (resume.contentHash) {
                if (seenHashes.has(resume.contentHash)) continue;
                seenHashes.add(resume.contentHash);
            }
            const { fileUrl: _fileUrl, ...item } = toUserResume(resume);
            resumes.push(item);
        }
        return resumes.sort((a, b) => b.uploadedAt - a.uploadedAt);
    }
});

// Ownership-checked lookup. Returns null when the id is malformed or the
// resume isn't mapped to this user.
export const GetUserResume = query({
    args: {
        userId: v.id('UserTable'),
        resumeId: v.string(),
    },
    handler: async (ctx, args): Promise<UserResume | null> => {
        const resume = await getOwnedResume(ctx, args.userId, args.resumeId);
        return resume ? toUserResume(resume) : null;
    }
});

// Lets an upload route skip re-uploading a file the candidate already has.
export const FindUserResumeByHash = query({
    args: {
        userId: v.id('UserTable'),
        contentHash: v.string(),
    },
    handler: async (ctx, args): Promise<UserResume | null> => {
        const mapping = await ctx.db
            .query('UserResumeTable')
            .withIndex('by_user_hash', q => q.eq('userId', args.userId).eq('contentHash', args.contentHash))
            .first();
        if (!mapping) return null;
        const resume = await ctx.db.get(mapping.resumeId);
        return resume ? toUserResume(resume) : null;
    }
});

// Records a newly uploaded file and maps it to the user. If the same file was
// added meanwhile (two uploads racing), the existing entry is returned and the
// new one is not created.
export const AddUserResume = mutation({
    args: {
        userId: v.id('UserTable'),
        fileName: v.string(),
        fileUrl: v.string(),
        fileType: v.string(),
        fileSize: v.optional(v.number()),
        contentHash: v.string(),
        imagekitFileId: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{ resume: UserResume; created: boolean }> => {
        const existing = await ctx.db
            .query('UserResumeTable')
            .withIndex('by_user_hash', q => q.eq('userId', args.userId).eq('contentHash', args.contentHash))
            .first();
        if (existing) {
            const resume = await ctx.db.get(existing.resumeId);
            if (resume) return { resume: toUserResume(resume), created: false };
        }

        const now = Date.now();
        const resumeId = await ctx.db.insert('ResumeTable', {
            fileName: args.fileName,
            fileUrl: args.fileUrl,
            fileType: args.fileType,
            fileSize: args.fileSize,
            contentHash: args.contentHash,
            imagekitFileId: args.imagekitFileId,
            uploadedAt: now,
        });
        await ctx.db.insert('UserResumeTable', {
            userId: args.userId,
            resumeId,
            contentHash: args.contentHash,
            createdAt: now,
        });
        const resume = await ctx.db.get(resumeId);
        return { resume: toUserResume(resume!), created: true };
    }
});

// --- Deleting a resume (Manage Resume) ------------------------------------
//
// Deleting removes the candidate's mappings and the ResumeTable rows behind
// them. It's refused while saved match analyses still use the resume - the
// candidate deletes that history first. Copies of the same file
// (same contentHash) are hidden by GetUserResumes, so they go too - otherwise
// a duplicate would reappear in the list. Interview and Practice Coach records
// are kept; they only keep the old reference.

export interface ResumeFileToDelete {
    fileUrl: string;
    imagekitFileId?: string;
}

interface ResumeDeletion {
    fileName: string;
    mappingIds: Id<'UserResumeTable'>[];
    rowIds: Id<'ResumeTable'>[];
    analyses: { _id: Id<'ResumeMatchAnalysisTable'>; jobTitle: string; createdAt: number }[];
    files: ResumeFileToDelete[];
}

async function planResumeDeletion(ctx: QueryCtx, userId: Id<'UserTable'>, resumeId: string): Promise<ResumeDeletion | null> {
    const resume = await getOwnedResume(ctx, userId, resumeId);
    if (!resume) return null;
    const hash = resume.contentHash;

    const mappings = (await ctx.db
        .query('UserResumeTable')
        .withIndex('by_user', q => q.eq('userId', userId))
        .collect())
        .filter(m => m.resumeId === resume._id || (hash !== undefined && m.contentHash === hash));

    const targetIds = new Set<Id<'ResumeTable'>>([resume._id, ...mappings.map(m => m.resumeId)]);
    if (hash) {
        // Legacy duplicates left unmapped by LinkLegacyResume.
        const legacyCopies = await ctx.db
            .query('ResumeTable')
            .filter(q => q.and(q.eq(q.field('userId'), userId), q.eq(q.field('contentHash'), hash)))
            .collect();
        for (const row of legacyCopies) targetIds.add(row._id);
    }

    const rowIds: Id<'ResumeTable'>[] = [];
    const rows: Doc<'ResumeTable'>[] = [];
    for (const id of targetIds) {
        // Never remove a row another candidate still uses.
        const otherOwner = await ctx.db
            .query('UserResumeTable')
            .filter(q => q.and(q.eq(q.field('resumeId'), id), q.neq(q.field('userId'), userId)))
            .first();
        if (otherOwner) continue;
        const row = await ctx.db.get(id);
        if (!row) continue;
        rowIds.push(id);
        rows.push(row);
    }

    const files: ResumeFileToDelete[] = [];
    const seenUrls = new Set<string>();
    for (const row of rows) {
        if (seenUrls.has(row.fileUrl)) continue;
        seenUrls.add(row.fileUrl);
        // Keep the file if a row that isn't being deleted still points at it.
        const stillUsed = (await ctx.db
            .query('ResumeTable')
            .filter(q => q.eq(q.field('fileUrl'), row.fileUrl))
            .collect())
            .some(other => !rowIds.includes(other._id));
        if (stillUsed) continue;
        files.push({ fileUrl: row.fileUrl, imagekitFileId: row.imagekitFileId });
    }

    const analyses = (await ctx.db
        .query('ResumeMatchAnalysisTable')
        .withIndex('by_user', q => q.eq('userId', userId))
        .collect())
        .filter(a => {
            const id = ctx.db.normalizeId('ResumeTable', a.resumeId);
            return id !== null && targetIds.has(id);
        })
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(a => ({ _id: a._id, jobTitle: a.jobTitle, createdAt: a.createdAt }));

    return {
        fileName: resume.fileName,
        mappingIds: mappings.map(m => m._id),
        rowIds,
        analyses,
        files,
    };
}

// What deleting would remove - the delete route clears these files from
// ImageKit before the records are removed. Null when the resume isn't theirs.
export const GetResumeDeletionPlan = query({
    args: {
        userId: v.id('UserTable'),
        resumeId: v.string(),
    },
    handler: async (ctx, args): Promise<{ fileName: string; files: ResumeFileToDelete[]; analysisCount: number } | null> => {
        const plan = await planResumeDeletion(ctx, args.userId, args.resumeId);
        if (!plan) return null;
        return { fileName: plan.fileName, files: plan.files, analysisCount: plan.analyses.length };
    }
});

// Saved match analyses that used this resume. A resume can't be deleted while
// any exist - the delete dialog lists them so the candidate can remove that
// history first.
export const GetResumeRelatedAnalyses = query({
    args: {
        userId: v.id('UserTable'),
        resumeId: v.string(),
    },
    handler: async (ctx, args) => {
        const plan = await planResumeDeletion(ctx, args.userId, args.resumeId);
        return plan?.analyses ?? [];
    }
});

export const DeleteUserResume = mutation({
    args: {
        userId: v.id('UserTable'),
        resumeId: v.string(),
    },
    handler: async (ctx, args): Promise<{ deleted: boolean; analysisCount: number }> => {
        const plan = await planResumeDeletion(ctx, args.userId, args.resumeId);
        if (!plan) return { deleted: false, analysisCount: 0 };
        if (plan.analyses.length > 0) return { deleted: false, analysisCount: plan.analyses.length };
        for (const id of plan.mappingIds) await ctx.db.delete(id);
        for (const id of plan.rowIds) await ctx.db.delete(id);
        return { deleted: true, analysisCount: 0 };
    }
});

// --- One-time import of resumes uploaded before the resume library ---------
//
// Run once after deploying:  npx convex run Resumes:ImportLegacyResumes
//
// Walks every resumeUrl stored on InterviewSessionTable / PracticeCoachTable
// (and ResumeTable rows from before UserResumeTable), oldest first, downloads
// each file to hash it, and keeps only the first copy of each distinct file
// per user as that user's resume. Imported rows get their resumeId set, so
// running it again only picks up anything not yet imported.

type LegacySource =
    | { kind: 'interview'; rowId: Id<'InterviewSessionTable'> }
    | { kind: 'practice'; rowId: Id<'PracticeCoachTable'> }
    | { kind: 'resume'; rowId: Id<'ResumeTable'> };

interface LegacyResume {
    userId: Id<'UserTable'>;
    url: string;
    fileName?: string;
    createdAt: number;
    source: LegacySource;
}

const legacySourceValidator = v.union(
    v.object({ kind: v.literal('interview'), rowId: v.id('InterviewSessionTable') }),
    v.object({ kind: v.literal('practice'), rowId: v.id('PracticeCoachTable') }),
    v.object({ kind: v.literal('resume'), rowId: v.id('ResumeTable') }),
);

// ImageKit stores uploads as "<timestamp>.pdf" (plus a random suffix), so
// that's the only name available for resumes whose original name wasn't saved.
function fileNameFromUrl(url: string): string {
    try {
        const name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
        return name || "Resume.pdf";
    } catch {
        return "Resume.pdf";
    }
}

function isGeneratedFileName(name: string): boolean {
    return /^\d{10,}[^/]*\.pdf$/i.test(name);
}

export const ListLegacyResumes = internalQuery({
    args: {},
    handler: async (ctx): Promise<LegacyResume[]> => {
        const legacy: LegacyResume[] = [];

        for (const row of await ctx.db.query('ResumeTable').collect()) {
            if (row.userId && !row.contentHash) {
                legacy.push({ userId: row.userId, url: row.fileUrl, fileName: row.fileName, createdAt: row.uploadedAt, source: { kind: 'resume', rowId: row._id } });
            }
        }
        for (const row of await ctx.db.query('InterviewSessionTable').collect()) {
            if (row.resumeUrl && !row.resumeId) {
                legacy.push({ userId: row.userId, url: row.resumeUrl, fileName: row.resumeFileName, createdAt: row._creationTime, source: { kind: 'interview', rowId: row._id } });
            }
        }
        for (const row of await ctx.db.query('PracticeCoachTable').collect()) {
            if (row.resumeUrl && !row.resumeId) {
                legacy.push({ userId: row.userId, url: row.resumeUrl, createdAt: row.createdAt, source: { kind: 'practice', rowId: row._id } });
            }
        }
        // Oldest first, so the original upload becomes the library entry.
        return legacy.sort((a, b) => a.createdAt - b.createdAt);
    }
});

export const LinkLegacyResume = internalMutation({
    args: {
        userId: v.id('UserTable'),
        url: v.string(),
        fileName: v.optional(v.string()),
        fileSize: v.number(),
        contentHash: v.string(),
        createdAt: v.number(),
        source: legacySourceValidator,
    },
    handler: async (ctx, args) => {
        const fileName = args.fileName || fileNameFromUrl(args.url);
        const existing = await ctx.db
            .query('UserResumeTable')
            .withIndex('by_user_hash', q => q.eq('userId', args.userId).eq('contentHash', args.contentHash))
            .first();

        let resumeId: Id<'ResumeTable'>;
        if (existing) {
            // A duplicate of a file the user already has - point at the original,
            // and adopt the real filename if the original only had ImageKit's.
            resumeId = existing.resumeId;
            const original = await ctx.db.get(resumeId);
            if (original && isGeneratedFileName(original.fileName) && !isGeneratedFileName(fileName)) {
                await ctx.db.patch(resumeId, { fileName });
            }
            if (args.source.kind === 'resume' && args.source.rowId !== resumeId) {
                // Mark the duplicate row as processed; it stays unmapped, so it's never listed.
                await ctx.db.patch(args.source.rowId, { contentHash: args.contentHash, fileSize: args.fileSize });
            }
        } else {
            if (args.source.kind === 'resume') {
                resumeId = args.source.rowId;
                await ctx.db.patch(resumeId, { contentHash: args.contentHash, fileSize: args.fileSize });
            } else {
                resumeId = await ctx.db.insert('ResumeTable', {
                    fileName,
                    fileUrl: args.url,
                    fileType: "PDF",
                    fileSize: args.fileSize,
                    contentHash: args.contentHash,
                    uploadedAt: args.createdAt,
                });
            }
            await ctx.db.insert('UserResumeTable', {
                userId: args.userId,
                resumeId,
                contentHash: args.contentHash,
                createdAt: args.createdAt,
            });
        }

        if (args.source.kind === 'interview' || args.source.kind === 'practice') {
            await ctx.db.patch(args.source.rowId, { resumeId });
        }
    }
});

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

export const ImportLegacyResumes = internalAction({
    args: {},
    handler: async (ctx): Promise<{ imported: number; failed: number }> => {
        const legacy: LegacyResume[] = await ctx.runQuery(internal.Resumes.ListLegacyResumes, {});
        let imported = 0;
        let failed = 0;
        // Same URL on several rows (one upload reused) - download it only once.
        const hashByUrl = new Map<string, { contentHash: string; fileSize: number }>();

        for (const item of legacy) {
            try {
                let file = hashByUrl.get(item.url);
                if (!file) {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 30000);
                    let bytes: ArrayBuffer;
                    try {
                        const res = await fetch(item.url, { signal: controller.signal });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        bytes = await res.arrayBuffer();
                    } finally {
                        clearTimeout(timer);
                    }
                    file = { contentHash: await sha256Hex(bytes), fileSize: bytes.byteLength };
                    hashByUrl.set(item.url, file);
                }
                await ctx.runMutation(internal.Resumes.LinkLegacyResume, {
                    userId: item.userId,
                    url: item.url,
                    fileName: item.fileName,
                    fileSize: file.fileSize,
                    contentHash: file.contentHash,
                    createdAt: item.createdAt,
                    source: item.source,
                });
                imported++;
            } catch (e) {
                failed++;
                console.error(`Could not import resume from ${item.source.kind} row ${item.source.rowId}:`, e instanceof Error ? e.message : e);
            }
        }
        return { imported, failed };
    }
});
