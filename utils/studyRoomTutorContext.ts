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

function buildWelcomeMessage(params: {
  learnerName: string;
  topic: string;
  objective?: string;
  isResume: boolean;
}): string {
  if (params.isResume) {
    return `Welcome back! Let's continue where we left off on ${params.topic}.`;
  }
  const objectiveClause = params.objective
    ? ` By the end of this session, you'll be able to ${params.objective}.`
    : "";
  return `Welcome, ${params.learnerName}! Today we're going to explore ${params.topic}. I'll explain the concept, walk through examples, and then ask you a few questions to check your understanding.${objectiveClause}`;
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
