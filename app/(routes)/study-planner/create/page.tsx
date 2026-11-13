"use client"

import React, { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Sparkles, PenLine } from "lucide-react"
import CreateStudyPlanAITab from "./CreateStudyPlanAITab"
import CreateStudyPlanManualTab from "./CreateStudyPlanManualTab"

type Mode = "ai" | "manual"

function CreateStudyPlanPage() {
  const [mode, setMode] = useState<Mode>("ai")

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 md:px-10 md:py-14">
      <Link
        href="/study-planner"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to Study Planner
      </Link>

      <div className="mt-4 text-center">
        <h1 className="text-[28px] font-bold tracking-tight text-foreground sm:text-3xl">Create Study Plan</h1>
        <p className="mx-auto mt-2 max-w-lg text-[15px] text-muted-foreground">
          Describe what you want to learn and let AI build your plan, or put one together yourself.
        </p>
      </div>

      <div className="mt-7 flex justify-center">
        <div
          className="inline-flex w-full rounded-xl border border-border bg-muted/50 p-1 sm:w-auto"
          role="tablist"
          aria-label="Study plan creation mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "ai"}
            onClick={() => setMode("ai")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors sm:flex-none sm:px-10 ${
              mode === "ai" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="size-4" /> Generate with AI
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "manual"}
            onClick={() => setMode("manual")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors sm:flex-none sm:px-10 ${
              mode === "manual" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <PenLine className="size-4" /> Create Manually
          </button>
        </div>
      </div>

      <div className="mt-8">{mode === "ai" ? <CreateStudyPlanAITab /> : <CreateStudyPlanManualTab />}</div>

      <div className="h-10" />
    </div>
  )
}

export default CreateStudyPlanPage
