import { NextRequest, NextResponse } from "next/server";
import ImageKit from "imagekit";
import axios from "axios";
// import { aj } from "@/utils/arcjet";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { sanitizeFreeText } from "@/utils/sanitizeText";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Interview question generation can take a while (AI generation via N8N), match the raised proxy timeout
export const maxDuration = 300;

// Gemini sometimes emits raw, unescaped control characters (e.g. literal newlines) inside
// JSON string values, which JSON.parse rejects. Escape/strip control chars only while inside
// a string literal so structural whitespace outside strings is left untouched.
// Gemini occasionally ignores the "return JSON" instruction and replies with plain
// "Q.1 ... / A.1 ..." text instead (seen on the resume-upload path). Fall back to
// extracting question/answer pairs from that format when JSON.parse fails.
function parsePlainTextQA(text: string): { question: string; answer: string }[] {
    const lines = text.split(/\r?\n/);
    const results: { question: string; answer: string }[] = [];
    let current: { question: string; answer: string } | null = null;
    let mode: "question" | "answer" | null = null;

    const qMatch = (line: string) => line.match(/^\s*Q\.?\s*\d+\s*[:.)]?\s*(.*)$/i);
    const aMatch = (line: string) => line.match(/^\s*A\.?\s*\d+\s*[:.)]?\s*(.*)$/i);

    for (const line of lines) {
        const q = qMatch(line);
        const a = aMatch(line);
        if (q) {
            if (current) results.push(current);
            current = { question: q[1].trim(), answer: "" };
            mode = "question";
        } else if (a && current) {
            current.answer = a[1].trim();
            mode = "answer";
        } else if (current && mode) {
            const trimmed = line.trim();
            if (trimmed) {
                current[mode] = current[mode] ? `${current[mode]} ${trimmed}` : trimmed;
            }
        }
    }
    if (current) results.push(current);
    return results.filter((item) => item.question);
}

// n8n/Gemini often wraps the JSON payload in a markdown code fence (```json ... ```)
// instead of returning bare JSON, which makes JSON.parse throw outright. Strip the
// fence (if present) before parsing.
function stripMarkdownCodeFence(text: string): string {
    const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return match ? match[1] : text.trim();
}

// Pulls the question/answer pair out of a question object regardless of which key
// names n8n used for them - it has used both the old "Q.1"/"A.1" style keys and the
// current "question"/"model_answer" keys (alongside an unrelated "question_number"
// key that also happens to start with "Q", which a naive startsWith("Q") match would
// pick up instead of the real question text).
function pickQuestionAnswer(item: Record<string, unknown>): { question: string; answer: string } {
    const entries = Object.entries(item);
    const question =
        entries.find(([key]) => /^q(uestion)?$/i.test(key))?.[1] ??
        entries.find(([key]) => /question/i.test(key) && !/number/i.test(key))?.[1] ??
        entries.find(([key]) => key.toUpperCase().startsWith("Q"))?.[1] ??
        "";
    const answer =
        entries.find(([key]) => /^a(nswer)?$/i.test(key))?.[1] ??
        entries.find(([key]) => /answer/i.test(key))?.[1] ??
        entries.find(([key]) => key.toUpperCase().startsWith("A"))?.[1] ??
        "";
    return { question: String(question ?? ""), answer: String(answer ?? "") };
}

function sanitizeJsonControlChars(text: string): string {
    let result = "";
    let inString = false;
    let escapeNext = false;
    for (const char of text) {
        if (escapeNext) {
            result += char;
            escapeNext = false;
            continue;
        }
        if (char === "\\" && inString) {
            result += char;
            escapeNext = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            result += char;
            continue;
        }
        if (inString) {
            const code = char.charCodeAt(0);
            if (code === 0x0a) { result += "\\n"; continue; }
            if (code === 0x0d) { result += "\\r"; continue; }
            if (code === 0x09) { result += "\\t"; continue; }
            if (code < 0x20) { continue; }
        }
        result += char;
    }
    return result;
}

