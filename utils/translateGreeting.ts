import {
    ENGLISH_GREETING_TEMPLATE,
    ENGLISH_ROLE_FALLBACK,
    isValidGreetingTemplate,
} from "./elevenlabsContext";

// Translates the interview's English opening greeting into an admin-added
// language with Gemini, once, when the language is added (or re-translated from
// admin Settings > Languages). The result is stored in Convex and spoken
// verbatim by the ElevenLabs agent - see buildInterviewDynamicVariables.
//
// Needs GEMINI_API_KEY; GEMINI_MODEL optionally overrides the model.

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export interface TranslatedGreeting {
    greeting: string;
    roleFallback: string;
}

export async function translateGreeting(languageLabel: string): Promise<TranslatedGreeting> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

    const prompt = [
        `Translate the following job interview greeting and role phrase from English into ${languageLabel}.`,
        "Rules:",
        "- Keep the placeholders {name} and {role} exactly as written (same braces, untranslated).",
        "- Keep the words \"Pass\" and \"Done\" in English and capitalized - the interviewer listens for those exact words.",
        "- Use a natural, polite, spoken tone suitable for text-to-speech. No extra commentary.",
        "- \"roleFallback\" replaces {role} when there is no job title, so it must read naturally in that position of the greeting.",
        'Return JSON only: {"greeting": "...", "roleFallback": "..."}',
        "",
        `greeting: ${ENGLISH_GREETING_TEMPLATE}`,
        `roleFallback: ${ENGLISH_ROLE_FALLBACK}`,
    ].join("\n");

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
            }),
        }
    );
    if (!res.ok) {
        throw new Error(`Gemini request failed: ${res.status} ${await res.text().catch(() => "")}`);
    }

    const data = await res.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = text ? JSON.parse(text) : null;
    const greeting = typeof parsed?.greeting === "string" ? parsed.greeting.trim() : "";
    const roleFallback = typeof parsed?.roleFallback === "string" ? parsed.roleFallback.trim() : "";

    if (!isValidGreetingTemplate(greeting) || !roleFallback) {
        throw new Error("Gemini returned an unusable greeting translation");
    }
    return { greeting, roleFallback };
}
