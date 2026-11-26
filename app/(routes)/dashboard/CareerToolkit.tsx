"use client"

import React from "react"
import Link from "next/link"
import { MessagesSquare, GraduationCap, FileSearch, BriefcaseBusiness, FolderOpen, Video, Bot, BookOpen, ArrowRight } from "lucide-react"

interface Module {
  icon: React.ElementType
  title: string
  description: string
  action: string
  href: string
}

// Dashboard Part 2 - "Your Career Toolkit". Every href below is an existing
// route (see Sidebar.tsx for the same set of destinations) - nothing here
// is invented, and none of these cards re-implement their module's
// functionality, they only navigate to it.
const MODULES: Module[] = [
  { icon: MessagesSquare, title: "Mock Interview", description: "Practice realistic AI-powered job interviews.", action: "Start Interview", href: "/mock-interview" },
  { icon: GraduationCap, title: "Study Planner", description: "Organize your learning goals and track study progress.", action: "Open Study Planner", href: "/study-planner" },
  { icon: FileSearch, title: "Resume Match Analyzer", description: "Compare your resume with job descriptions and find gaps.", action: "Analyze Resume", href: "/resume-match-analyzer" },
  { icon: BriefcaseBusiness, title: "Jobs", description: "Discover job opportunities matched to your profile.", action: "Explore Jobs", href: "/jobs" },
  { icon: FolderOpen, title: "Resume Management", description: "Manage resumes and organize your career documents.", action: "Manage Resumes", href: "/manage-resume" },
  { icon: Video, title: "Practice Coach", description: "Improve your interview skills through guided AI practice.", action: "Open Practice Coach", href: "/practice-coach" },
  { icon: Bot, title: "AI Study Room", description: "Learn with your AI tutor using interactive lessons.", action: "Enter Study Room", href: "/study-room" },
  { icon: BookOpen, title: "Questions Bank", description: "Explore interview questions by role, category and skill.", action: "Explore Questions", href: "/question-bank" },
]

function ToolkitCard({ mod }: { mod: Module }) {
  const Icon = mod.icon
  return (
    <Link
      href={mod.href}
      className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-foreground">{mod.title}</h3>
        <p className="mt-1 text-sm leading-snug text-muted-foreground line-clamp-2">{mod.description}</p>
      </div>
      <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary">
        {mod.action} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}

export default function CareerToolkit() {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold tracking-tight text-foreground">Your Career Toolkit</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MODULES.map((mod) => (
          <ToolkitCard key={mod.title} mod={mod} />
        ))}
      </div>
    </section>
  )
}
