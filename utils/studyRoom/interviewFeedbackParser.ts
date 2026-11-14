// AI Study Room - M5 Interview Review integration. The Interview feature's
// own feedback blob has no fixed schema (InterviewSessionTable.feedback is
// v.any() and has gone through several shapes over time - see
// app/(routes)/interview/[interviewId]/feedback/page.tsx's own
// parseStructuredFeedback/parseFeedback for the UI's version of this same
// problem). This is a small, independent reimplementation for the Tutor's
// context only - it deliberately does NOT import from that page (keeping
// the two modules free of any cross-import) and only extracts short,
// non-sensitive text (weak areas / suggestions / a summary line), never the
// full interview transcript or every scored skill's raw feedback text.

export interface ParsedInterviewFeedback {
  summary?: string;
  weakAreas: string[];
  suggestions: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFeedbackData(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(text);
  } catch {
    return raw;
  }
}

const MAX_ITEMS = 10;
const MAX_TEXT = 300;

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, MAX_TEXT) : undefined;
}

export function parseInterviewFeedbackForTutor(raw: unknown): ParsedInterviewFeedback {
  const data = toFeedbackData(raw);
  const weakAreas: string[] = [];
  const suggestions: string[] = [];
  let summary: string | undefined;

  if (isRecord(data)) {
    const feedback = isRecord(data.feedback) ? data.feedback : null;

    if (feedback) {
      if (typeof feedback.summary === "string") summary = cleanText(feedback.summary);
      // Scored-skill sections (technical_skills, mode_specific_skills, etc.) -
      // only the low-scoring ones are relevant "weak areas"; the score and
      // skill name are kept, the detailed feedback text is left out to
      // avoid passing more than necessary to the LLM.
      for (const [key, value] of Object.entries(feedback)) {
        if (isRecord(value) && typeof value.score === "number" && value.score < 70) {
          const label = key.replace(/[_-]+/g, " ");
          weakAreas.push(`${label} (${value.score}/100)`);
        }
      }
      if (Array.isArray(feedback.mode_specific_skills)) {
        for (const item of feedback.mode_specific_skills) {
          if (isRecord(item) && typeof item.score === "number" && item.score < 70) {
            const name = cleanText(item.skill) ?? cleanText(item.name);
            if (name) weakAreas.push(`${name} (${item.score}/100)`);
          }
        }
      }
    }

    const suggestionField = data.suggestion ?? data.suggestions ?? feedback?.suggestion ?? feedback?.suggestions;
    if (Array.isArray(suggestionField)) {
      for (const item of suggestionField.slice(0, MAX_ITEMS)) {
        const text = cleanText(item);
        if (text) suggestions.push(text);
      }
    } else {
      const text = cleanText(suggestionField);
      if (text) suggestions.push(text);
    }

    if (!summary) {
      summary = cleanText(data.feedback) ?? cleanText(data.summary) ?? cleanText(data.overallFeedback);
    }
  } else if (typeof data === "string") {
    summary = cleanText(data);
  }

  return {
    summary,
    weakAreas: weakAreas.slice(0, MAX_ITEMS),
    suggestions: suggestions.slice(0, MAX_ITEMS),
  };
}
