import { Type } from "@google/genai";
import { z } from "zod";
import { getGeminiClient, getStudyPlannerModel } from "./geminiClient";
import type { Level } from "./schemas";

// Learning-resource discovery for one Study Planner task (Task Details
// screen). The core rule: the AI never supplies a URL or a resource title
// that ends up on screen.
//
//  - Videos come from the YouTube Data API (only when YOUTUBE_API_KEY is
//    configured) and/or from the real source pages Google Search returned to
//    a grounded Gemini call (groundingMetadata - not the model's own text).
//    Every candidate is then verified through YouTube's public oEmbed
//    endpoint, which only answers for a video that exists, is public and is
//    embeddable; the title/channel shown are oEmbed's, not the AI's.
//  - Readings come only from grounded Google Search source pages. Each one is
//    resolved and fetched live; it's kept only if it answers 2xx with an
//    HTML/PDF document, and its title is read from the page itself.
//  - When nothing verifiable is found the result says so explicitly
//    ("none_found"/"unavailable") instead of filling the gap.
//  - The only AI-written content is the practice/project guide and quiz,
//    which the UI labels as AI-generated. URLs are stripped from it.

export const TASK_TYPES = ["video", "reading", "practice", "quiz", "project", "revision"] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export type SearchStatus = "found" | "none_found" | "unavailable";

export interface ResourceDiscoveryContext {
    taskTitle: string;
    taskDescription?: string;
    completionCriteria?: string;
    phaseTitle?: string;
    objectives: string[];
    planTitle?: string;
    learningGoal?: string;
    level?: Level;
}

export interface VerifiedVideo {
    videoId: string;
    title: string;
    channel?: string;
    url: string;
}

export interface VerifiedReading {
    title: string;
    url: string;
    source: string;
}

export interface TaskGuide {
    overview: string;
    steps: string[];
    examples: string[];
    expectedOutcomes: string[];
    deliverables: string[];
}

export interface QuizQuestion {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
}

export interface TaskLearningResources {
    taskType: TaskType;
    generatedForTitle: string;
    generatedAt: number;
    videoSearchStatus: SearchStatus;
    readingSearchStatus: SearchStatus;
    videos: VerifiedVideo[];
    readings: VerifiedReading[];
    guide?: TaskGuide;
    quiz?: QuizQuestion[];
}

const MAX_VIDEOS = 3;
const MAX_READINGS = 5;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 4;
const MAX_TITLE_BYTES = 200_000;
const USER_AGENT = "Mozilla/5.0 (compatible; StudyPlannerResourceCheck/1.0)";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const URL_IN_TEXT_RE = /\b(?:https?:\/\/|www\.)\S+/gi;

function stripUrls(text: string): string {
    return text.replace(URL_IN_TEXT_RE, "").replace(/\s{2,}/g, " ").trim();
}

function cleanList(list: string[] | undefined, max: number): string[] {
    return (list ?? []).map(stripUrls).filter((s) => s.length > 0).slice(0, max);
}

