export type InterviewQA = {
    question: string;
    answer: string;
};

// Feeds the streaming avatar agent so it knows what to ask and what a good answer looks like.
// The reference answers are guidance for the agent, not a script to read aloud.
export function buildInterviewKnowledgeBase(questions: InterviewQA[]): string {
    const qaBlock = questions
        .map((qa, index) => `Q${index + 1}: ${qa.question}\nReference answer: ${qa.answer}`)
        .join("\n\n");

    return [
        "You are an AI interviewer conducting a mock interview.",
        "Ask the candidate the following questions one at a time, in order.",
        "Use the reference answers to judge how complete the candidate's response is - do not read them aloud.",
        "",
        qaBlock,
    ].join("\n");
}
