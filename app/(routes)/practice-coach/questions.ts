// Preset bank of common interview questions candidates can pick from to
// focus their Practice Coach script around specific topics.
export const PRACTICE_QUESTIONS: string[] = [
  "Tell me about yourself.",
  "Can you describe your previous experience and how it relates to the role you are applying for?",
  "What are your main day-to-day responsibilities in your current or most recent role?",
  "Can you describe your most recent or most significant project and your contribution to it?",
  "What was the outcome of your last major project or assignment, and what role did you personally play in achieving that outcome?",
  "What has been the most challenging task or project you have worked on, and how did you handle it?",
  "Can you describe a problem you encountered in your work and how you solved it?",
  "Tell me about a situation where something did not go according to plan. What did you do?",
  "What is one significant achievement in your career that you are particularly proud of?",
  "Can you describe a situation where you had to make an important decision? How did you approach it?",
  "Tell me about a time when you had to work under pressure or meet a tight deadline. How did you manage it?",
  "Can you describe a situation where you had to work with a difficult person or handle a disagreement?",
  "Tell me about a time when you worked as part of a team to achieve an important goal. What was your contribution?",
  "Can you describe a situation where you had to communicate a complex issue to someone with a different level of knowledge or experience?",
  "What tools, technologies, methods, or approaches do you regularly use in your work, and how do they help you perform your responsibilities?",
  "How do you prioritize your tasks when you have multiple responsibilities or competing deadlines?",
  "Tell me about something you learned recently and how you applied that knowledge in your work.",
  "If you were given a challenging assignment in this role, how would you approach it?",
  "What do you consider your key strengths, and how have they helped you succeed in your work?",
  "What is one area you would like to improve, and what are you doing to develop it?",
];

// No per-user plan lookup exists yet (see Clerk PricingTable on /upgrade),
// so every candidate is treated as free-plan here until real plan-based
// gating is wired in.
export const FREE_PLAN_MAX_QUESTIONS = 3;
