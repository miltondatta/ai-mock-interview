"use client"

import React, { Suspense, useContext, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "convex/react"
import { CircleAlert, Plus, Share2, Sparkles, X } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import ModeToggle from "./ModeToggle"
import TopicInput from "./TopicInput"
import DifficultyFilters, { type DifficultyFilterValue } from "./DifficultyFilters"
import QuestionCard from "./QuestionCard"
import QuestionCollectionHistory from "./QuestionCollectionHistory"
import ShareCollectionDialog from "./ShareCollectionDialog"
import type { GenerationMode, QuestionBankCollectionSummary } from "./types"

const GENERATE_TIMEOUT_MS = 110000

function QuestionBank() {
  const router = useRouter()
  const collectionIdParam = useSearchParams().get("collectionId")
  const { userDetail } = useContext(UserDetailContext)
  const userId: Id<"UserTable"> | undefined = userDetail?._id

  const [mode, setMode] = useState<GenerationMode>("skill")
  const [inputValue, setInputValue] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [jobDescription, setJobDescription] = useState("")
  const [activeFilter, setActiveFilter] = useState<DifficultyFilterValue>("all")
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  const userCollections = useQuery(
    api.QuestionBank.GetUserCollections,
    userId ? { userId } : "skip"
  ) as QuestionBankCollectionSummary[] | undefined

  const viewedCollection = useQuery(
    api.QuestionBank.GetCollection,
    userId && collectionIdParam ? { userId, collectionId: collectionIdParam } : "skip"
  )

  function addTag(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return
    setTags((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]))
    setInputValue("")
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag))
  }

  function resetForm() {
    setMode("skill")
    setInputValue("")
    setTags([])
    setJobDescription("")
    setActiveFilter("all")
    setError(null)
    router.replace("/question-bank")
  }

  async function handleGenerate() {
    if (isGenerating || !userId) return
    setError(null)

    let effectiveTags = tags
    if (inputValue.trim()) {
      effectiveTags = tags.includes(inputValue.trim()) ? tags : [...tags, inputValue.trim()]
      setTags(effectiveTags)
      setInputValue("")
    }

    if (effectiveTags.length === 0) {
      setError(mode === "skill" ? "Please add at least one topic." : "Please enter a job title.")
      return
    }

    setIsGenerating(true)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS)
    try {
      const res = await fetch("/api/question-bank/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          topics: mode === "skill" ? effectiveTags : undefined,
          jobTitle: mode === "job" ? effectiveTags.join(", ") : undefined,
          jobDescription: mode === "job" ? jobDescription : undefined,
        }),
        signal: controller.signal,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.collectionId) {
        setError(data?.error ?? "Unable to generate questions right now. Please try again.")
        return
      }
      setActiveFilter("all")
      router.push(`/question-bank?collectionId=${data.collectionId}`)
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "AbortError"
          ? "Generation took too long to complete. Please try again."
          : "Unable to reach the server. Please check your connection and try again."
      )
    } finally {
      clearTimeout(timer)
      setIsGenerating(false)
    }
  }

  const questions = viewedCollection?.questions ?? []
  const collection = viewedCollection?.collection

  const counts = useMemo(
    () => ({
      all: collection?.totalQuestions ?? 0,
      beginner: collection?.beginnerCount ?? 0,
      intermediate: collection?.intermediateCount ?? 0,
      advanced: collection?.advancedCount ?? 0,
    }),
    [collection]
  )

  const visibleQuestions = useMemo(
    () => (activeFilter === "all" ? questions : questions.filter((q) => q.difficulty === activeFilter)),
    [questions, activeFilter]
  )

  // Matches the approved design: the first Advanced question (in generation
  // order, not filtered order) is expanded by default.
  const defaultExpandedId = useMemo(
    () => questions.find((q) => q.difficulty === "advanced")?._id ?? questions[0]?._id,
    [questions]
  )

  const subjectTitle = collection
    ? collection.generationMode === "job"
      ? collection.jobTitle || collection.topics.join(", ")
      : collection.topics.join(", ")
    : ""

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 text-center">
          <h1 className="text-[28px] font-bold tracking-tight text-foreground sm:text-3xl">Question Bank</h1>
          <p className="mx-auto mt-2 max-w-xl text-[15px] text-muted-foreground">
            Generate structured knowledge questions and explore detailed AI-powered answers.
          </p>
        </div>
      </div>

      {(collectionIdParam || tags.length > 0) && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={resetForm}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <Plus className="size-3.5" />
            New Collection
          </button>
        </div>
      )}

      <div className="mt-8 flex justify-center">
        <ModeToggle mode={mode} onChange={setMode} disabled={isGenerating} />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <TopicInput
            mode={mode}
            inputValue={inputValue}
            onInputChange={setInputValue}
            tags={tags}
            onAddTag={addTag}
            onRemoveTag={removeTag}
            jobDescription={jobDescription}
            onJobDescriptionChange={setJobDescription}
            disabled={isGenerating}
          />
        </div>
        <div className="flex shrink-0 gap-2.5">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || (!inputValue.trim() && tags.length === 0)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles className="size-4" />
            {isGenerating ? "Generating…" : "Generate"}
          </button>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            disabled={!collection}
            className="inline-flex items-center gap-2 rounded-xl bg-success px-5 py-3 text-sm font-semibold text-success-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Share2 className="size-4" />
            Share
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <p className="flex-1">{error}</p>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error" className="hover:opacity-70">
            <X className="size-4" />
          </button>
        </div>
      )}

      {collectionIdParam && viewedCollection === null && (
        <div role="status" className="mt-5 flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          This collection could not be found. It may have been deleted.
        </div>
      )}

      {collection && (
        <>
          <div className="mt-7 flex justify-center">
            <DifficultyFilters active={activeFilter} onChange={setActiveFilter} counts={counts} />
          </div>

          <div className="mt-8 flex flex-col gap-4">
            {visibleQuestions.map((q) => (
              <QuestionCard
                key={q._id}
                question={q}
                index={questions.indexOf(q)}
                defaultExpanded={q._id === defaultExpandedId}
              />
            ))}
            {visibleQuestions.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
                No questions in this difficulty yet.
              </div>
            )}
          </div>
        </>
      )}

      {userId && userCollections && (
        <QuestionCollectionHistory userId={userId} items={userCollections} />
      )}

      {collection && userId && (
        <ShareCollectionDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          userId={userId}
          collectionId={collection._id}
          title={subjectTitle}
          isShared={collection.isShared}
          shareToken={collection.shareToken}
        />
      )}
    </div>
  )
}

function QuestionBankPage() {
  return (
    <Suspense fallback={null}>
      <QuestionBank />
    </Suspense>
  )
}

export default QuestionBankPage
