"use client"

import React, { useEffect, useRef, useState } from "react"
import {
  BookMarked,
  CheckCircle2,
  ChevronUp,
  ClipboardList,
  ExternalLink,
  FileText,
  Hammer,
  Info,
  ListChecks,
  Loader2,
  PlayCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react"

// Mirrors convex/schema.ts:taskLearningResourcesValidator.
type TaskType = "video" | "reading" | "practice" | "quiz" | "project" | "revision"
type SearchStatus = "found" | "none_found" | "unavailable"

export interface LearningResources {
  taskType: TaskType
  generatedForTitle: string
  generatedAt: number
  videoSearchStatus: SearchStatus
  readingSearchStatus: SearchStatus
  videos: { videoId: string; title: string; channel?: string; url: string }[]
  readings: { title: string; url: string; source: string }[]
  guide?: {
    overview: string
    steps: string[]
    examples: string[]
    expectedOutcomes: string[]
    deliverables: string[]
  }
  quiz?: { question: string; options: string[]; correctIndex: number; explanation: string }[]
}

const TASK_TYPE_LABEL: Record<TaskType, string> = {
  video: "Video lecture",
  reading: "Reading",
  practice: "Practical exercise",
  quiz: "Quiz",
  project: "Project",
  revision: "Revision",
}

const sectionLabel = "text-xs font-semibold tracking-wide text-muted-foreground uppercase"

interface Props {
  taskId: string
  taskTitle: string
  resources: LearningResources | null
}

export default function LearningResourcesSection({ taskId, taskTitle, resources }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoRequestedRef = useRef<string | null>(null)

  async function findResources() {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/study-planner/task-resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? "Unable to find learning resources right now. Please try again.")
      }
      // On success the live GetTaskDetails query re-renders this section
      // with the stored resources - nothing to set here.
    } catch {
      setError("Unable to find learning resources right now. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // First visit to a task with no resources yet: look them up once
  // automatically so the learner always has material to study from.
  useEffect(() => {
    if (resources || autoRequestedRef.current === taskId) return
    autoRequestedRef.current = taskId
    void findResources()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, resources])

  const isStale = !!resources && resources.generatedForTitle !== taskTitle

  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookMarked className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Learning resources</p>
            <p className="text-sm text-muted-foreground">Study this task on your own with the material below.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {resources && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {TASK_TYPE_LABEL[resources.taskType]}
            </span>
          )}
          {resources && (
            <button
              type="button"
              onClick={findResources}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          )}
        </div>
      </div>

      {isStale && !loading && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2 text-xs text-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 text-warning" />
          These resources were found for an earlier version of this task (&ldquo;{resources?.generatedForTitle}&rdquo;). Refresh to
          find resources for the current title.
        </p>
      )}

      {error && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <button type="button" onClick={findResources} disabled={loading} className="text-xs font-semibold underline-offset-2 hover:underline">
            Try again
          </button>
        </div>
      )}

      {loading && !resources && (
        <div className="mt-5 flex items-center gap-3 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          Searching for and verifying real learning resources for this task. This can take up to a minute.
        </div>
      )}

      {!loading && !resources && !error && (
        <button
          type="button"
          onClick={findResources}
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
        >
          <Search className="size-4" /> Find learning resources
        </button>
      )}

      {resources && (
        <div className={`mt-5 flex flex-col gap-6 ${loading ? "opacity-60" : ""}`}>
          <VideoBlock resources={resources} taskTitle={taskTitle} />
          {resources.guide && <GuideBlock guide={resources.guide} isProject={resources.taskType === "project"} />}
          {resources.quiz && <QuizBlock key={resources.generatedAt} quiz={resources.quiz} />}
          <ReadingBlock resources={resources} taskTitle={taskTitle} />

          <p className="flex items-start gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Watching a video, opening a reading or answering the quiz doesn&apos;t complete this task. Mark it complete yourself
            once you&apos;ve met the completion criteria.
          </p>
        </div>
      )}
    </div>
  )
}

