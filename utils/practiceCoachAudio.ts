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

export function extractPracticeScriptNarration(webhookData: unknown): string {
    const rawContent = (webhookData as { content?: { parts?: { text?: unknown }[] } })?.content
        ?.parts?.[0]?.text;
    if (typeof rawContent !== "string") return "";

    try {
        const parsed = JSON.parse(stripCodeFence(rawContent));
        const scripts = parsed?.practice_scripts;
        if (Array.isArray(scripts) && scripts.length > 0) {
            return scripts
                .map((item: { question?: string; answer_script?: string }) =>
                    `Question: ${item.question ?? ""}\nAnswer: ${item.answer_script ?? ""}`
                )
                .join("\n\n");
        }
    } catch {
        // Not JSON, or the shape changed - fall back to reading the raw text as-is.
    }
    return rawContent.trim();
}

// Looks up the agent's configured voice, then renders the narration text through
// ElevenLabs TTS with that voice. Returns the raw audio bytes (mp3).
export async function generatePracticeCoachAudio(params: {
    apiKey: string;
    agentId: string;
    narrationText: string;
}): Promise<Buffer> {
    const agentRes = await axios.get(
        `https://api.elevenlabs.io/v1/convai/agents/${params.agentId}`,
        { headers: { "xi-api-key": params.apiKey } }
    );
    const voiceId = agentRes.data?.conversation_config?.tts?.voice_id;
    if (!voiceId) {
        throw new Error("ElevenLabs agent response missing conversation_config.tts.voice_id");
    }

    const ttsRes = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        { text: params.narrationText, model_id: "eleven_multilingual_v2" },
        {
            headers: {
                "xi-api-key": params.apiKey,
                "Content-Type": "application/json",
            },
            responseType: "arraybuffer",
            timeout: 120000,
        }
    );

    return Buffer.from(ttsRes.data);
}
