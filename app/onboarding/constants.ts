// Onboarding wizard (M2): option lists and copy. The stored values are
// stable machine-readable keys. Labels are display text only.

// Same brand name the sidebar shows (app/(routes)/_components/Sidebar.tsx).
export const PRODUCT_NAME = "AI Mock Interview"

export type UserIntent = "interview_preparation" | "hiring"

export const INTENT_OPTIONS: { value: UserIntent; title: string; description: string }[] = [
  {
    value: "interview_preparation",
    title: "I am preparing for interviews",
    description:
      "Practice with an AI interviewer, get feedback on every answer, and follow a prep plan built around your interview date.",
  },
  {
    value: "hiring",
    title: "I am hiring",
    description: "Screen candidates with AI interviews and compare them side by side.",
  },
]

// The five numbered steps shown in the progress indicator. Step 0 is the
// intent screen, which isn't numbered.
export const STEP_COUNT = 5
export const STEP = {
  intent: 0,
  role: 1,
  experience: 2,
  timeline: 3,
  resume: 4,
  referral: 5,
} as const

export const POPULAR_ROLES = [
  "Frontend Developer",
  "Backend Developer",
  "Product Manager",
  "Human Resources Manager",
  "Customer Service Representative",
  "UX/UI Designer",
]

export const INTERVIEW_TIMELINE_OPTIONS = [
  { value: "have_date", label: "I have a date" },
  { value: "within_week", label: "Within a week" },
  { value: "2_4_weeks", label: "2 to 4 weeks" },
  { value: "1_3_months", label: "1 to 3 months" },
  { value: "no_date", label: "No date yet" },
]

export const WEEKLY_AVAILABILITY_OPTIONS = [
  { value: "about_2_hours", label: "About 2 hours", hint: "Up to an hour on any day" },
  { value: "about_5_hours", label: "About 5 hours", hint: "Up to 2 hours on any day" },
  { value: "10_plus_hours", label: "10 hours or more", hint: "Up to 3 hours on any day" },
]

export type ReferralIcon =
  | "chatgpt"
  | "perplexity"
  | "google"
  | "linkedin"
  | "instagram"
  | "youtube"
  | "x"
  | "facebook"
  | "reddit"
  | "tiktok"
  | "friend"
  | "other"

export const REFERRAL_OPTIONS: { value: ReferralIcon; label: string }[] = [
  { value: "chatgpt", label: "ChatGPT" },
  { value: "perplexity", label: "Perplexity" },
  { value: "google", label: "Google Search" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "x", label: "X (Twitter)" },
  { value: "facebook", label: "Facebook" },
  { value: "reddit", label: "Reddit" },
  { value: "tiktok", label: "TikTok" },
  { value: "friend", label: "Friend Referral" },
  { value: "other", label: "Other" },
]

export const MAX_YEARS_OF_EXPERIENCE = 60
export const MAX_RESUME_BYTES = 10 * 1024 * 1024

// Autocomplete source for the role step. Any title not listed here can still
// be typed in and saved.
export const JOB_TITLES = [
  // Software & engineering
  "Software Engineer", "Senior Software Engineer", "Staff Software Engineer", "Principal Engineer",
  "Frontend Developer", "Backend Developer", "Full Stack Developer", "Mobile Developer",
  "iOS Developer", "Android Developer", "React Developer", "Node.js Developer", "Java Developer",
  "Python Developer", ".NET Developer", "PHP Developer", "Go Developer", "Embedded Software Engineer",
  "Game Developer", "DevOps Engineer", "Site Reliability Engineer", "Cloud Engineer",
  "Cloud Architect", "Solutions Architect", "Software Architect", "Platform Engineer",
  "QA Engineer", "QA Automation Engineer", "Test Engineer", "Security Engineer",
  "Cybersecurity Analyst", "Network Engineer", "Systems Administrator", "Database Administrator",
  "Engineering Manager", "Technical Lead", "CTO",
  // Data & AI
  "Data Scientist", "Data Analyst", "Data Engineer", "Machine Learning Engineer", "AI Engineer",
  "Business Intelligence Analyst", "Analytics Engineer", "Research Scientist", "Statistician",
  // Product & design
  "Product Manager", "Senior Product Manager", "Product Owner", "Technical Product Manager",
  "Project Manager", "Program Manager", "Scrum Master", "UX/UI Designer", "UX Designer",
  "UI Designer", "Product Designer", "Graphic Designer", "UX Researcher", "Interaction Designer",
  "Visual Designer", "Motion Designer",
  // Business, sales & marketing
  "Business Analyst", "Business Development Manager", "Account Manager", "Account Executive",
  "Sales Representative", "Sales Manager", "Customer Success Manager", "Marketing Manager",
  "Digital Marketing Specialist", "Content Marketing Manager", "SEO Specialist",
  "Social Media Manager", "Growth Marketing Manager", "Brand Manager", "Copywriter",
  "Content Writer", "Communications Manager", "Public Relations Specialist",
  "Public Relations Manager", "Media Relations Manager", "Event Manager",
  // Operations, finance & HR
  "Operations Manager", "Operations Analyst", "Supply Chain Manager", "Logistics Coordinator",
  "Procurement Specialist", "Financial Analyst", "Accountant", "Senior Accountant",
  "Finance Manager", "Auditor", "Investment Analyst", "Risk Analyst", "Human Resources Manager",
  "HR Generalist", "HR Business Partner", "Recruiter", "Technical Recruiter",
  "Talent Acquisition Specialist", "Office Manager", "Executive Assistant",
  "Administrative Assistant", "Management Consultant", "Strategy Consultant",
  // Customer-facing & other
  "Customer Service Representative", "Customer Support Specialist", "Call Center Agent",
  "Technical Support Engineer", "Help Desk Technician", "Retail Store Manager", "Cashier",
  "Teacher", "Lecturer", "Nurse", "Registered Nurse", "Pharmacist", "Medical Assistant",
  "Lawyer", "Paralegal", "Legal Counsel", "Civil Engineer", "Mechanical Engineer",
  "Electrical Engineer", "Chemical Engineer", "Architect", "Construction Manager",
]
