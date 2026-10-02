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
    const ttsConfig = agentRes.data?.conversation_config?.tts;
    const agentConfig = agentRes.data?.conversation_config?.agent;
    const voiceId = ttsConfig?.voice_id;
    if (!voiceId) {
        throw new Error("ElevenLabs agent response missing conversation_config.tts.voice_id");
    }

    // The raw TTS endpoint below only narrates the text we send it - it never
    // plays the agent's configured greeting the way a live conversation
    // would, so prepend that greeting ourselves.
    const firstMessage =
        typeof agentConfig?.first_message === "string" ? agentConfig.first_message.trim() : "";
    const fullNarration = firstMessage ? `${firstMessage}\n\n${params.narrationText}` : params.narrationText;

    const ttsRes = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
            text: fullNarration,
            model_id: ttsConfig?.model_id ?? "eleven_multilingual_v2",
            // Match the agent's own tuned voice settings instead of relying on
            // the API's bare defaults, which can come out muffled/inconsistent.
            voice_settings: {
                stability: typeof ttsConfig?.stability === "number" ? ttsConfig.stability : 0.5,
                similarity_boost:
                    typeof ttsConfig?.similarity_boost === "number" ? ttsConfig.similarity_boost : 0.8,
                style: typeof ttsConfig?.style === "number" ? ttsConfig.style : 0.3,
                use_speaker_boost: true,
            },
        },
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
