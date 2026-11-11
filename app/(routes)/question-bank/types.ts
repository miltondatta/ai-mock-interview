export type Difficulty = "beginner" | "intermediate" | "advanced";
export type GenerationMode = "skill" | "job";
export type AnswerStatus = "idle" | "generating" | "ready" | "error";

export interface QuestionBankQuestion {
  _id: string;
  question: string;
  difficulty: Difficulty;
  order: number;
  answerStatus: AnswerStatus;
}

export interface QuestionBankCollectionSummary {
  _id: string;
  title: string;
  generationMode: GenerationMode;
  topics: string[];
  jobTitle?: string;
  totalQuestions: number;
  beginnerCount: number;
  intermediateCount: number;
  advancedCount: number;
  isShared: boolean;
  shareToken?: string;
  createdAt: number;
}

export const DIFFICULTY_META: Record<
  Difficulty,
  { label: string; badgeVariant: "success" | "warning" | "destructive" }
> = {
  beginner: { label: "Beginner", badgeVariant: "success" },
  intermediate: { label: "Intermediate", badgeVariant: "warning" },
  advanced: { label: "Advanced", badgeVariant: "destructive" },
};
