import {
  FileSearch,
  Headphones,
  FolderOpen,
  LayoutDashboard,
  UploadCloud,
  Sparkles,
  Mic,
  BarChart3,
  Users,
  Code2,
  Brain,
  UserCog,
  GitBranch,
  Terminal,
  Briefcase,
  GraduationCap,
  Crown,
  Flame,
  Zap,
  Target,
  Globe2,
  ShieldCheck,
  Repeat,
} from "lucide-react";

export const howItWorksSteps = [
  {
    number: "01",
    icon: UploadCloud,
    title: "Upload Your Resume",
    description: "Upload your resume and provide your target job description.",
  },
  {
    number: "02",
    icon: Sparkles,
    title: "Generate Interview Questions",
    description: "AI analyzes your profile and creates personalized questions.",
  },
  {
    number: "03",
    icon: Mic,
    title: "Practice with AI",
    description: "Participate in realistic voice-based mock interviews.",
  },
  {
    number: "04",
    icon: BarChart3,
    title: "Get AI Feedback",
    description: "Review your performance and identify areas for improvement.",
  },
];

export const interviewModes = [
  { icon: Users, title: "HR Interview", description: "Practice common HR screening questions about your background and fit." },
  { icon: Code2, title: "Technical Interview", description: "Sharpen your answers on core technical and domain-specific topics." },
  { icon: Brain, title: "Behavioral Interview", description: "Master the STAR method for real-world experience based questions." },
  { icon: UserCog, title: "Managerial Interview", description: "Prepare for leadership, team management, and decision-making scenarios." },
  { icon: GitBranch, title: "System Design Interview", description: "Practice architecting scalable systems and explaining trade-offs." },
  { icon: Terminal, title: "Coding Interview", description: "Walk through problem-solving and your approach to writing code." },
  { icon: Briefcase, title: "Case Study Interview", description: "Work through business cases and structured problem solving." },
  { icon: GraduationCap, title: "Graduate / Fresher Interview", description: "Build confidence for your first interviews out of school." },
  { icon: Crown, title: "Executive Interview", description: "Prepare for high-stakes conversations with senior leadership." },
  { icon: Flame, title: "Stress Interview", description: "Practice staying composed under pressure and tough follow-ups." },
  { icon: Zap, title: "Rapid Fire Interview", description: "Train for quick, high-tempo question and answer exchanges." },
] as const;

export const benefits = [
  { icon: Target, title: "Personalized Preparation", description: "Questions based on your resume and target job." },
  { icon: Mic, title: "Real-Time Voice Interaction", description: "Practice realistic interviews with an AI interviewer." },
  { icon: BarChart3, title: "Actionable AI Feedback", description: "Identify weaknesses and improve your responses." },
  { icon: Globe2, title: "Multilingual Support", description: "Practice using supported languages." },
  { icon: ShieldCheck, title: "Secure Resume Management", description: "Manage your professional documents securely." },
  { icon: Repeat, title: "Flexible Practice", description: "Practice anytime and repeat interviews to improve confidence." },
] as const;

export const testimonials = [
  {
    name: "Ananya Sharma",
    role: "Software Engineer, hired at a fintech startup",
    quote:
      "The mock interviews felt surprisingly close to the real thing. I walked into my actual interview already comfortable with the format.",
    rating: 5,
  },
  {
    name: "Marcus Webb",
    role: "Product Analyst, career switcher",
    quote:
      "The resume match score showed me exactly which skills I was missing. I closed those gaps before I ever applied.",
    rating: 5,
  },
  {
    name: "Priya Nair",
    role: "Recent Graduate",
    quote:
      "Practice Coach turned my resume into real questions I could rehearse. It made first interviews so much less intimidating.",
    rating: 4,
  },
] as const;

export const faqs = [
  {
    question: "What is AI Mock Interview?",
    answer:
      "AI Mock Interview is an AI-powered interview preparation platform that helps you practice with realistic voice-based mock interviews, analyze your resume against job descriptions, and get actionable feedback to improve.",
  },
  {
    question: "How does the AI interview process work?",
    answer:
      "You upload your resume and a target job description, our AI generates personalized interview questions, and you practice through a realistic voice conversation with an AI interviewer that responds in real time.",
  },
  {
    question: "Can I upload multiple resumes?",
    answer:
      "Yes. You can upload, store, and manage multiple resumes in one place and reuse any of them across interview preparation and resume matching.",
  },
  {
    question: "How does Resume Match Analyzer work?",
    answer:
      "It compares your resume against a target job description, calculates an overall match score, highlights missing skills and experience gaps, and gives personalized recommendations to improve your fit.",
  },
  {
    question: "Can I practice interviews in different languages?",
    answer:
      "Yes, Practice Coach supports generating practice scripts and audio content in supported languages so you can rehearse in the language you're most comfortable with.",
  },
  {
    question: "Can I repeat an interview?",
    answer:
      "Yes. You can repeat mock interviews and practice sessions as many times as you'd like to keep improving your confidence and performance.",
  },
  {
    question: "What subscription plans are available?",
    answer:
      "We offer a free plan to get started and paid plans with higher interview limits and advanced features. Visit the pricing section below, or your account's Upgrade page, for current plan details.",
  },
  {
    question: "Is my resume data secure?",
    answer:
      "Yes. Your resumes and personal data are stored securely, and you're always in control of viewing, downloading, or deleting your documents at any time.",
  },
] as const;

