"use client"

import React, { useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { useQuery } from "convex/react"
import { BookOpen, Info } from "lucide-react"
import { api } from "@/convex/_generated/api"
import DifficultyFilters, { type DifficultyFilterValue } from "../../DifficultyFilters"
import QuestionCard from "../../QuestionCard"

// Read-only view opened from a Share link (app/(routes)/question-bank
// ShareCollectionDialog). Still requires Clerk sign-in like every other route
// in this app - "shared" means shared with other signed-in users, not made
// public on the open internet - GetSharedCollection also re-checks isShared
// server-side so a revoked link stops resolving immediately.
function SharedQuestionBank() {
  const { token } = useParams<{ token: string }>()
  const [activeFilter, setActiveFilter] = useState<DifficultyFilterValue>("all")

  const shared = useQuery(api.QuestionBank.GetSharedCollection, { shareToken: token })

  const questions = shared?.questions ?? []
  const subjectTitle = shared
    ? shared.collection.generationMode === "job"
      ? shared.collection.jobTitle || shared.collection.title
      : shared.collection.topics.join(", ")
    : ""

  const counts = useMemo(
    () => ({
      all: shared?.collection.totalQuestions ?? 0,
      beginner: shared?.collection.beginnerCount ?? 0,
      intermediate: shared?.collection.intermediateCount ?? 0,
      advanced: shared?.collection.advancedCount ?? 0,
    }),
    [shared]
  )

  const visibleQuestions = useMemo(
    () => (activeFilter === "all" ? questions : questions.filter((q) => q.difficulty === activeFilter)),
    [questions, activeFilter]
  )

  if (shared === undefined) return null

  if (shared === null) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-14 text-center">
        <Info className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-3 text-xl font-bold">This link isn't available</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The collection may have been unshared or deleted by its owner.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex items-center justify-center gap-2 text-sm font-medium text-success">
        <BookOpen className="size-4" />
        Shared Question Bank collection
      </div>
      <h1 className="mt-2 text-center text-[28px] font-bold tracking-tight text-foreground sm:text-3xl">
        {subjectTitle}
      </h1>

      <div className="mt-7 flex justify-center">
        <DifficultyFilters active={activeFilter} onChange={setActiveFilter} counts={counts} />
      </div>

      <div className="mt-8 flex flex-col gap-4">
        {visibleQuestions.map((q) => (
          <QuestionCard key={q._id} question={q} index={questions.indexOf(q)} />
        ))}
      </div>
    </div>
  )
}

export default SharedQuestionBank