export async function POST(req:NextRequest) {
    const user = await currentUser();
    if (!user) {
        return NextResponse.json(
            { error: "You must be logged in to create an interview." },
            { status: 401 }
        );
    }
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const convexUser = await convexClient.query(api.users.GetUserByEmail, { email });
    if (!convexUser) {
        return NextResponse.json(
            { error: "You must be logged in to create an interview." },
            { status: 401 }
        );
    }
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const jobTitle = formData.get('jobTitle') as string | null;
    const companyName = (formData.get('companyName') as string | null) ?? '';
    // Pasted job posts drag along bullet glyphs, smart quotes/dashes, and
    // inconsistent line endings that can confuse the n8n prompt - normalize
    // before it's sent, same as the Practice Coach generation route.
    const jobDescriptionRaw = formData.get('jobDescription') as string | null;
    const jobDescription = jobDescriptionRaw ? sanitizeFreeText(jobDescriptionRaw) : jobDescriptionRaw;
    const mode = (formData.get('mode') as string | null) || 'technical';
    const level = (formData.get('level') as string | null) || 'basic';
    const qno = (formData.get('qno') as string | null) || '3';
    const lang = (formData.get('lang') as string | null) || 'en';
    const hasFile = !!file && file.size > 0;
    // Paused until package/credit options are integrated - resume by uncommenting.
    // const rateLimitUserId = user?.primaryEmailAddress?.emailAddress??'';
    // const rateLimitStatus = await convexClient.mutation(api.rateLimit.consumeGenerateInterviewQuestions, { userId: rateLimitUserId });
    // console.log("Convex rate limit userId:", rateLimitUserId, "ok:", rateLimitStatus.ok, "retryAfter:", rateLimitStatus.retryAfter);
    //
    // if(!rateLimitStatus.ok)
    // {
    //     return NextResponse.json({
    //         status:429,
    //         result:'No free credit remaining, try again later'
    //     }, { status: 429 })
    // }

    try{

        let resumeUrl: string | null = null;

        if (hasFile) {
            const imagekit = new ImageKit({
                publicKey: process.env.IMAGEKIT_URL_PUBLIC_KEY as string,
                privateKey: process.env.IMAGEKIT_URL_PRIVATE_KEY as string,
                urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT as string
            });

            const bytes = await file.arrayBuffer();
            const buffer = Buffer.from(bytes);

            const uploadPdf = await imagekit.upload({
                file:buffer,
                fileName: Date.now().toString()+".pdf",
                isPublished: true
            });
            resumeUrl = uploadPdf?.url;
        }

        //Call N8N workflow - same webhook handles resume-based and jobTitle/jobDescription-based generation
        const result = await axios.post("https://n8n.vistechsolutions.online/webhook/generate-interview-question", {
            resumeUrl,
            job_title: jobTitle,
            company: companyName,
            job_desc: jobDescription,
            modes: mode,
            level,
            qno,
            lang
        }, {
            timeout: 280000 // stay just under the 300s proxy/maxDuration ceiling
        });
        console.log(result.data)

        // N8N returns a raw Gemini candidate object; the JSON-encoded questions live at content.parts[0].text
        const rawContent = result.data?.content?.parts?.[0]?.text;

        let allQuestions: { question: string; answer: string }[];
        if (typeof rawContent === "string") {
            try {
                const parsedContent = JSON.parse(sanitizeJsonControlChars(stripMarkdownCodeFence(rawContent)));
                allQuestions = (parsedContent?.questions ?? []).map(pickQuestionAnswer);
            } catch {
                // Gemini didn't return JSON this time - fall back to parsing the plain "Q.1/A.1" text.
                allQuestions = parsePlainTextQA(rawContent);
            }
        } else {
            allQuestions = (rawContent?.questions ?? []).map(pickQuestionAnswer);
        }

        // N8N/Gemini doesn't always honor the requested question count - enforce it here
        // rather than trusting the upstream response as-is.
        const requestedQno = parseInt(qno, 10);
        const questions = requestedQno > 0 ? allQuestions.slice(0, requestedQno) : allQuestions;

        // Save here, server-side, right after generation succeeds - the previous flow
        // returned the questions to the browser and relied on a second, separate
        // mutation call from the client to persist them. That extra round trip was a
        // silent single point of failure: if it didn't complete, the questions were
        // "generated" (this call succeeded) but never written to InterviewSessionTable,
        // so the interview had nothing to continue into.
        const interviewId = await convexClient.mutation(api.Interview.SaveInterviewQuestions, {
            questions,
            uid: convexUser._id,
            resumeUrl: resumeUrl ?? undefined,
            resumeFileName: hasFile ? file.name : undefined,
            jobTitle: jobTitle ?? undefined,
            jobDescription: jobDescription ?? undefined,
            mode,
            level,
            qno: requestedQno,
            lang,
        });

        return NextResponse.json({
            interviewId,
            questions,
            resumeUrl,
            resumeFileName: hasFile ? file.name : null,
            status:200
        });
    }catch(e){
        console.log(e);
        return NextResponse.json({ error: "Failed to generate interview questions" }, { status: 500 });
    }
}