import axios from "axios";
import { resolveInterviewLanguage } from "./elevenlabsContext";

// Same idea as the interview agent's FIRST_MESSAGE_TEMPLATES in
// elevenlabsContext.ts: the agent's dashboard first message is English-only,
// so the greeting for every other language is pre-localized here. English
// keeps using the agent's own configured first message, and a language preset
// configured on the agent in ElevenLabs takes precedence over these.
const PRACTICE_COACH_FIRST_MESSAGE_TEMPLATES: Record<string, (name: string) => string> = {
    bn: (name) =>
        `হ্যালো ${name}, আমি আপনার প্র্যাকটিস কোচ। আপনার রেজিউমে এবং চাকরির বিবরণের ভিত্তিতে কয়েকটি সাধারণ ইন্টারভিউ প্রশ্নের উত্তর কীভাবে দিতে হয়, তা আমি আপনাকে দেখিয়ে দেব।`,
    hi: (name) =>
        `नमस्ते ${name}, मैं आपका प्रैक्टिस कोच हूँ। आपके रिज़्यूमे और जॉब डिस्क्रिप्शन के आधार पर मैं आपको कुछ आम इंटरव्यू सवालों के जवाब देने का तरीका बताऊँगा।`,
    es: (name) =>
        `Hola ${name}, soy tu coach de práctica. Te guiaré sobre cómo responder algunas preguntas comunes de entrevista basadas en tu currículum y la descripción del puesto.`,
    fr: (name) =>
        `Bonjour ${name}, je suis votre coach d'entraînement. Je vais vous guider pour répondre à quelques questions d'entretien courantes, en fonction de votre CV et de la description du poste.`,
    de: (name) =>
        `Hallo ${name}, ich bin Ihr Übungscoach. Ich zeige Ihnen, wie Sie einige häufige Interviewfragen beantworten können - basierend auf Ihrem Lebenslauf und der Stellenbeschreibung.`,
    ar: (name) =>
        `مرحبًا ${name}، أنا مدربك للتدريب. سأرشدك إلى كيفية الإجابة عن بعض أسئلة المقابلات الشائعة بناءً على سيرتك الذاتية والوصف الوظيفي.`,
    zh: (name) =>
        `你好 ${name}，我是你的练习教练。我将根据你的简历和职位描述，指导你如何回答一些常见的面试问题。`,
};

// The practice_coach webhook returns a raw Gemini candidate object, with the
// generated content at content.parts[0].text as a ```json-fenced string of
// shape { practice_scripts: [{ question, answer_script, coaching_note, ... }] }
// (confirmed against a live PracticeCoachTable row on 2026-10-02). Coaching
// notes are for the candidate to read themselves, not for the narrator, so
// only question + answer_script are read aloud.
function stripCodeFence(text: string): string {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return fenced ? fenced[1].trim() : text.trim();
}

export interface PracticeScriptSegment {
    question: string;
    // Exactly what gets narrated for this question - "Question: ...\nAnswer: ...".
    text: string;
}

const QUESTION_LABEL = "Question: ";

function getRawContent(webhookData: unknown): string | null {
    const rawContent = (webhookData as { content?: { parts?: { text?: unknown }[] } })?.content
        ?.parts?.[0]?.text;
    return typeof rawContent === "string" ? rawContent : null;
}

// Returns the parsed practice_scripts array, or null if the response isn't
// JSON / doesn't have that shape at all (as opposed to parsing fine but the
// scripts themselves being incomplete, which callers handle separately).
function tryParsePracticeScripts(
    rawContent: string
): { question?: string; answer_script?: string }[] | null {
    try {
        const parsed = JSON.parse(stripCodeFence(rawContent));
        const scripts = parsed?.practice_scripts;
        return Array.isArray(scripts) ? scripts : null;
    } catch {
        return null;
    }
}

// Structured per-question breakdown, when the webhook returned the expected
// shape - this is what lets the audio be timestamped per question below.
// Entries without an answer_script are dropped rather than narrated with a
// dangling "Answer:" and nothing after it - that happens when the n8n
// workflow echoes back the requested questions without actually generating
// answers for them, which is a gap in that workflow, not here.
export function extractPracticeScriptSegments(webhookData: unknown): PracticeScriptSegment[] {
    const rawContent = getRawContent(webhookData);
    if (rawContent === null) return [];

    const scripts = tryParsePracticeScripts(rawContent);
    if (!scripts) return [];

    return scripts
        .filter(
            (item): item is { question?: string; answer_script: string } =>
                typeof item?.answer_script === "string" && item.answer_script.trim().length > 0
        )
        .map((item) => ({
            question: item.question ?? "",
            text: `${QUESTION_LABEL}${item.question ?? ""}\nAnswer: ${item.answer_script}`,
        }));
}

