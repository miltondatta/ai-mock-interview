import { InterviewQA } from "./knowledgeBase";

// ElevenLabs dynamic variables only accept scalar values (string/number/boolean),
// so the question list is flattened into one numbered block instead of being
// passed as a structured array. The agent's system prompt/first message must
// reference these by name, e.g. {{interview_questions}}, {{candidate_name}}.
export type InterviewDynamicVariables = Record<string, string>;

export function buildInterviewDynamicVariables(params: {
    candidateName: string;
    questions: InterviewQA[];
    jobTitle?: string;
    jobDescription?: string;
}): InterviewDynamicVariables {
    const questionList = params.questions
        .map((qa, index) => `${index + 1}. ${qa.question}`)
        .join("\n");

    return {
        candidate_name: params.candidateName,
        interview_questions: questionList,
        job_title: params.jobTitle ?? "",
        job_description: params.jobDescription ?? "",
    };
}
