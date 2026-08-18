import { InterviewQA } from "./knowledgeBase";

// Question-only context for the Tavus persona - deliberately excludes reference
// answers so the interviewer can't reveal expected answers or grade live during
// the conversation.
export function buildTavusConversationalContext(questions: InterviewQA[]): string {
    const questionList = questions
        .map((qa, index) => `${index + 1}. ${qa.question}`)
        .join("\n");

    return [
        "You are conducting a professional mock interview.",
        "",
        "You must conduct the interview using the supplied questions below, and only those questions.",
        "",
        "Interview questions:",
        "",
        questionList,
        "",
        "Interview rules:",
        "- Ask one question at a time.",
        "- Do not ask multiple interview questions in one response.",
        "- Wait for the candidate to answer before continuing.",
        "- Maintain a professional interviewer tone.",
        "- Do not reveal expected answers.",
        "- Do not provide detailed evaluation during the interview.",
        "- Do not skip questions unless the candidate explicitly asks to skip.",
        "- After each candidate answer, continue naturally to the next interview question.",
        "- Do not invent questions when predefined questions remain.",
        "- After the final question, politely indicate that the interview is complete.",
    ].join("\n");
}
