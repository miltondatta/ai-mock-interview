// Static suggestion lists for the topic input's typeahead dropdown. Purely a
// client-side UX aid (narrows down what to type) - it has no bearing on what
// Gemini is actually allowed to generate questions about.

export const SKILL_SUGGESTIONS: string[] = [
  "React.js", "Next.js", "Vue.js", "Angular", "TypeScript", "JavaScript",
  "Node.js", "Python", "Java", "C++", "C#", "Go", "Rust", "PHP", "Ruby on Rails",
  "SQL", "PostgreSQL", "MongoDB", "Redis", "GraphQL", "REST API Design",
  "System Design", "Cloud Computing", "AWS", "Azure", "Google Cloud Platform",
  "Docker", "Kubernetes", "CI/CD", "DevOps", "Microservices",
  "Data Structures & Algorithms", "Machine Learning", "Deep Learning",
  "Data Science", "Data Engineering", "Artificial Intelligence",
  "Cybersecurity", "Network Security", "Ethical Hacking", "Cloud Security",
  "Project Management", "Agile Methodology", "Scrum", "Product Management",
  "Business Analysis", "UI/UX Design", "Mobile App Development", "iOS Development",
  "Android Development", "Software Testing", "QA Automation", "Blockchain",
  "Big Data", "Data Visualization", "Excel", "Power BI", "Tableau",
  "Digital Marketing", "SEO", "Content Marketing", "Sales Strategy",
  "Financial Analysis", "Accounting", "Human Resources", "Supply Chain Management",
  "Leadership", "Communication Skills", "Negotiation", "Time Management",
  "Problem Solving", "Critical Thinking", "Team Management",
];

export const JOB_SUGGESTIONS: string[] = [
  "Software Engineer", "Senior Software Engineer", "Frontend Developer",
  "Backend Developer", "Full Stack Developer", "Mobile App Developer",
  "DevOps Engineer", "Site Reliability Engineer", "Cloud Architect",
  "Data Scientist", "Data Engineer", "Data Analyst", "Machine Learning Engineer",
  "QA Engineer", "Test Automation Engineer", "Security Engineer",
  "Product Manager", "Senior Product Manager", "Technical Project Manager",
  "IT Project Manager", "Program Manager", "Scrum Master", "Agile Coach",
  "Business Analyst", "Systems Analyst", "Solutions Architect",
  "UI/UX Designer", "Graphic Designer", "Digital Marketing Manager",
  "SEO Specialist", "Content Strategist", "Sales Manager", "Account Executive",
  "Customer Success Manager", "HR Manager", "Recruiter", "Talent Acquisition Specialist",
  "Financial Analyst", "Accountant", "Operations Manager", "Supply Chain Manager",
  "Engineering Manager", "CTO", "VP of Engineering", "Database Administrator",
  "Network Engineer", "IT Support Specialist", "Technical Writer",
];

export function getSuggestions(
  mode: "skill" | "job",
  query: string,
  exclude: string[],
  limit = 7
): string[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const pool = mode === "skill" ? SKILL_SUGGESTIONS : JOB_SUGGESTIONS;
  const excludeSet = new Set(exclude.map((e) => e.toLowerCase()));
  const starts: string[] = [];
  const contains: string[] = [];
  for (const item of pool) {
    const lower = item.toLowerCase();
    if (excludeSet.has(lower)) continue;
    if (lower.startsWith(trimmed)) starts.push(item);
    else if (lower.includes(trimmed)) contains.push(item);
  }
  return [...starts, ...contains].slice(0, limit);
}
