export interface SummaryGenerationContext {
    learnerName: string;
    roomTitle: string;
    topic: string;
    objective?: string;
    difficulty?: string;
    durationSeconds?: number;
    transcript: { role: "tutor" | "learner"; text: string }[];
    // Plain-text/short excerpts of what the learner actually produced in
    // the workspace tools during the session - included so the summary can
    // reference real code/notes/diagram content, not just the spoken
    // conversation.
    codeFiles: { filename: string; language: string; contentExcerpt: string }[];
    notesExcerpt?: string;
    whiteboardLabels: string[];
}

function formatTranscript(transcript: SummaryGenerationContext["transcript"]): string {
    return transcript.map((m) => `${m.role === "tutor" ? "Tutor" : "Learner"}: ${m.text}`).join("\n");
}

function formatDuration(seconds?: number): string {
    if (!seconds) return "unknown";
    const minutes = Math.round(seconds / 60);
    return `${minutes} minute(s)`;
}

// SummaryPromptBuilder: the single call that produces a Study Room lesson
// summary. The instructions here are what actually enforces the M4 "do not
// invent learner performance" / "only generate when sufficient information
// is available" rules at generation time - the zod schema (summarySchema.ts)
// enforces shape, not honesty, so the honesty constraints have to be said
// explicitly in the prompt itself.
export function buildSummaryPrompt(ctx: SummaryGenerationContext): string {
    const sections: string[] = [
        `You are generating a learning summary for a completed one-on-one AI tutoring session.`,
        `Learner: ${ctx.learnerName}`,
        `Study Room: "${ctx.roomTitle}" - topic: ${ctx.topic}${ctx.objective ? `, objective: ${ctx.objective}` : ""}${
            ctx.difficulty ? `, level: ${ctx.difficulty}` : ""
        }`,
        `Session duration: ${formatDuration(ctx.durationSeconds)}`,
        ``,
        `--- Full conversation transcript ---`,
        formatTranscript(ctx.transcript) || "(no transcript available)",
    ];

    if (ctx.codeFiles.length > 0) {
        sections.push(``, `--- Code the learner worked on ---`);
        for (const f of ctx.codeFiles) {
            sections.push(`File: ${f.filename} (${f.language})\n${f.contentExcerpt}`);
        }
    }
    if (ctx.notesExcerpt) {
        sections.push(``, `--- Notes the learner/Tutor wrote ---`, ctx.notesExcerpt);
    }
    if (ctx.whiteboardLabels.length > 0) {
        sections.push(``, `--- Labels/text found on the whiteboard ---`, ctx.whiteboardLabels.join(", "));
    }

    sections.push(
        ``,
        `--- Instructions ---`,
        `Summarize ONLY what is actually evidenced above. This is critical:`,
        `- Do not invent, assume, or exaggerate the learner's performance or understanding.`,
        `- Only claim the learner "understood well" something they actually demonstrated (e.g. answered correctly, explained it back, applied it in code/notes). If nothing in the transcript demonstrates understanding of anything, return an empty array for understoodWell rather than guessing.`,
        `- Only list a misunderstanding if the learner said something incorrect or the Tutor corrected them - never infer one that isn't there.`,
        `- "qaExchanges" must be actual question/response pairs lifted from the transcript, not invented ones. If the Tutor never asked a clear question, return an empty array.`,
        `- "areasForImprovement", "revisionTopics" and "nextActivities" are your own recommendations as the summarizer, not observed facts - base them on gaps or struggles actually visible in the transcript, and keep them constructive rather than speculative.`,
        `- If the transcript is too short or too shallow to responsibly assess a category, leave that array empty instead of filling it with generic content.`,
        `- Keep "overview" factual and concise - what topic was discussed and what happened, not a performance verdict.`
    );

    return sections.join("\n");
}
