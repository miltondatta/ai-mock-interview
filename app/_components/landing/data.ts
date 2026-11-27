import {
  FileSearch,
  Headphones,
  LayoutDashboard,
  BriefcaseBusiness,
  HelpCircle,
  CalendarClock,
  MessagesSquare,
  UploadCloud,
  Sparkles,
  Mic,
  Video,
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
  Languages,
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
    id: "mock-interview",
    eyebrow: "Mock Interview",
    icon: Video,
    heading: "Realistic AI-Powered Mock Interviews",
    description:
      "Experience realistic, AI-powered mock interviews tailored to your target job role. Practice with intelligent interview questions, simulate real interview scenarios and build the confidence to perform better in actual interviews.",
    features: [
      "Job-specific interview questions",
      "Realistic AI-powered interview experience",
      "Interview practice and performance evaluation",
    ],
    cta: "Start a Mock Interview",
    href: "/create-interview",
    images: [
      {
        src: "/images/create_interview.png",
        alt: "Create a new mock interview with job information and interview preference settings",
        width: 1536,
        height: 864,
      },
    ],
    reverse: false,
  },
  {
    id: "study-planner",
    eyebrow: "Study Planner",
    icon: CalendarClock,
    heading: "A Personalized Roadmap for Every Learning Goal",
    description:
      "Create a personalized learning roadmap based on your career goals, skill gaps and learning objectives. Organize topics into structured learning phases and track your preparation progress with a clear study schedule.",
    features: [
      "Personalized learning roadmap",
      "Structured learning phases and topics",
      "Study scheduling and progress tracking",
    ],
    cta: "Open Study Planner",
    href: "/study-planner",
    images: [
      {
        src: "/images/study_planner.png",
        alt: "Study Planner dashboard showing study plan stats and an active learning plan",
        width: 1536,
        height: 1024,
      },
    ],
    reverse: true,
  },
  {
    id: "practice-coach",
    eyebrow: "Practice Coach",
    icon: Headphones,
    heading: "Your Personal AI Interview Preparation Coach",
    description:
      "Strengthen your interview readiness with an intelligent practice coach. Work on technical questions, improve your answers, identify knowledge gaps and receive AI-powered guidance to continuously improve your performance.",
    features: [
      "Guided interview practice",
      "AI-powered feedback",
      "Continuous skill improvement",
    ],
    cta: "Explore Practice Coach",
    href: "/practice-coach",
    images: [
      {
        src: "/images/practice_coach_1.png",
        alt: "Practice Coach screen for uploading a resume and job details to generate a practice session",
        width: 1536,
        height: 1024,
      },
      {
        src: "/images/practice_coach_2.png",
        alt: "Practice Coach screen showing selectable practice questions to generate scripts",
        width: 1536,
        height: 1024,
      },
    ],
    reverse: false,
  },
  {
    id: "ai-study-room",
    eyebrow: "AI-Based Study Room",
    icon: MessagesSquare,
    heading: "Your Personal AI-Powered Learning Environment",
    description:
      "Enter your personal AI-powered learning environment. Interact with an intelligent tutor through voice and text, explore concepts, work through examples and use interactive learning tools to understand difficult topics more effectively.",
    features: [
      "Interactive AI tutor",
      "Voice and text communication",
      "Interactive whiteboard and learning tools",
    ],
    cta: "Enter Study Room",
    href: "/study-room",
    images: [
      {
        src: "/images/ai_study_room_1.png",
        alt: "AI Study Room dashboard showing study rooms, sessions and learning activity stats",
        width: 1536,
        height: 1024,
      },
      {
        src: "/images/ai_study_room_2.png",
        alt: "Live AI Study Room session with a voice tutor, whiteboard, code and notes tools",
        width: 1536,
        height: 1024,
      },
    ],
    reverse: true,
  },
  {
    id: "question-bank",
    eyebrow: "Question Bank",
    icon: HelpCircle,
    heading: "An Organized Collection of Interview Questions",
    description:
      "Explore an organized collection of interview questions designed to strengthen your technical and professional knowledge. Practice by topic, discover important questions and prepare more effectively for your target roles.",
    features: [
      "Organized interview question collection",
      "Topic-based question exploration",
      "Focused interview preparation",
    ],
    cta: "Explore Question Bank",
    href: "/question-bank",
    images: [
      {
        src: "/images/question_bank_1.png",
        alt: "Question Bank screen listing generated interview questions grouped by difficulty",
        width: 1536,
        height: 1024,
      },
      {
        src: "/images/question_bank_2.png",
        alt: "Question Bank screen with a question expanded to show a detailed AI-powered answer",
        width: 1024,
        height: 1024,
      },
    ],
    reverse: false,
  },
  {
    id: "jobs-bank",
    eyebrow: "Jobs Bank",
    icon: BriefcaseBusiness,
    heading: "Discover Career Opportunities That Fit You",
    description:
      "Discover relevant career opportunities from the global job market. Explore available positions and identify opportunities that align with your professional background, skills and career interests.",
    features: [
      "Global job opportunities",
      "Relevant job discovery",
      "Career-focused recommendations",
    ],
    cta: "Browse Jobs Bank",
    href: "/jobs",
    images: [
      {
        src: "/images/jobs_bank.png",
        alt: "Jobs Bank screen listing job openings matched to a candidate's profile",
        width: 1264,
        height: 843,
      },
    ],
    reverse: true,
  },
  {
    id: "language-settings",
    eyebrow: "Language Settings",
    icon: Languages,
    heading: "Prepare in the Language You're Most Comfortable With",
    description:
      "Make your learning and interview preparation more comfortable with multilingual support. Choose your preferred language and experience the platform in a language that works best for you.",
    features: [
      "Language preferences",
      "Localized learning experience",
      "More accessible interview preparation",
    ],
    cta: "Open Language Settings",
    href: "/settings",
    images: [
      {
        src: "/images/language_settings.png",
        alt: "Language Settings screen for choosing interview, feedback and practice coach languages",
        width: 1536,
        height: 1024,
      },
    ],
    reverse: false,
  },
  {
    id: "resume-match-analyzer",
    eyebrow: "Resume Match Analyzer",
    icon: FileSearch,
    heading: "Know How Well Your Resume Matches the Job",
    description:
      "Understand how well your resume aligns with a target job description. Analyze your skills and experience against job requirements, identify missing qualifications and discover areas where your resume can improve.",
    features: [
      "Resume and job description comparison",
      "Skill-gap identification",
      "Actionable improvement insights",
    ],
    cta: "Analyze Your Resume",
    href: "/resume-match-analyzer",
    images: [
      {
        src: "/images/resume_match_analyzer.png",
        alt: "Resume Match Analyzer showing a 93% strong match score with category breakdowns",
        width: 1313,
        height: 1001,
      },
    ],
    reverse: true,
  },
  {
    id: "dashboard",
    eyebrow: "Personalized Dashboard",
    icon: LayoutDashboard,
    heading: "Your Entire Preparation Journey, in One Place",
    description:
      "Manage your entire interview preparation journey from one centralized dashboard. Monitor your activities, review your progress, access learning resources and continue preparing without losing track of your goals.",
    features: [
      "Centralized preparation workspace",
      "Progress and activity overview",
      "Quick access to platform features",
    ],
    cta: "Explore Dashboard",
    href: "/dashboard",
    images: [
      {
        src: "/images/dashboard.png",
        alt: "Personalized Dashboard showing preparation stats and the full career toolkit",
        width: 1024,
        height: 1024,
      },
    ],
    reverse: false,
  },
] as const;
