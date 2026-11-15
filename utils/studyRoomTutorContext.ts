import { normalizeLanguageCode } from "./elevenlabsContext";

// Study Room Tutor - its own dynamic-variable/first-message builder,
// deliberately separate from utils/elevenlabsContext.ts (which stays
// Interview-only and is never modified here). Only `normalizeLanguageCode`
// is reused from it - a generic string helper with no Interview-specific
// content. The Tutor's LLM responses themselves are produced entirely by
// its own ElevenLabs Conversational AI agent (see
// app/api/study-room/tutor/start/route.ts) - this file only prepares the
// context that agent is told about; it never calls an LLM itself.

export type TutorDynamicVariables = Record<string, string>;

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

// Localized greeting scaffolding - ElevenLabs only does literal {{var}}
// substitution on the agent's dashboard "First message" field (which is set
// to the literal text "{{first_message}}"), so the LLM never sees or
// translates this text itself; a learner in a non-English `tutor_language`
// would otherwise always hear an English greeting. Covers the same language
// set already supported elsewhere in this app (see elevenlabsContext.ts's
// FIRST_MESSAGE_TEMPLATES) - an unsupported code falls back to English via
// resolveGreetingLanguage below, same degrade Interview already uses.
type FreshGreeting = (name: string, topic: string, objective: string, difficultyWord: string) => string;
type ResumeGreeting = (name: string, topic: string) => string;

const FRESH_GREETING: Record<string, FreshGreeting> = {
  en: (name, topic, objective, difficulty) =>
    `Hello ${name}! Welcome to your AI Study Room. Today we'll learn about ${topic} at a ${difficulty} level.${objective ? ` By the end of this session, you'll be able to ${objective}.` : ""} I'll explain the concepts step by step, walk through examples, and ask you a few questions along the way to check your understanding. Are you ready to begin?`,
  bn: (name, topic, objective, difficulty) =>
    `হ্যালো ${name}! তোমার AI স্টাডি রুমে স্বাগতম। আজ আমরা ${difficulty} স্তরে ${topic} নিয়ে শিখব।${objective ? ` এই সেশনের শেষে তুমি ${objective} করতে পারবে।` : ""} আমি ধারণাগুলো ধাপে ধাপে ব্যাখ্যা করব, উদাহরণ দিয়ে দেখাব, এবং তোমার বোঝাপড়া যাচাই করতে কিছু প্রশ্ন করব। শুরু করতে কি তুমি প্রস্তুত?`,
  hi: (name, topic, objective, difficulty) =>
    `नमस्ते ${name}! आपके AI स्टडी रूम में आपका स्वागत है। आज हम ${difficulty} स्तर पर ${topic} के बारे में जानेंगे।${objective ? ` इस सेशन के अंत तक आप ${objective} कर पाएंगे।` : ""} मैं अवधारणाओं को चरण दर चरण समझाऊंगा, उदाहरण दूंगा, और आपकी समझ जांचने के लिए कुछ सवाल पूछूंगा। शुरू करने के लिए तैयार हैं?`,
  es: (name, topic, objective, difficulty) =>
    `¡Hola ${name}! Bienvenido/a a tu Sala de Estudio con IA. Hoy exploraremos ${topic} a un nivel ${difficulty}.${objective ? ` Al final de esta sesión, podrás ${objective}.` : ""} Te explicaré los conceptos paso a paso, veremos ejemplos juntos y te haré algunas preguntas para comprobar tu comprensión. ¿Listo/a para comenzar?`,
  fr: (name, topic, objective, difficulty) =>
    `Bonjour ${name} ! Bienvenue dans votre Salle d'Étude IA. Aujourd'hui, nous allons explorer ${topic} à un niveau ${difficulty}.${objective ? ` À la fin de cette session, vous serez capable de ${objective}.` : ""} Je vais expliquer les concepts étape par étape, passer en revue des exemples et vous poser quelques questions pour vérifier votre compréhension. Prêt(e) à commencer ?`,
  de: (name, topic, objective, difficulty) =>
    `Hallo ${name}! Willkommen in deinem KI-Lernraum. Heute beschäftigen wir uns mit ${topic} auf ${difficulty} Niveau.${objective ? ` Am Ende dieser Sitzung wirst du in der Lage sein, ${objective}.` : ""} Ich erkläre die Konzepte Schritt für Schritt, gehe Beispiele durch und stelle dir ein paar Fragen, um dein Verständnis zu überprüfen. Bereit anzufangen?`,
  ar: (name, topic, objective, difficulty) =>
    `مرحبًا ${name}! أهلاً بك في غرفة الدراسة الخاصة بك بالذكاء الاصطناعي. سنتعرف اليوم على ${topic} بمستوى ${difficulty}.${objective ? ` بنهاية هذه الجلسة، ستكون قادرًا على ${objective}.` : ""} سأشرح المفاهيم خطوة بخطوة، ونراجع بعض الأمثلة، وسأطرح عليك بعض الأسئلة للتحقق من فهمك. هل أنت مستعد للبدء؟`,
  zh: (name, topic, objective, difficulty) =>
    `你好 ${name}！欢迎来到你的 AI 学习室。今天我们将以${difficulty}水平学习${topic}。${objective ? `在本次课程结束时，你将能够${objective}。` : ""}我会逐步讲解概念，演示例子，并通过提问来检查你的理解。准备好开始了吗？`,
};

const RESUME_GREETING: Record<string, ResumeGreeting> = {
  en: (name, topic) => `Welcome back, ${name}! Let's continue where we left off on ${topic}.`,
  bn: (name, topic) => `ফিরে আসার জন্য স্বাগতম, ${name}! চলো ${topic} নিয়ে যেখানে আমরা থেমেছিলাম সেখান থেকে চালিয়ে যাই।`,
  hi: (name, topic) => `वापसी पर स्वागत है, ${name}! चलिए ${topic} पर जहाँ हमने छोड़ा था, वहीं से आगे बढ़ते हैं।`,
  es: (name, topic) => `¡Bienvenido/a de nuevo, ${name}! Continuemos donde lo dejamos con ${topic}.`,
  fr: (name, topic) => `Content de vous revoir, ${name} ! Continuons là où nous nous étions arrêtés sur ${topic}.`,
  de: (name, topic) => `Willkommen zurück, ${name}! Lass uns dort weitermachen, wo wir bei ${topic} aufgehört haben.`,
  ar: (name, topic) => `مرحبًا بعودتك، ${name}! لنستمر من حيث توقفنا في ${topic}.`,
  zh: (name, topic) => `欢迎回来，${name}！让我们从上次关于${topic}的地方继续吧。`,
};

