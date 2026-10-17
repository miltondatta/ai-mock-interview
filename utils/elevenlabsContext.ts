import { InterviewQA } from "./knowledgeBase";

// ElevenLabs dynamic variables only accept scalar values (string/number/boolean),
// so the question list is flattened into one numbered block instead of being
// passed as a structured array. The agent's system prompt/first message must
// reference these by name, e.g. {{interview_questions}}, {{candidate_name}}.
export type InterviewDynamicVariables = Record<string, string>;

// ElevenLabs speaks the agent's configured "First message" straight to TTS the
// moment the call connects - it only does literal {{var}} substitution, the LLM
// never sees or reasons about it, so a "translate the first message" instruction
// in the system prompt has no effect on it. To actually greet the candidate in
// their chosen language, the agent's dashboard "First message" field must be
// set to the literal variable reference "{{first_message}}", and the already-
// localized, already-interpolated text is computed here instead.
//
// "Pass"/"Done" are left untranslated (and capitalized) in every language since
// the system prompt's question-progression logic listens for those exact English
// words regardless of interview language.
const FIRST_MESSAGE_TEMPLATES: Record<string, (name: string, role: string) => string> = {
    en: (name, role) =>
        `Hi ${name}, thanks for joining. I'll be conducting your interview session today for ${role} - take your time with each answer, and let me know if you'd like anything repeated. Let's get started. Answer rules: Say Pass if you want to pass any question, and Say Done if you finish the answer. First, introduce yourself.`,
    bn: (name, role) =>
        `হ্যালো ${name}, যোগ দেওয়ার জন্য ধন্যবাদ। আজ ${role} পদের জন্য আপনার সাক্ষাৎকারটি আমি নেব। প্রতিটি প্রশ্নের উত্তর দেওয়ার জন্য আপনি যথেষ্ট সময় নিতে পারেন; কোনো প্রশ্ন পুনরায় শোনার প্রয়োজন হলে আমাকে জানাবেন। তাহলে শুরু করা যাক। উত্তর দেওয়ার নিয়ম: কোনো প্রশ্ন এড়িয়ে যেতে চাইলে 'Pass' বলুন এবং উত্তর দেওয়া শেষ হলে 'Done' বলুন। প্রথমেই, নিজের সম্পর্কে কিছু বলুন।`,
    hi: (name, role) =>
        `नमस्ते ${name}, जुड़ने के लिए धन्यवाद। आज मैं आपका ${role} पद के लिए इंटरव्यू सेशन लूंगा - हर जवाब के लिए अपना समय लें, और अगर कुछ दोहराना चाहें तो मुझे बताएं। चलिए शुरू करते हैं। जवाब देने के नियम: अगर किसी सवाल को छोड़ना चाहें तो Pass बोलें, और जवाब पूरा होने पर Done बोलें। सबसे पहले, अपना परिचय दें।`,
    es: (name, role) =>
        `Hola ${name}, gracias por unirte. Hoy estaré realizando tu sesión de entrevista para el puesto de ${role} - tómate tu tiempo con cada respuesta, y avísame si quieres que repita algo. Empecemos. Reglas para responder: di Pass si quieres pasar alguna pregunta, y di Done cuando termines tu respuesta. Primero, preséntate.`,
    fr: (name, role) =>
        `Bonjour ${name}, merci de vous joindre à nous. Aujourd'hui, je vais conduire votre entretien pour le poste de ${role} - prenez votre temps pour chaque réponse, et dites-le-moi si vous souhaitez que je répète quelque chose. Commençons. Règles de réponse : dites Pass si vous souhaitez passer une question, et dites Done lorsque vous avez terminé votre réponse. Pour commencer, présentez-vous.`,
    de: (name, role) =>
        `Hallo ${name}, danke, dass Sie dabei sind. Heute führe ich Ihr Interview für die Stelle als ${role} - nehmen Sie sich Zeit für jede Antwort, und sagen Sie mir Bescheid, falls ich etwas wiederholen soll. Fangen wir an. Antwortregeln: Sagen Sie Pass, wenn Sie eine Frage überspringen möchten, und sagen Sie Done, wenn Sie Ihre Antwort beendet haben. Stellen Sie sich zunächst kurz vor.`,
    ar: (name, role) =>
        `مرحبًا ${name}، شكرًا لانضمامك. سأجري اليوم جلسة المقابلة الخاصة بك لوظيفة ${role} - خذ وقتك في كل إجابة، وأخبرني إذا أردت إعادة أي شيء. لنبدأ. قواعد الإجابة: قل Pass إذا أردت تخطي أي سؤال، وقل Done عند الانتهاء من إجابتك. أولاً، عرّف بنفسك.`,
    zh: (name, role) =>
        `你好 ${name}，感谢你加入。今天我将为你主持 ${role} 职位的面试 - 请按自己的节奏回答每个问题，如果需要我重复某些内容，请告诉我。我们开始吧。回答规则：如果想跳过某个问题，请说 Pass；回答完成后，请说 Done。首先，请先做个自我介绍。`,
};

const ROLE_FALLBACK: Record<string, string> = {
    en: "this position",
    bn: "এই",
    hi: "इस पद",
    es: "este puesto",
    fr: "ce poste",
    de: "diese Stelle",
    ar: "هذه الوظيفة",
    zh: "这个职位",
};

// Normalizes a stored/selected language code (e.g. "bn-BD", "EN_us") down to a
// base ISO 639-1 code that has a first-message template, falling back to English
// for missing/unsupported values. To support another language, add it to both
// FIRST_MESSAGE_TEMPLATES and ROLE_FALLBACK above.
export function resolveInterviewLanguage(language: string | null | undefined): string {
    const base = (language ?? "").trim().toLowerCase().split(/[-_]/)[0];
    return base && base in FIRST_MESSAGE_TEMPLATES ? base : "en";
}

export function buildInterviewFirstMessage(candidateName: string, jobTitle: string | undefined, language: string): string {
    const template = FIRST_MESSAGE_TEMPLATES[language] ?? FIRST_MESSAGE_TEMPLATES.en;
    const role = jobTitle?.trim() || ROLE_FALLBACK[language] || ROLE_FALLBACK.en;
    return template(candidateName, role);
}

export function buildInterviewDynamicVariables(params: {
    candidateName: string;
    questions: InterviewQA[];
    jobTitle?: string;
    jobDescription?: string;
    // ISO 639-1 code, e.g. "bn" for Bangla - also sent as the WebRTC session's
    // overrides.agent.language (see elevenlabsContext's caller in
    // app/api/interview/start/route.ts), but exposed here too so the agent's
    // own prompt/first message can reference {{interview_language}} to
    // translate/convert its first message into the candidate's chosen language.
    language?: string;
}): InterviewDynamicVariables {
    const questionList = params.questions
        .map((qa, index) => `${index + 1}. ${qa.question}`)
        .join("\n");
    const language = resolveInterviewLanguage(params.language);

    return {
        candidate_name: params.candidateName,
        interview_questions: questionList,
        job_title: params.jobTitle ?? "",
        job_description: params.jobDescription ?? "",
        interview_language: language,
        first_message: buildInterviewFirstMessage(params.candidateName, params.jobTitle, language),
    };
}
