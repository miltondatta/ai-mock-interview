import axios from "axios";

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
        model_id: (ttsConfig?.model_id as string | undefined) ?? "eleven_multilingual_v2",
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

// Looks up the agent's configured voice, then renders the narration through
// ElevenLabs TTS with that voice. When structured per-question segments are
// available, uses the timestamped TTS endpoint so the UI can show each
// question in sync with when the narrator actually starts reading it;
// otherwise falls back to a single plain narration with no timeline.
export async function generatePracticeCoachAudio(params: {
    apiKey: string;
    agentId: string;
    narrationText: string;
    segments: PracticeScriptSegment[];
    candidateName: string;
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
    const rawFirstMessage =
        typeof agentConfig?.first_message === "string" ? agentConfig.first_message.trim() : "";
    // The agent's profile references the candidate by the {{username}}
    // dynamic variable, which only ever gets filled in during a live
    // conversation - here we're calling the raw TTS endpoint directly, so it
    // has to be substituted by hand or it's sent to TTS as literal text.
    const firstMessage = rawFirstMessage.replace(/\{\{\s*username\s*\}\}/gi, params.candidateName);

    const headers = { "xi-api-key": params.apiKey, "Content-Type": "application/json" };

    if (params.segments.length > 0) {
        const joinedSegments = params.segments.map((segment) => segment.text).join("\n\n");
        const fullNarration = firstMessage ? `${firstMessage}\n\n${joinedSegments}` : joinedSegments;

        const ttsRes = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
            buildTtsRequestBody(fullNarration, ttsConfig),
            { headers, timeout: 120000 }
        );

        const audioBase64 = ttsRes.data?.audio_base64;
        if (typeof audioBase64 !== "string") {
            throw new Error("ElevenLabs with-timestamps response missing audio_base64");
        }

        const startTimes: number[] = Array.isArray(ttsRes.data?.alignment?.character_start_times_seconds)
            ? ttsRes.data.alignment.character_start_times_seconds
            : [];
        const startTimeAt = (charIndex: number): number => {
            if (startTimes.length === 0) return 0;
            const clamped = Math.min(Math.max(charIndex, 0), startTimes.length - 1);
            return startTimes[clamped];
        };

        // Walk the same concatenation used to build fullNarration above, so
        // each segment's character offset lines up with the alignment data.
        let cursor = firstMessage ? firstMessage.length + 2 : 0;
        const questionTimeline: QuestionTimelineEntry[] = params.segments.map((segment, index) => {
            if (index > 0) cursor += 2; // the "\n\n" joining this segment to the previous one
            const questionStartChar = cursor + QUESTION_LABEL.length;
            const entry = { question: segment.question, startTime: startTimeAt(questionStartChar) };
            cursor += segment.text.length;
            return entry;
        });

        return { audio: Buffer.from(audioBase64, "base64"), questionTimeline };
    }

    // No structured segments - narrate the raw text as a single block with
    // no per-question timeline.
    const fullNarration = firstMessage ? `${firstMessage}\n\n${params.narrationText}` : params.narrationText;
    const ttsRes = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        buildTtsRequestBody(fullNarration, ttsConfig),
        { headers, responseType: "arraybuffer", timeout: 120000 }
    );

    return { audio: Buffer.from(ttsRes.data), questionTimeline: [] };
}
