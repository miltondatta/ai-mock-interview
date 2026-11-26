"use client"

import React, { useContext } from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { CheckCircle2, ListChecks, MessagesSquare, Plus } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Doc } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import { Button } from "@/components/ui/button"
import InterviewHistoryList from "../_components/InterviewHistoryList"
import { useInterviewModes } from "../_components/InterviewOptions"

const RECENT_INTERVIEWS = 3

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number | string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-xl font-bold leading-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function MockInterviewOverview() {
  const { userDetail } = useContext(UserDetailContext)
  const interviewModes = useInterviewModes()

  const interviewList: Doc<'InterviewSessionTable'>[] | undefined = useQuery(
    api.Interview.GetUserInterviews,
    userDetail?._id ? { userId: userDetail._id } : "skip"
  )
  const totalInterviews = interviewList?.length ?? 0
  const completedInterviews = interviewList?.filter((i) => i.status === "completed").length ?? 0

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Mock Interview</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
            Practice, get AI feedback, improve
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            Start a new AI-powered mock interview from your resume or a job description, or pick up
            where you left off below.
          </p>
        </div>
        <Button size="lg" nativeButton={false} render={<Link href="/create-interview" />}>
          <Plus />Create Interview
        </Button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:max-w-md">
        <StatCard icon={MessagesSquare} label="Total Interviews" value={totalInterviews} />
        <StatCard icon={CheckCircle2} label="Completed" value={completedInterviews} />
      </div>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <ListChecks className="size-4 text-primary" /> Available Interview Modes
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {interviewModes.map((option) => (
            <span
              key={option.value}
              className="rounded-full border border-border bg-muted/40 px-3.5 py-1.5 text-sm font-medium text-foreground/80"
            >
              {option.label}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <InterviewHistoryList
          title="Recent Interviews"
          limit={RECENT_INTERVIEWS}
          viewAllHref="/mock-interview/history"
        />
      </section>
    </div>
  )
}

export default MockInterviewOverview