export function extractPracticeScriptNarration(webhookData: unknown): string {
    const rawContent = getRawContent(webhookData);
    if (rawContent === null) return "";

    const scripts = tryParsePracticeScripts(rawContent);
    if (scripts) {
        // Recognized shape - only narrate questions that actually have an
        // answer. If none do, there's genuinely nothing to narrate yet.
        return extractPracticeScriptSegments(webhookData)
            .map((segment) => segment.text)
            .join("\n\n");
    }

    // Not the expected shape at all - fall back to reading the raw text so
    // at least something is narrated.
    return rawContent.trim();
}

export interface QuestionTimelineEntry {
    question: string;
    // Seconds into the generated audio where this question starts being read.
    startTime: number;
}

function buildTtsRequestBody(text: string, ttsConfig: Record<string, unknown> | undefined) {
    return {
        text,
        // Forced to eleven_v3 regardless of the agent's configured model_id:
        // eleven_multilingual_v2 (the agent's dashboard default) only covers 29
        // languages and does not include Bengali - it reads Bengali script as
        // gibberish instead of erroring, which is why it went unnoticed. v3
        // covers 70+ languages (Bengali included) and auto-detects the language
        // from the text itself, so no language_code hint is needed here.
        model_id: "eleven_v3",
        // Match the agent's own tuned voice settings instead of relying on
        // the API's bare defaults, which can come out muffled/inconsistent.
        voice_settings: {
            stability: typeof ttsConfig?.stability === "number" ? ttsConfig.stability : 0.5,
            similarity_boost:
                typeof ttsConfig?.similarity_boost === "number" ? ttsConfig.similarity_boost : 0.8,
            style: typeof ttsConfig?.style === "number" ? ttsConfig.style : 0.3,
            use_speaker_boost: true,
        },
    };
}

// eleven_v3 caps how much text one request can narrate - a full 3-question
// script sent as one block came back cut off partway through the last answer.
// Narration is split into chunks under this size, voiced one request each,
// and the resulting audio joined back together.
const MAX_TTS_CHARS = 2000;
// Requested explicitly so every chunk is constant-bitrate 128kbps MP3.
const TTS_OUTPUT_FORMAT = "mp3_44100_128";
const MP3_BYTES_PER_SECOND = 128000 / 8;