export const pricingPlans = [
  {
    name: "Free",
    price: "$0",
    period: "/month",
    description: "Get started with the basics of interview preparation.",
    cta: "Get Started Free",
    action: "signup" as const,
    highlighted: false,
    features: ["[X] mock interviews per month", "Basic resume match analysis", "1 saved resume", "Standard AI feedback"],
  },
  {
    name: "Pro",
    price: "[Price]",
    period: "/month",
    description: "For job seekers actively interviewing.",
    cta: "View Pro Plan",
    action: "upgrade" as const,
    highlighted: true,
    features: [
      "[X] mock interviews per month",
      "Advanced resume match analysis",
      "Multiple saved resumes",
      "Practice Coach with audio scripts",
      "Priority AI feedback",
    ],
  },
  {
    name: "Enterprise",
    price: "Contact Us",
    period: "",
    description: "For teams and organizations.",
    cta: "Contact Sales",
    action: "contact" as const,
    highlighted: false,
    features: ["Unlimited mock interviews", "Team resume management", "Dedicated support", "Custom integrations"],
  },
] as const;

export const productSections = [
  {
    id: "resume-analyzer",
    eyebrow: "Resume Match Analyzer",
    icon: FileSearch,
    heading: "Know How Well Your Resume Matches Your Dream Job",
    description:
      "Analyze your resume against a target job description and understand how closely your qualifications match employer requirements.",
    features: [
      "Calculate overall resume-to-job match score",
      "Compare required skills against your resume",
      "Identify missing skills and experience gaps",
      "View detailed competency assessments",
      "Receive personalized improvement recommendations",
      "Save and revisit previous analyses",
    ],
    cta: "Explore Resume Analyzer",
    href: "/resume-match-analyzer",
    imageSrc: "/images/resume_match_analyzer.png",
    imageAlt: "Resume Match Analyzer showing a 93% strong match score",
    width: 1883,
    height: 898,
    reverse: false,
  },
  {
    id: "practice-coach",
    eyebrow: "Practice Coach",
    icon: Headphones,
    heading: "Your Personal AI Interview Preparation Coach",
    description:
      "Transform your resume and target job description into personalized interview practice scripts, questions and suggested answers.",
    features: [
      "Generate role-specific interview questions",
      "Select questions for focused practice",
      "Generate personalized practice scripts",
      "Get suggested answers based on your experience",
      "Practice in supported languages",
      "Prepare using AI-generated audio content",
    ],
    cta: "Explore Practice Coach",
    href: "/practice-coach",
    imageSrc: "/images/practice_coach_1.png",
    imageAlt: "Practice Coach showing a list of selectable interview questions",
    width: 1399,
    height: 786,
    reverse: true,
  },
  {
    id: "manage-resume",
    eyebrow: "Manage Resume",
    icon: FolderOpen,
    heading: "Keep Your Resumes Organized and Ready",
    description:
      "Manage your professional documents in one secure place and reuse them across your interview preparation activities.",
    features: [
      "Upload PDF resumes",
      "Store multiple resumes",
      "Preview saved resumes",
      "Download existing resumes",
      "Delete outdated documents",
      "Reuse saved resumes for interview preparation and matching",
    ],
    cta: "Manage Your Resumes",
    href: "/manage-resume",
    imageSrc: "/images/manage_resume.png",
    imageAlt: "Manage Resume screen listing an uploaded resume file",
    width: 1778,
    height: 607,
    reverse: false,
  },
  {
    id: "dashboard",
    eyebrow: "Interview Dashboard",
    icon: LayoutDashboard,
    heading: "Take Control of Your Interview Preparation Journey",
    description:
      "Access your interview activities, review previous results and monitor your preparation progress from one dashboard.",
    features: [
      "Create mock interviews quickly",
      "Access previous interview sessions",
      "Review interview performance",
      "View resume match history",
      "Track match scores",
      "Manage preparation activities",
    ],
    cta: "Explore Dashboard",
    href: "/dashboard",
    imageSrc: "/images/dashboard.png",
    imageAlt: "Interview Dashboard with resume match history",
    width: 1918,
    height: 905,
    reverse: true,
  },
] as const;
