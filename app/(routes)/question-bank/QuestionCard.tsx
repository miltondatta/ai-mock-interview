"use client"

import React, { useEffect, useRef, useState } from "react"
import { useQuery } from "convex/react"
import { AlertTriangle, ChevronDown, Loader2, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { DIFFICULTY_META, type QuestionBankQuestion } from "./types"
import AnswerMarkdown from "./AnswerMarkdown"

interface QuestionCardProps {
  question: QuestionBankQuestion
  index: number
  defaultExpanded?: boolean
}

function QuestionCard({ question, index, defaultExpanded }: QuestionCardProps) {
  const [expanded, setExpanded] = useState(!!defaultExpanded)
  const [requesting, setRequesting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [localAnswer, setLocalAnswer] = useState<string | null>(null)
  const requestedRef = useRef(false)

  const answerRow = useQuery(api.QuestionBank.GetAnswer, {
    questionId: question._id as Id<"questionBankQuestions">,
  })

  const meta = DIFFICULTY_META[question.difficulty]
  const markdown = answerRow?.structuredAnswer ?? localAnswer

  async function requestAnswer() {
    if (requestedRef.current) return
    requestedRef.current = true
    setRequesting(true)
    setLocalError(null)
    try {
      const res = await fetch("/api/question-bank/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question._id }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || typeof data?.answer !== "string") {
        setLocalError(data?.error ?? "Unable to generate this answer right now. Please try again.")
        return
      }
      setLocalAnswer(data.answer)
    } catch {
      setLocalError("Unable to reach the server. Please check your connection and try again.")
    } finally {
      setRequesting(false)
      requestedRef.current = false
    }
  }

  useEffect(() => {
    if (!expanded) return
    if (markdown) return
    if (question.answerStatus === "ready" || question.answerStatus === "generating") return
    requestAnswer()
    // Only (re)trigger on expand or when a retryable status appears while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, question.answerStatus])

  const showLoading = requesting || question.answerStatus === "generating"
  const showError = !showLoading && !markdown && (!!localError || question.answerStatus === "error")

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold text-muted-foreground tabular-nums">{index + 1}.</span>
        <Badge variant={meta.badgeVariant}>{meta.label}</Badge>
        <span className="min-w-0 flex-1 text-[15px] font-medium text-foreground">{question.question}</span>
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-transform",
            expanded && "rotate-180 border-primary/40 text-primary"
          )}
        >
          <ChevronDown className="size-4" />
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border px-5 pb-6 pt-5 sm:px-7">
          {showLoading && (
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-6">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                Generating a detailed answer…
              </div>
              <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
            </div>
          )}

          {showError && (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <AlertTriangle className="size-4" />
                Answer generation failed
              </div>
              <p className="text-sm text-foreground/80">
                {localError ?? "Something went wrong while generating this answer. You can try again."}
              </p>
              <button
                type="button"
                onClick={requestAnswer}
                className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3.5 py-2 text-sm font-medium text-destructive-foreground transition-opacity hover:opacity-90"
              >
                <RotateCcw className="size-3.5" />
                Retry
              </button>
            </div>
          )}

          {!showLoading && !showError && markdown && (
            <div className="rounded-xl border border-success/20 bg-success/[0.06] p-5 sm:p-7">
              <AnswerMarkdown markdown={markdown} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default QuestionCard