function UnavailableNote({ children, searchHref, searchLabel }: { children: React.ReactNode; searchHref: string; searchLabel: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
      <p>{children}</p>
      <a
        href={searchHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <Search className="size-3.5" /> {searchLabel}
      </a>
    </div>
  )
}

function VideoBlock({ resources, taskTitle }: { resources: LearningResources; taskTitle: string }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const { videos } = resources
  const isVideoTask = resources.taskType === "video"

  // Videos are optional extras for non-video tasks - only video tasks get an
  // explicit "nothing found" notice.
  if (videos.length === 0 && !isVideoTask) return null

  const youtubeSearchHref = `https://www.youtube.com/results?search_query=${encodeURIComponent(taskTitle)}`

  if (videos.length === 0) {
    return (
      <div>
        <p className={sectionLabel}>Video lecture</p>
        <div className="mt-2">
          <UnavailableNote searchHref={youtubeSearchHref} searchLabel="Search YouTube for this topic">
            {resources.videoSearchStatus === "unavailable"
              ? "Video search is unavailable right now, so no video could be verified for this task. Try Refresh later."
              : "No verified, embeddable video could be found for this task. Nothing is shown rather than an unverified link."}
          </UnavailableNote>
        </div>
      </div>
    )
  }

  const active = videos[Math.min(activeIndex, videos.length - 1)]

  return (
    <div>
      <p className={sectionLabel}>{isVideoTask ? "Video lecture" : "Related videos"}</p>
      <div className="mt-2 overflow-hidden rounded-xl border border-border bg-black">
        <div className="relative aspect-video w-full">
          <iframe
            key={active.videoId}
            src={`https://www.youtube-nocookie.com/embed/${active.videoId}?rel=0`}
            title={active.title}
            className="absolute inset-0 size-full"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{active.title}</p>
          {active.channel && <p className="text-xs text-muted-foreground">{active.channel} &middot; YouTube</p>}
        </div>
        <a
          href={active.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <ExternalLink className="size-3.5" /> Open on YouTube
        </a>
      </div>

      {videos.length > 1 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {videos.map((video, i) => (
            <button
              key={video.videoId}
              type="button"
              onClick={() => setActiveIndex(i)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                i === activeIndex ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
              }`}
            >
              <PlayCircle className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{video.title}</span>
              {video.channel && <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{video.channel}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ReadingBlock({ resources, taskTitle }: { resources: LearningResources; taskTitle: string }) {
  const { readings } = resources
  const isReadingTask = resources.taskType === "reading"
  const [showAll, setShowAll] = useState(false)

  if (readings.length === 0) {
    return (
      <div>
        <p className={sectionLabel}>{isReadingTask ? "Reading material" : "Further reading"}</p>
        <div className="mt-2">
          <UnavailableNote
            searchHref={`https://www.google.com/search?q=${encodeURIComponent(taskTitle)}`}
            searchLabel="Search the web for this topic"
          >
            {resources.readingSearchStatus === "unavailable"
              ? "Article search is unavailable right now, so no reading material could be verified. Try Refresh later."
              : "No reading material could be verified for this task. Nothing is shown rather than an unverified link."}
          </UnavailableNote>
        </div>
      </div>
    )
  }

  // The reading list (both "Reading material" and "Further reading") starts
  // collapsed to its first item, for every task type.
  const collapsible = readings.length > 1
  const visibleReadings = collapsible && !showAll ? readings.slice(0, 1) : readings
  const hiddenCount = readings.length - 1

  return (
    <div>
      <p className={sectionLabel}>{isReadingTask ? "Reading material" : "Further reading"}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {visibleReadings.map((reading) => (
          <li key={reading.url}>
            <a
              href={reading.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-2.5 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted"
            >
              <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground group-hover:underline">{reading.title}</span>
                <span className="block text-xs text-muted-foreground">{reading.source}</span>
              </span>
              <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            </a>
          </li>
        ))}
      </ul>
      {collapsible && (
        <button
          type="button"
          onClick={() => setShowAll((prev) => !prev)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          {showAll ? (
            <>
              <ChevronUp className="size-3.5" /> Show less
            </>
          ) : (
            <>
              <Plus className="size-3.5" /> {hiddenCount} More
            </>
          )}
        </button>
      )}
    </div>
  )
}

function AiGeneratedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
      <Sparkles className="size-3" /> AI-generated
    </span>
  )
}

function GuideList({ title, items, ordered }: { title: string; items: string[]; ordered?: boolean }) {
  if (items.length === 0) return null
  const ListTag = ordered ? "ol" : "ul"
  return (
    <div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <ListTag className={`mt-1.5 flex flex-col gap-1.5 pl-5 text-sm text-foreground ${ordered ? "list-decimal" : "list-disc"}`}>
        {items.map((item, i) => (
          <li key={i} className="whitespace-pre-line marker:text-muted-foreground">
            {item}
          </li>
        ))}
      </ListTag>
    </div>
  )
}

function GuideBlock({ guide, isProject }: { guide: NonNullable<LearningResources["guide"]>; isProject: boolean }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className={sectionLabel}>{isProject ? "Project brief" : "Exercise instructions"}</p>
        <AiGeneratedBadge />
      </div>
      <div className="mt-2 flex flex-col gap-4 rounded-xl bg-muted/50 p-4">
        {guide.overview && (
          <p className="flex items-start gap-2 text-sm text-foreground">
            {isProject ? <Hammer className="mt-0.5 size-4 shrink-0 text-primary" /> : <ClipboardList className="mt-0.5 size-4 shrink-0 text-primary" />}
            {guide.overview}
          </p>
        )}
        <GuideList title="Steps" items={guide.steps} ordered />
        <GuideList title="Examples" items={guide.examples} />
        <GuideList title="Expected outcomes" items={guide.expectedOutcomes} />
        <GuideList title="Deliverables" items={guide.deliverables} />
      </div>
    </div>
  )
}

function QuizBlock({ quiz }: { quiz: NonNullable<LearningResources["quiz"]> }) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => quiz.map(() => null))
  const answeredCount = answers.filter((a) => a !== null).length
  const correctCount = answers.filter((a, i) => a === quiz[i].correctIndex).length

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className={sectionLabel}>Self-check quiz</p>
        <AiGeneratedBadge />
      </div>
      <div className="mt-2 flex flex-col gap-4">
        {quiz.map((q, qi) => {
          const chosen = answers[qi]
          const answered = chosen !== null
          return (
            <div key={qi} className="rounded-xl border border-border p-4">
              <p className="text-sm font-semibold text-foreground">
                {qi + 1}. {q.question}
              </p>
              <div className="mt-3 flex flex-col gap-1.5">
                {q.options.map((option, oi) => {
                  const isCorrect = oi === q.correctIndex
                  const isChosen = oi === chosen
                  const stateClass = !answered
                    ? "border-border hover:bg-muted"
                    : isCorrect
                      ? "border-success/50 bg-success/10"
                      : isChosen
                        ? "border-destructive/50 bg-destructive/10"
                        : "border-border opacity-70"
                  return (
                    <button
                      key={oi}
                      type="button"
                      disabled={answered}
                      onClick={() => setAnswers((prev) => prev.map((a, i) => (i === qi ? oi : a)))}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm text-foreground transition-colors disabled:cursor-default ${stateClass}`}
                    >
                      {answered && isCorrect ? (
                        <CheckCircle2 className="size-4 shrink-0 text-success" />
                      ) : answered && isChosen ? (
                        <XCircle className="size-4 shrink-0 text-destructive" />
                      ) : (
                        <span className="size-4 shrink-0 rounded-full border border-border" />
                      )}
                      {option}
                    </button>
                  )
                })}
              </div>
              {answered && (
                <p className="mt-3 text-sm text-muted-foreground">
                  <span className={`font-semibold ${chosen === q.correctIndex ? "text-success" : "text-destructive"}`}>
                    {chosen === q.correctIndex ? "Correct." : "Not quite."}
                  </span>{" "}
                  {q.explanation}
                </p>
              )}
            </div>
          )
        })}
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <ListChecks className="size-4" />
            {answeredCount === quiz.length
              ? `You scored ${correctCount} / ${quiz.length}`
              : `${answeredCount} of ${quiz.length} answered`}
          </span>
          {answeredCount > 0 && (
            <button
              type="button"
              onClick={() => setAnswers(quiz.map(() => null))}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3.5" /> Retake quiz
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