// Server-side fetches only go to public http(s) hosts - never localhost,
// private-network names or raw IP literals.
function isSafePublicUrl(raw: string): boolean {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return false;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    if (!host || !host.includes(".")) return false;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[")) return false;
    return true;
}

function hostOf(raw: string): string {
    try {
        return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
        return "";
    }
}

const NON_READING_HOSTS = [
    "youtube.com",
    "youtu.be",
    "youtube-nocookie.com",
    "facebook.com",
    "instagram.com",
    "tiktok.com",
    "twitter.com",
    "x.com",
    "pinterest.com",
    "vertexaisearch.cloud.google.com",
];

function isNonReadingHost(host: string): boolean {
    return NON_READING_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

function decodeEntities(text: string): string {
    return text
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;|&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&");
}

function fetchWithTimeout(url: string, init: { redirect?: RequestRedirect } = {}): Promise<Response> {
    return fetch(url, {
        ...init,
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/pdf,application/json;q=0.9,*/*;q=0.8" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
    });
}

// Follows redirects by hand so every hop is checked by isSafePublicUrl.
async function fetchFollowingSafeRedirects(startUrl: string): Promise<{ response: Response; finalUrl: string } | null> {
    let current = startUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        if (!isSafePublicUrl(current)) return null;
        const response = await fetchWithTimeout(current, { redirect: "manual" });
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get("location");
            await response.body?.cancel().catch(() => {});
            if (!location) return null;
            current = new URL(location, current).toString();
            continue;
        }
        return { response, finalUrl: current };
    }
    return null;
}

// Grounding chunk URIs are Google redirect links - resolve one hop to the
// real source URL without downloading the source page.
async function resolveGroundingUri(uri: string): Promise<string | null> {
    if (hostOf(uri) !== "vertexaisearch.cloud.google.com") return isSafePublicUrl(uri) ? uri : null;
    try {
        const response = await fetchWithTimeout(uri, { redirect: "manual" });
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => {});
        if (!location) return null;
        const resolved = new URL(location, uri).toString();
        return isSafePublicUrl(resolved) ? resolved : null;
    } catch {
        return null;
    }
}

async function readHtmlTitle(response: Response): Promise<string | null> {
    if (!response.body) return null;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let bytes = 0;
    try {
        while (bytes < MAX_TITLE_BYTES) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            html += decoder.decode(value, { stream: true });
            const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
            if (match) {
                const title = decodeEntities(match[1]).replace(/\s+/g, " ").trim();
                return title || null;
            }
        }
    } catch {
        // fall through - treat as "no title"
    } finally {
        await reader.cancel().catch(() => {});
    }
    return null;
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function extractYouTubeId(raw: string): string | null {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
    let id: string | null = null;
    if (host === "youtu.be") {
        id = url.pathname.slice(1).split("/")[0] ?? null;
    } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
        if (url.pathname === "/watch") id = url.searchParams.get("v");
        else {
            const match = url.pathname.match(/^\/(?:embed|live|v)\/([^/?#]+)/);
            id = match ? match[1] : null;
        }
    }
    return id && YT_ID_RE.test(id) ? id : null;
}

// oEmbed only answers 200 for a public, embeddable video - so a success here
// is our proof the video is real and can be played in the embedded player.
async function verifyYouTubeVideo(videoId: string): Promise<VerifiedVideo | null> {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    try {
        const response = await fetchWithTimeout(
            `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`
        );
        if (!response.ok) return null;
        const data = (await response.json()) as { title?: unknown; author_name?: unknown };
        const title = typeof data.title === "string" ? data.title.trim() : "";
        if (!title) return null;
        return {
            videoId,
            title: title.slice(0, 200),
            channel: typeof data.author_name === "string" && data.author_name.trim() ? data.author_name.trim().slice(0, 120) : undefined,
            url: watchUrl,
        };
    } catch {
        return null;
    }
}

// Optional: only used when YOUTUBE_API_KEY is configured. Returns candidate
// ids; they're still verified through oEmbed like every other candidate.
async function searchYouTubeApi(query: string): Promise<string[] | null> {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) return null;
    const params = new URLSearchParams({
        part: "snippet",
        type: "video",
        maxResults: "6",
        q: query,
        videoEmbeddable: "true",
        safeSearch: "strict",
        relevanceLanguage: "en",
        key,
    });
    const response = await fetchWithTimeout(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
    if (!response.ok) throw new Error(`YouTube search failed with status ${response.status}`);
    const data = (await response.json()) as { items?: { id?: { videoId?: unknown } }[] };
    return (data.items ?? [])
        .map((item) => item.id?.videoId)
        .filter((id): id is string => typeof id === "string" && YT_ID_RE.test(id));
}

// ---------------------------------------------------------------------------
// Grounded Google Search via Gemini
// ---------------------------------------------------------------------------

interface GroundedSource {
    uri: string;
    title?: string;
}

async function groundedSearch(prompt: string): Promise<GroundedSource[]> {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
        model: getStudyPlannerModel(),
        contents: prompt,
        config: { tools: [{ googleSearch: {} }], temperature: 0.2 },
    });
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const sources: GroundedSource[] = [];
    for (const chunk of chunks) {
        const uri = chunk.web?.uri;
        if (uri) sources.push({ uri, title: chunk.web?.title ?? undefined });
    }
    return sources;
}

function contextLines(ctx: ResourceDiscoveryContext): string {
    return [
        `Study task: ${ctx.taskTitle}`,
        ctx.taskDescription ? `Task description: ${ctx.taskDescription}` : "",
        ctx.planTitle ? `Part of the study plan: ${ctx.planTitle}` : "",
        ctx.learningGoal ? `Learner's overall goal: ${ctx.learningGoal}` : "",
        ctx.phaseTitle ? `Current phase: ${ctx.phaseTitle}` : "",
        ctx.objectives.length > 0 ? `Phase learning objectives: ${ctx.objectives.join("; ")}` : "",
        ctx.level ? `Learner level: ${ctx.level}` : "",
    ]
        .filter(Boolean)
        .join("\n");
}

async function discoverVideos(ctx: ResourceDiscoveryContext, query: string): Promise<{ status: SearchStatus; videos: VerifiedVideo[] }> {
    const candidateIds: string[] = [];
    let anySearchSucceeded = false;

    const [apiResult, groundedResult] = await Promise.allSettled([
        searchYouTubeApi(query),
        groundedSearch(
            [
                "Use Google Search to find free, publicly available YouTube video lessons (youtube.com/watch pages) that teach the study task below.",
                "Prefer lectures or tutorials from reputable educators, universities or well-known channels that match the learner's level.",
                "Search YouTube specifically (for example with site:youtube.com) and briefly list the best 3-5 individual videos you found.",
                "",
                contextLines(ctx),
                `Suggested search query: ${query}`,
            ].join("\n")
        ),
    ]);

    if (apiResult.status === "fulfilled" && apiResult.value) {
        anySearchSucceeded = true;
        candidateIds.push(...apiResult.value);
    }
    if (groundedResult.status === "fulfilled") {
        anySearchSucceeded = true;
        const resolved = await Promise.all(groundedResult.value.slice(0, 12).map((s) => resolveGroundingUri(s.uri)));
        for (const url of resolved) {
            const id = url ? extractYouTubeId(url) : null;
            if (id) candidateIds.push(id);
        }
    }

    const uniqueIds = Array.from(new Set(candidateIds)).slice(0, 8);
    const verified = (await Promise.all(uniqueIds.map(verifyYouTubeVideo))).filter((v): v is VerifiedVideo => v !== null);
    const videos = verified.slice(0, MAX_VIDEOS);

    if (videos.length > 0) return { status: "found", videos };
    return { status: anySearchSucceeded ? "none_found" : "unavailable", videos: [] };
}

async function verifyReading(source: GroundedSource): Promise<VerifiedReading | null> {
    const resolved = await resolveGroundingUri(source.uri);
    if (!resolved || isNonReadingHost(hostOf(resolved))) return null;
    try {
        const result = await fetchFollowingSafeRedirects(resolved);
        if (!result) return null;
        const { response, finalUrl } = result;
        const host = hostOf(finalUrl);
        if (!response.ok || isNonReadingHost(host)) {
            await response.body?.cancel().catch(() => {});
            return null;
        }
        const contentType = response.headers.get("content-type") ?? "";
        let title: string | null = null;
        if (contentType.includes("text/html")) {
            title = await readHtmlTitle(response);
        } else if (contentType.includes("application/pdf")) {
            await response.body?.cancel().catch(() => {});
        } else {
            await response.body?.cancel().catch(() => {});
            return null;
        }
        // Grounding titles are usually just the domain, so only fall back to
        // one when the page itself had no <title>.
        const fallback = source.title && source.title.trim() ? source.title.trim() : host;
        return { title: (title || fallback).slice(0, 200), url: finalUrl, source: host };
    } catch {
        return null;
    }
}

async function discoverReadings(ctx: ResourceDiscoveryContext, query: string): Promise<{ status: SearchStatus; readings: VerifiedReading[] }> {
    let sources: GroundedSource[];
    try {
        sources = await groundedSearch(
            [
                "Use Google Search to find free, high-quality reading material for the study task below:",
                "official documentation, reputable articles, university or course notes, and well-known learning sites.",
                "Avoid videos, social media, forums and paywalled content. Briefly summarize the best 4-6 sources you found.",
                "",
                contextLines(ctx),
                `Suggested search query: ${query}`,
            ].join("\n")
        );
    } catch {
        return { status: "unavailable", readings: [] };
    }

    const seen = new Set<string>();
    const verified = (await Promise.all(sources.slice(0, 10).map(verifyReading))).filter((r): r is VerifiedReading => {
        if (!r) return false;
        const key = r.url.replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    const readings = verified.slice(0, MAX_READINGS);
    return { status: readings.length > 0 ? "found" : "none_found", readings };
}

// ---------------------------------------------------------------------------
// Task classification + AI-written guide/quiz (no URLs, ever)
// ---------------------------------------------------------------------------

const ContentPlanSchema = z.object({
    taskType: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.enum(TASK_TYPES)),
    videoSearchQuery: z.string().trim().min(2).max(150),
    readingSearchQuery: z.string().trim().min(2).max(150),
    guide: z
        .object({
            overview: z.string().trim().max(1500).optional().default(""),
            steps: z.array(z.string().trim().max(500)).max(12).optional().default([]),
            examples: z.array(z.string().trim().max(800)).max(6).optional().default([]),
            expectedOutcomes: z.array(z.string().trim().max(400)).max(8).optional().default([]),
            deliverables: z.array(z.string().trim().max(400)).max(8).optional().default([]),
        })
        .optional(),
    quiz: z
        .array(
            z.object({
                question: z.string().trim().min(5).max(500),
                options: z.array(z.string().trim().min(1).max(300)).min(2).max(5),
                correctIndex: z.number().int().nonnegative(),
                explanation: z.string().trim().max(800).optional().default(""),
            })
        )
        .max(8)
        .optional(),
});
type ContentPlan = z.infer<typeof ContentPlanSchema>;

const CONTENT_PLAN_RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        taskType: { type: Type.STRING, enum: [...TASK_TYPES] },
        videoSearchQuery: { type: Type.STRING },
        readingSearchQuery: { type: Type.STRING },
        guide: {
            type: Type.OBJECT,
            properties: {
                overview: { type: Type.STRING },
                steps: { type: Type.ARRAY, items: { type: Type.STRING } },
                examples: { type: Type.ARRAY, items: { type: Type.STRING } },
                expectedOutcomes: { type: Type.ARRAY, items: { type: Type.STRING } },
                deliverables: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
        },
        quiz: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    question: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    correctIndex: { type: Type.NUMBER },
                    explanation: { type: Type.STRING },
                },
                required: ["question", "options", "correctIndex", "explanation"],
            },
        },
    },
    required: ["taskType", "videoSearchQuery", "readingSearchQuery"],
};

// Task titles like "Watch: ..." / "Read: ..." / "Quiz: ..." state their type
// outright - that wins over the model's classification so a "Watch" task is
// always treated (and checked) as a video task.
function typeFromTitle(title: string): TaskType | null {
    const t = title.trim().toLowerCase();
    if (/^(watch|video|lecture|view)\b/.test(t)) return "video";
    if (/^(read|reading|study the docs?)\b/.test(t)) return "reading";
    if (/^(quiz|self[- ]?assess(ment)?|test yourself)\b/.test(t)) return "quiz";
    if (/^(project|build|capstone)\b/.test(t)) return "project";
    if (/^(practice|exercise|hands[- ]?on|lab|implement|solve)\b/.test(t)) return "practice";
    if (/^(revise|revision|review|recap)\b/.test(t)) return "revision";
    return null;
}

function buildContentPlanPrompt(ctx: ResourceDiscoveryContext): string {
    return [
        "You are an expert instructor preparing study material for one task in a learner's study plan.",
        contextLines(ctx),
        ctx.completionCriteria ? `Completion criteria: ${ctx.completionCriteria}` : "",
        "",
        "1. Classify the task as exactly one taskType: \"video\" (watching a lecture/tutorial), \"reading\" (articles/docs), \"practice\" (hands-on exercise), \"quiz\" (self-assessment), \"project\" (build a deliverable) or \"revision\" (reviewing earlier material).",
        "2. Write videoSearchQuery: a concise YouTube search query (max ~10 words) that would find a good lecture/tutorial on this task's topic.",
        "3. Write readingSearchQuery: a concise web search query (max ~10 words) for good articles or documentation on this topic.",
        "4. If taskType is \"practice\" or \"project\", include `guide`: overview (what to do and why), steps (clear numbered instructions), examples (concrete worked examples or sample inputs/outputs), expectedOutcomes (what the learner should be able to show), and for projects deliverables (exact artifacts to produce). Omit `guide` for other task types.",
        "5. If taskType is \"quiz\" or \"revision\", include `quiz`: 5 multiple-choice questions that check the phase objectives, each with 4 options, the zero-based correctIndex of the single correct option, and an explanation of why it is correct. Omit `quiz` for other task types.",
        "Hard rules: match the learner's level. Never include any URL, link, or the name of a specific video, article, book, course or channel anywhere in your output - resources are found separately by search.",
        "Return ONLY the structured JSON result.",
    ]
        .filter(Boolean)
        .join("\n");
}

async function planContent(ctx: ResourceDiscoveryContext): Promise<ContentPlan> {
    const ai = getGeminiClient();
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await ai.models.generateContent({
                model: getStudyPlannerModel(),
                contents: buildContentPlanPrompt(ctx),
                config: {
                    responseMimeType: "application/json",
                    responseSchema: CONTENT_PLAN_RESPONSE_SCHEMA,
                    temperature: 0.4,
                },
            });
            const text = response.text;
            if (!text) throw new Error("Empty response.");
            return ContentPlanSchema.parse(JSON.parse(text));
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError;
}

function sanitizeGuide(guide: ContentPlan["guide"]): TaskGuide | undefined {
    if (!guide) return undefined;
    const cleaned: TaskGuide = {
        overview: stripUrls(guide.overview),
        steps: cleanList(guide.steps, 12),
        examples: cleanList(guide.examples, 6),
        expectedOutcomes: cleanList(guide.expectedOutcomes, 8),
        deliverables: cleanList(guide.deliverables, 8),
    };
    return cleaned.overview || cleaned.steps.length > 0 ? cleaned : undefined;
}

function sanitizeQuiz(quiz: ContentPlan["quiz"]): QuizQuestion[] | undefined {
    const valid = (quiz ?? [])
        .filter((q) => q.correctIndex < q.options.length)
        .map((q) => ({
            question: stripUrls(q.question),
            options: q.options.map(stripUrls),
            correctIndex: q.correctIndex,
            explanation: stripUrls(q.explanation),
        }))
        .filter((q) => q.question.length > 0 && q.options.every((o) => o.length > 0));
    return valid.length > 0 ? valid : undefined;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function discoverTaskLearningResources(ctx: ResourceDiscoveryContext): Promise<TaskLearningResources> {
    let plan: ContentPlan | null = null;
    try {
        plan = await planContent(ctx);
    } catch {
        // Classification failing shouldn't block real-resource discovery -
        // fall back to the title and plain search queries.
        plan = null;
    }

    const taskType: TaskType = typeFromTitle(ctx.taskTitle) ?? plan?.taskType ?? "reading";
    const baseQuery = ctx.taskTitle.replace(/^[^:]{1,25}:\s*/, "").trim() || ctx.taskTitle;
    const videoQuery = plan?.videoSearchQuery || baseQuery;
    const readingQuery = plan?.readingSearchQuery || baseQuery;

    const [videoResult, readingResult] = await Promise.all([
        discoverVideos(ctx, videoQuery).catch(() => ({ status: "unavailable" as const, videos: [] })),
        discoverReadings(ctx, readingQuery).catch(() => ({ status: "unavailable" as const, readings: [] })),
    ]);

    return {
        taskType,
        generatedForTitle: ctx.taskTitle,
        generatedAt: Date.now(),
        videoSearchStatus: videoResult.status,
        readingSearchStatus: readingResult.status,
        videos: videoResult.videos,
        readings: readingResult.readings,
        guide: taskType === "practice" || taskType === "project" ? sanitizeGuide(plan?.guide) : undefined,
        quiz: taskType === "quiz" || taskType === "revision" ? sanitizeQuiz(plan?.quiz) : undefined,
    };
}