const DIFFICULTY_WORD: Record<string, Record<"beginner" | "intermediate" | "advanced", string>> = {
  en: { beginner: "beginner", intermediate: "intermediate", advanced: "advanced" },
  bn: { beginner: "শিক্ষানবিস", intermediate: "মধ্যবর্তী", advanced: "উচ্চ" },
  hi: { beginner: "शुरुआती", intermediate: "मध्यवर्ती", advanced: "उन्नत" },
  es: { beginner: "principiante", intermediate: "intermedio", advanced: "avanzado" },
  fr: { beginner: "débutant", intermediate: "intermédiaire", advanced: "avancé" },
  de: { beginner: "Anfänger", intermediate: "mittlerem", advanced: "fortgeschrittenem" },
  ar: { beginner: "مبتدئ", intermediate: "متوسط", advanced: "متقدم" },
  zh: { beginner: "初级", intermediate: "中级", advanced: "高级" },
};

// Falls back to English for any language this app supports elsewhere but has
// no hand-written greeting for yet, same degrade path `tutor_language` itself
// doesn't take - the agent can still converse in the learner's chosen
// language, only the opening greeting's wording falls back.
function resolveGreetingLanguage(language: string): string {
  return language in FRESH_GREETING ? language : "en";
}

function buildWelcomeMessage(params: {
  learnerName: string;
  topic: string;
  objective?: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
  language: string;
  isResume: boolean;
}): string {
  const lang = resolveGreetingLanguage(params.language);
  const name = params.learnerName?.trim() || "there";
  if (params.isResume) {
    return RESUME_GREETING[lang](name, params.topic);
  }
  const difficultyWord = DIFFICULTY_WORD[lang][params.difficulty ?? "beginner"];
  return FRESH_GREETING[lang](name, params.topic, params.objective?.trim() ?? "", difficultyWord);
}

// Condensed plain-text transcript handed to the agent as a dynamic variable
// so a reconnected session (pause/resume - see StartStudyRoomSession) can
// pick up where it left off. Every ElevenLabs `startSession()` call opens a
// brand new conversation - there is no server-side "resume this exact
// conversation" - so continuity across a reconnect is achieved by feeding
// the prior turns back in as context, not by resuming a dead connection.
function buildConversationHistorySummary(
  messages: { role: "tutor" | "learner"; text: string }[]
): string {
  if (messages.length === 0) return "";
  const recent = messages.slice(-20); // keep the variable a reasonable size
  return recent.map((m) => `${m.role === "tutor" ? "Tutor" : "Learner"}: ${m.text}`).join("\n");
}

export function buildStudyRoomDynamicVariables(params: {
  learnerName: string;
  topic: string;
  objective?: string;
  category?: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
  learningPreferences?: string[];
  additionalInstructions?: string;
  language?: string;
  priorMessages: { role: "tutor" | "learner"; text: string }[];
  // M5 - pre-built by app/api/study-room/tutor/start (see
  // utils/studyRoom/integrationContext.ts) from whichever source module
  // this room was optionally started from. Empty string when the room has
  // no integration, which is the default and fully supported path.
  integrationContext?: string;
}): { dynamicVariables: TutorDynamicVariables; firstMessage: string; language: string } {
  const isResume = params.priorMessages.length > 0;
  const language = normalizeLanguageCode(params.language) || "en";
  const firstMessage = buildWelcomeMessage({
    learnerName: params.learnerName,
    topic: params.topic,
    objective: params.objective,
    difficulty: params.difficulty,
    language,
    isResume,
  });

  const dynamicVariables: TutorDynamicVariables = {
    learner_name: params.learnerName,
    tutor_topic: params.topic,
    learning_objective: params.objective ?? "",
    category: params.category ?? "",
    difficulty_level: params.difficulty ? DIFFICULTY_LABEL[params.difficulty] : "Beginner",
    learning_preferences: (params.learningPreferences ?? []).join(", "),
    additional_instructions: params.additionalInstructions ?? "",
    tutor_language: language,
    conversation_history: buildConversationHistorySummary(params.priorMessages),
    first_message: firstMessage,
    integration_context: params.integrationContext ?? "",
  };

  return { dynamicVariables, firstMessage, language };
}
