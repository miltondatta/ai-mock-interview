"use client"

import React, { Suspense, useContext, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { ArrowLeft, Bot, CircleAlert, Link2, Loader2, Sparkles } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import type { Difficulty } from "../types"

const DIFFICULTY_LEVELS: Difficulty[] = ["beginner", "intermediate", "advanced"]
const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
}

const TOPIC_SUGGESTIONS = [
  "System Design Fundamentals",
  "Python Programming",
  "Data Structures and Algorithms",
  "Database Management",
  "Software Project Management",
  "Behavioral Interview Preparation",
]

const PREFERENCE_OPTIONS = [
  "Visual diagrams",
  "Hands-on coding",
  "Conceptual explanations",
  "Step-by-step pacing",
]

const inputClass =
  "w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="mb-1.5 block text-sm font-semibold text-foreground">
      {children}
      {optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
    </label>
  )
}

// M5 - optional integration entry points land here with a `source` query
// param plus that source's own reference id(s): `studyPlanner` (topic,
// description, studyPlanId, planTitle, studyTaskId - from a Study Planner
// task), `questionBank` (questionBankId, questionIds - comma-separated),
// `resumeMatch` (resumeMatchId), or `interviewReview` (interviewReviewId).
// None of this is required - opening this page with no params at all is
// still the default, fully independent "create a room manually" path.
function CreateStudyRoomForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { userDetail } = useContext(UserDetailContext)
  const userId: Id<"UserTable"> | undefined = userDetail?._id
  const createStudyRoom = useMutation(api.StudyRoom.CreateStudyRoom)
  const startSession = useMutation(api.StudyRoom.StartStudyRoomSession)

  const source = searchParams.get("source")
  const spTopic = searchParams.get("topic")
  const spDescription = searchParams.get("description")
  const spPlanTitle = searchParams.get("planTitle")
  const spStudyPlanId = searchParams.get("studyPlanId")
  const spStudyTaskId = searchParams.get("studyTaskId")
  const qbCollectionId = searchParams.get("questionBankId")
  const qbQuestionIdsParam = searchParams.get("questionIds")
  const qbQuestionIds = qbQuestionIdsParam ? qbQuestionIdsParam.split(",").filter(Boolean) : []
  const rmAnalysisId = searchParams.get("resumeMatchId")
  const irInterviewId = searchParams.get("interviewReviewId")

  const qbCollectionData = useQuery(
    api.QuestionBank.GetCollection,
    userId && source === "questionBank" && qbCollectionId ? { userId, collectionId: qbCollectionId } : "skip"
  )
  const rmAnalysisData = useQuery(
    api.ResumeMatch.GetResumeMatchAnalysis,
    userId && source === "resumeMatch" && rmAnalysisId ? { userId, analysisId: rmAnalysisId } : "skip"
  )
  const irInterviewData = useQuery(
    api.Interview.GetInterviewSessionForUser,
    userId && source === "interviewReview" && irInterviewId
      ? { userId, interviewId: irInterviewId as Id<"InterviewSessionTable"> }
      : "skip"
  )

  const [title, setTitle] = useState("")
  const [topic, setTopic] = useState("")
  const [category, setCategory] = useState("")
  const [objective, setObjective] = useState("")
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner")
  const [preferences, setPreferences] = useState<string[]>([])
  const [additionalInstructions, setAdditionalInstructions] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prefilledRef = useRef(false)

  // Prefills the form once the relevant source record (if any) has loaded -
  // the learner can still freely edit or clear anything before submitting.
  useEffect(() => {
    if (prefilledRef.current) return
    if (source === "studyPlanner" && spTopic) {
      setTitle(spTopic)
      setTopic(spTopic)
      if (spDescription) setObjective(spDescription)
      prefilledRef.current = true
    } else if (source === "questionBank" && qbCollectionData) {
      const subject =
        qbCollectionData.collection.generationMode === "job"
          ? qbCollectionData.collection.jobTitle || qbCollectionData.collection.topics.join(", ")
          : qbCollectionData.collection.topics.join(", ")
      setTitle(`Practice: ${subject}`)
      setTopic(subject)
      setObjective(`Practice ${qbQuestionIds.length || qbCollectionData.questions.length} question(s) from the Question Bank with the AI Tutor.`)
      prefilledRef.current = true
    } else if (source === "resumeMatch" && rmAnalysisData) {
      setTitle(`Close skill gaps: ${rmAnalysisData.jobTitle}`)
      setTopic(rmAnalysisData.jobTitle)
      setObjective("Work on the skill gaps identified by the Resume Match Analyzer for this role.")
      prefilledRef.current = true
    } else if (source === "interviewReview" && irInterviewData) {
      const label = irInterviewData.jobTitle || "a past mock interview"
      setTitle(`Improve: ${label}`)
      setTopic(String(label))
      setObjective("Work on the areas flagged for improvement in this interview's feedback.")
      prefilledRef.current = true
    }
  }, [source, spTopic, spDescription, qbCollectionData, qbQuestionIds.length, rmAnalysisData, irInterviewData])

  function togglePreference(pref: string) {
    setPreferences((prev) => (prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]))
  }

  const linkBanner =
    source === "studyPlanner" && spTopic
      ? `Linked from Study Planner${spPlanTitle ? ` · ${spPlanTitle}` : ""} · Task: ${spTopic}`
      : source === "questionBank" && qbCollectionData
        ? `Linked from Question Bank · ${qbQuestionIds.length > 0 ? `${qbQuestionIds.length} selected question(s) from` : "collection"} "${qbCollectionData.collection.title}"`
        : source === "resumeMatch" && rmAnalysisData
          ? `Linked from Resume Match Analyzer · ${rmAnalysisData.jobTitle}`
          : source === "interviewReview" && irInterviewData
            ? `Linked from Interview Review · ${irInterviewData.jobTitle || "Mock interview"}`
            : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving || !userId) return
    setError(null)

    if (!title.trim()) {
      setError("Give your study room a title.")
      return
    }
    if (!topic.trim()) {
      setError("Choose or type a learning topic.")
      return
    }

    setSaving(true)
    try {
      const { studyRoomId } = await createStudyRoom({
        userId,
        title: title.trim(),
        topic: topic.trim(),
        objective: objective.trim() || undefined,
        category: category.trim() || undefined,
        difficulty,
        learningPreferences: preferences.length > 0 ? preferences : undefined,
        additionalInstructions: additionalInstructions.trim() || undefined,
        ...(source === "studyPlanner" && (spStudyPlanId || spStudyTaskId)
          ? {
              studyPlanId: spStudyPlanId ? (spStudyPlanId as Id<"studyPlans">) : undefined,
              studyTaskId: spStudyTaskId ? (spStudyTaskId as Id<"studyPlanTasks">) : undefined,
            }
          : {}),
        ...(source === "questionBank" && qbCollectionId
          ? {
              questionBankCollectionId: qbCollectionId as Id<"questionBankCollections">,
              questionBankQuestionIds:
                qbQuestionIds.length > 0 ? (qbQuestionIds as Id<"questionBankQuestions">[]) : undefined,
            }
          : {}),
        ...(source === "resumeMatch" && rmAnalysisId
          ? { resumeMatchAnalysisId: rmAnalysisId as Id<"ResumeMatchAnalysisTable"> }
          : {}),
        ...(source === "interviewReview" && irInterviewId
          ? { interviewReviewId: irInterviewId as Id<"InterviewSessionTable"> }
          : {}),
      })
      const { sessionId } = await startSession({ userId, studyRoomId })
      router.push(`/study-room/session/${sessionId}`)
    } catch {
      setError("Unable to create this study room right now. Please try again.")
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 md:px-10 md:py-14">
      <Link
        href="/study-room"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to AI Study Room
      </Link>

      <div className="mt-6 flex flex-col items-center text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Bot className="size-6" />
        </div>
        <h1 className="mt-4 text-[28px] font-bold tracking-tight text-foreground sm:text-3xl">
          Create Study Room
        </h1>
        <p className="mt-2 max-w-md text-[15px] text-muted-foreground">
          Set up what you want to learn and your AI tutor will adapt the lesson, whiteboard and practice to
          match.
        </p>
      </div>

      {linkBanner && (
        <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">
          <Link2 className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="flex-1">
            {linkBanner} - everything below is editable, and this room works independently either way.
          </p>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-8 flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
      >
        <div>
          <FieldLabel>Study Room title</FieldLabel>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Mastering System Design"
            className={inputClass}
          />
        </div>

        <div>
          <FieldLabel>Learning topic</FieldLabel>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., System Design Fundamentals"
            className={inputClass}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {TOPIC_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setTopic(suggestion)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  topic === suggestion
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-muted text-muted-foreground hover:border-primary/30"
                }`}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel optional>Subject / category</FieldLabel>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g., Backend Engineering"
            className={inputClass}
          />
        </div>

        <div>
          <FieldLabel optional>Learning objective</FieldLabel>
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={3}
            placeholder="e.g., Be able to design a scalable URL shortener and explain my trade-offs."
            className={`${inputClass} resize-none`}
          />
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-semibold text-foreground">Current knowledge level</span>
          <div className="grid grid-cols-3 gap-3">
            {DIFFICULTY_LEVELS.map((level) => {
              const isSelected = difficulty === level
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => setDifficulty(level)}
                  aria-pressed={isSelected}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {DIFFICULTY_LABEL[level]}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <FieldLabel optional>Learning preferences</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {PREFERENCE_OPTIONS.map((pref) => {
              const isSelected = preferences.includes(pref)
              return (
                <button
                  key={pref}
                  type="button"
                  onClick={() => togglePreference(pref)}
                  aria-pressed={isSelected}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border bg-muted text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {pref}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <FieldLabel optional>Additional instructions</FieldLabel>
          <textarea
            value={additionalInstructions}
            onChange={(e) => setAdditionalInstructions(e.target.value)}
            rows={2}
            placeholder="Anything specific you'd like the tutor to focus on or avoid."
            className={`${inputClass} resize-none`}
          />
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="flex-1">{error}</p>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2.5 sm:flex-row">
          <Link
            href="/study-room"
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || !userId}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {saving ? "Starting..." : "Start Learning"}
          </button>
        </div>
      </form>
    </div>
  )
}

// useSearchParams needs a Suspense boundary so the page can still prerender.
function CreateStudyRoomPage() {
  return (
    <Suspense fallback={null}>
      <CreateStudyRoomForm />
    </Suspense>
  )
}

export default CreateStudyRoomPage
