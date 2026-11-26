"use client"

import React from "react"
import Link from "next/link"
import { ArrowLeft, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import InterviewHistoryList from "../../_components/InterviewHistoryList"

function MockInterviewHistoryPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/mock-interview" />} className="mb-2 -ml-2 text-muted-foreground">
            <ArrowLeft /> Back to Mock Interview
          </Button>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Interview History</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All your previous mock interviews, including drafts, completed sessions and their feedback.
          </p>
        </div>
        <Button size="lg" nativeButton={false} render={<Link href="/create-interview" />}>
          <Plus />Create Interview
        </Button>
      </div>

      <div className="mt-8">
        <InterviewHistoryList />
      </div>
    </div>
  )
}

export default MockInterviewHistoryPage
