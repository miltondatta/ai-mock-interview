// AI Study Room - M5 unified context mechanism. Each builder here takes
// already-fetched, already-ownership-checked data (from
// app/api/study-room/tutor/start) and turns it into a short, clearly
// labeled text block for the Tutor's `integration_context` dynamic
// variable (see utils/studyRoomTutorContext.ts). Nothing here calls
// Convex, an LLM, or any module's API directly - these are pure string
// builders so the actual data-fetching (and its ownership checks) stays
// visible in the route that calls them, not hidden in a util.
//
// Every section is labeled with its source so the Tutor (and, indirectly,
// the learner hearing/reading its responses) can tell user-provided/
// source-module context apart from the Tutor's own generated teaching -
// "clearly distinguish user-provided learning context from AI-generated
// recommendations" per the M5 spec.

export function buildStudyPlannerContext(params: {
  taskTitle: string;
  taskDescription?: string;
  completionCriteria?: string;
  phaseTitle?: string;
  phaseObjectives?: string[];
}): string {
  const lines = [`[Context from Study Planner - task "${params.taskTitle}"]`];
  if (params.taskDescription) lines.push(`Task description: ${params.taskDescription}`);
  if (params.phaseTitle) lines.push(`Part of phase: ${params.phaseTitle}`);
  if (params.phaseObjectives && params.phaseObjectives.length > 0) {
    lines.push(`Learning objectives: ${params.phaseObjectives.join("; ")}`);
  }
  if (params.completionCriteria) lines.push(`What "done" looks like: ${params.completionCriteria}`);
  lines.push(
    "This task was not automatically marked complete by starting or ending this session - only the learner can do that, back in Study Planner."
  );
  return lines.join("\n");
}

export function buildQuestionBankContext(params: {
  collectionTitle: string;
  questions: { question: string; difficulty: string }[];
}): string {
  if (params.questions.length === 0) return "";
  const lines = [
    `[Context from Question Bank - collection "${params.collectionTitle}", ${params.questions.length} question(s) selected for practice]`,
    "Ask these one at a time, in any order - wait for the learner's spoken or typed answer before moving on, then briefly evaluate their answer and give constructive feedback before asking the next one:",
  ];
  params.questions.forEach((q, i) => {
    lines.push(`${i + 1}. (${q.difficulty}) ${q.question}`);
  });
  return lines.join("\n");
}

export function buildResumeMatchContext(params: {
  jobTitle: string;
  matchedSkills: string[];
  missingSkills: string[];
  focusAreas: string[];
}): string {
  const lines = [`[Context from Resume Match Analyzer - job target: ${params.jobTitle}]`];
  lines.push(
    "This is the learner's own resume-vs-job-description skill match analysis, not a judgment you should repeat as fact - use it to focus the lesson."
  );
  if (params.missingSkills.length > 0) lines.push(`Skills to focus on (identified as gaps): ${params.missingSkills.join(", ")}`);
  if (params.matchedSkills.length > 0) lines.push(`Skills the learner already has (build on these, don't re-teach from scratch): ${params.matchedSkills.join(", ")}`);
  if (params.focusAreas.length > 0) lines.push(`Specific focus areas noted by the analysis: ${params.focusAreas.join("; ")}`);
  return lines.join("\n");
}

export function buildInterviewReviewContext(params: {
  jobTitle?: string;
  summary?: string;
  weakAreas: string[];
  suggestions: string[];
}): string {
  const lines = [`[Context from Interview Review${params.jobTitle ? ` - ${params.jobTitle}` : ""}]`];
  lines.push(
    "This is AI-generated feedback from a past mock interview, not a certified assessment - treat it as a starting point for this lesson, not an absolute judgment of the learner's ability."
  );
  if (params.summary) lines.push(`Feedback summary: ${params.summary}`);
  if (params.weakAreas.length > 0) lines.push(`Areas flagged as needing improvement: ${params.weakAreas.join("; ")}`);
  if (params.suggestions.length > 0) lines.push(`Suggestions from that feedback: ${params.suggestions.join("; ")}`);
  return lines.join("\n");
}

export function combineIntegrationContext(parts: (string | undefined | "")[]): string {
  return parts.filter((p): p is string => !!p && p.trim().length > 0).join("\n\n");
}