// Splits on sentence boundaries (Latin and Bangla/Hindi danda), packing whole
// sentences into chunks up to MAX_TTS_CHARS. A single sentence over the limit
// is broken at the last space before it.
function splitForTts(text: string): string[] {
    const sentences = text.split(/(?<=[.!?।\n])\s+/).filter((s) => s.trim().length > 0);
    const chunks: string[] = [];
    let current = "";
    for (let sentence of sentences) {
        while (sentence.length > MAX_TTS_CHARS) {
            const breakAt = sentence.lastIndexOf(" ", MAX_TTS_CHARS);
            const cut = breakAt > 0 ? breakAt : MAX_TTS_CHARS;
            if (current) {
                chunks.push(current);
                current = "";
            }
            chunks.push(sentence.slice(0, cut).trim());
            sentence = sentence.slice(cut).trim();
        }
        if (current && current.length + 1 + sentence.length > MAX_TTS_CHARS) {
            chunks.push(current);
            current = sentence;
        } else {
            current = current ? `${current} ${sentence}` : sentence;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

// {{...}} dynamic variables only ever get filled in during a live ElevenLabs
// conversation - here we call the raw TTS endpoint directly, so they have to
// be substituted by hand or TTS reads them out literally. Any placeholder
// naming the candidate ({{username}}, {{candidate_name}}, or a misspelling of
// it) becomes their name; anything else is dropped rather than read aloud.
function fillNamePlaceholders(text: string, candidateName: string): string {
    return text.replace(/\{\{\s*([^}]*?)\s*\}\}/g, (_, variable: string) =>
        /name/i.test(variable) ? candidateName : ""
    );
}

// Looks up the agent's configured voice, then renders the narration through
// ElevenLabs TTS with that voice. When structured per-question segments are
// available, the timestamped TTS endpoint lets the UI show each question in
// sync with when the narrator actually starts reading it; otherwise the
// narration has no timeline.
export async function generatePracticeCoachAudio(params: {
    apiKey: string;
    agentId: string;
    narrationText: string;
    segments: PracticeScriptSegment[];
    candidateName: string;
    // Practice Coach language code, e.g. "bn" - picks the greeting's language.
    language?: string;
}): Promise<{ audio: Buffer; questionTimeline: QuestionTimelineEntry[] }> {
    const agentRes = await axios.get(
        `https://api.elevenlabs.io/v1/convai/agents/${params.agentId}`,
        { headers: { "xi-api-key": params.apiKey } }
    );
    const ttsConfig = agentRes.data?.conversation_config?.tts;
    const agentConfig = agentRes.data?.conversation_config?.agent;
    const voiceId = ttsConfig?.voice_id;
    if (!voiceId) {
        throw new Error("ElevenLabs agent response missing conversation_config.tts.voice_id");
    }

    // The raw TTS endpoint below only narrates the text we send it - it never
    // plays the agent's configured greeting the way a live conversation
    // would, so prepend that greeting ourselves.
    const language = resolveInterviewLanguage(params.language);
    const presetFirstMessage =
        agentRes.data?.conversation_config?.language_presets?.[language]?.overrides?.agent?.first_message;
    const localizedTemplate = PRACTICE_COACH_FIRST_MESSAGE_TEMPLATES[language];
    let rawFirstMessage = "";
    if (typeof presetFirstMessage === "string" && presetFirstMessage.trim()) {
        rawFirstMessage = presetFirstMessage.trim();
    } else if (localizedTemplate) {
        rawFirstMessage = localizedTemplate(params.candidateName);
    } else if (typeof agentConfig?.first_message === "string") {
        rawFirstMessage = agentConfig.first_message.trim();
    }
    const firstMessage = fillNamePlaceholders(rawFirstMessage, params.candidateName);

    const headers = { "xi-api-key": params.apiKey, "Content-Type": "application/json" };

    // Each chunk is its own TTS request (see MAX_TTS_CHARS). segmentIndex marks
    // the chunk a question's narration starts in, for the timeline below.
    const chunks: { text: string; segmentIndex?: number }[] = [];
    if (firstMessage) chunks.push(...splitForTts(firstMessage).map((text) => ({ text })));
    if (params.segments.length > 0) {
        params.segments.forEach((segment, segmentIndex) => {
            splitForTts(fillNamePlaceholders(segment.text, params.candidateName)).forEach((text, i) => {
                chunks.push(i === 0 ? { text, segmentIndex } : { text });
            });
        });
    } else {
        // No structured segments - narrate the raw text with no per-question timeline.
        chunks.push(
            ...splitForTts(fillNamePlaceholders(params.narrationText, params.candidateName)).map((text) => ({ text }))
        );
    }

    // Sequential rather than parallel to stay within ElevenLabs' per-account
    // concurrency limit.
    const audioParts: Buffer[] = [];
    const questionTimeline: QuestionTimelineEntry[] = [];
    let offsetSeconds = 0;
    for (const chunk of chunks) {
        const ttsRes = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=${TTS_OUTPUT_FORMAT}`,
            buildTtsRequestBody(chunk.text, ttsConfig),
            { headers, timeout: 120000 }
        );

        const audioBase64 = ttsRes.data?.audio_base64;
        if (typeof audioBase64 !== "string") {
            throw new Error("ElevenLabs with-timestamps response missing audio_base64");
        }
        const audio = Buffer.from(audioBase64, "base64");

        if (chunk.segmentIndex !== undefined) {
            const startTimes: number[] = Array.isArray(ttsRes.data?.alignment?.character_start_times_seconds)
                ? ttsRes.data.alignment.character_start_times_seconds
                : [];
            // Skip past the "Question: " label to when the question itself is read.
            const labelEnd = Math.min(QUESTION_LABEL.length, startTimes.length - 1);
            const startInChunk = startTimes.length > 0 ? startTimes[labelEnd] : 0;
            questionTimeline.push({
                question: params.segments[chunk.segmentIndex].question,
                startTime: offsetSeconds + startInChunk,
            });
        }

        audioParts.push(audio);
        // Constant bitrate, so byte length gives the chunk's exact duration -
        // including trailing silence the alignment data doesn't cover.
        offsetSeconds += audio.length / MP3_BYTES_PER_SECOND;
    }

    // MP3 frames are self-contained, so the parts play back as one file when joined.
    return { audio: Buffer.concat(audioParts), questionTimeline };
}
