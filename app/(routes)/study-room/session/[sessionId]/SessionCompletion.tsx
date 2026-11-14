"use client"

import React, { useContext, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery } from "convex/react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  PenTool,
  Code2,
  NotebookPen,
  Sparkles,
  Loader2,
} from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import { formatDateTime, formatDuration } from "../../types"

interface SessionCompletionProps {
  sessionId: string
  session: {
    status: "completed" | "abandoned"
    startedAt: number
    endedAt?: number
    durationSeconds?: number
    summaryStatus: "none" | "generating" | "ready" | "failed"
  }
  room: {
    _id: string
    title: string
    topic: string
    objective?: string
    category?: string
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function Section({
  title,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  title: string
  icon: React.ElementType
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Icon className="size-4 text-primary" /> {title}
        </span>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>
      {open && <div className="border-t border-border px-5 py-4">{children}</div>}
    </div>
  )
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing noted for this category.</p>
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

function SessionCompletion({ sessionId, session, room }: SessionCompletionProps) {
  const router = useRouter()
  const { userDetail } = useContext(UserDetailContext)
  const userId: Id<"UserTable"> | undefined = userDetail?._id
  const sid = sessionId as Id<"studyRoomSessions">

  const summaryData = useQuery(api.StudyRoom.GetSessionSummary, userId ? { userId, sessionId: sid } : "skip")
  const messages = useQuery(api.StudyRoom.GetStudyRoomMessages, userId ? { userId, sessionId: sid } : "skip")
  const whiteboard = useQuery(api.StudyRoomWorkspace.GetWhiteboard, userId ? { userId, sessionId: sid } : "skip")
  const codeFiles = useQuery(api.StudyRoomWorkspace.GetCodeFiles, userId ? { userId, sessionId: sid } : "skip")
  const notes = useQuery(api.StudyRoomWorkspace.GetNotes, userId ? { userId, sessionId: sid } : "skip")
  const startSession = useMutation(api.StudyRoom.StartStudyRoomSession)

  const [triggered, setTriggered] = useState(false)
  const [insufficient, setInsufficient] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [assessmentOpen, setAssessmentOpen] = useState(true)
  const [nextStepsOpen, setNextStepsOpen] = useState(true)
  const [isStarting, setIsStarting] = useState(false)
  const reviewRef = useRef<HTMLDivElement>(null)
  const triggerKeyRef = useRef<string | null>(null)

  async function requestSummary(force: boolean) {
    setGenError(null)
    setInsufficient(false)
    try {
      const res = await fetch("/api/study-room/summary/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, force }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok && res.status !== 409) {
        setGenError(data?.error ?? "Unable to generate a summary right now.")
        return
      }
      if (data?.insufficient) setInsufficient(true)
    } catch {
      setGenError("Unable to generate a summary right now.")
    }
  }

  // Auto-trigger once, only from a fresh "none" status - never re-fires for
  // "generating"/"ready"/"failed" on its own (M4 - "duplicate summaries are
  // avoided" and "generate only when sufficient information is available").
  useEffect(() => {
    if (summaryData === undefined) return
    const key = sessionId
    if (triggerKeyRef.current === key) return
    triggerKeyRef.current = key
    if (summaryData.status === "none") {
      requestSummary(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryData, sessionId])

  async function handleRegenerate() {
    setRegenerating(true)
    await requestSummary(true)
    setRegenerating(false)
  }

  async function handleContinueLearning() {
    if (!userId || isStarting) return
    setIsStarting(true)
    try {
      const result = await startSession({ userId, studyRoomId: room._id as Id<"studyRooms"> })
      router.push(`/study-room/session/${result.sessionId}`)
    } catch (e) {
      console.error(e)
      setIsStarting(false)
    }
  }

  function handleReviewSession() {
    setTranscriptOpen(true)
    setNotesOpen(true)
    reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const summary = summaryData?.status === "ready" ? summaryData.summary : null
  const whiteboardSaved = Array.isArray(whiteboard?.snapshot?.elements)
    ? whiteboard!.snapshot.elements.some((el: any) => !el?.isDeleted)
    : false
  const codeSaved = (codeFiles?.length ?? 0) > 0
  const notesPlainText = notes ? stripHtml(notes.content) : ""
  const notesSaved = notesPlainText.length > 0

  const isAbandoned = session.status === "abandoned"

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 md:px-10 md:py-14">
      <div
        className={`flex flex-col items-center gap-4 rounded-2xl border p-8 text-center shadow-sm ${
          isAbandoned ? "border-warning/30 bg-warning/5" : "border-border bg-card"
        }`}
      >
        <div
          className={`flex size-14 items-center justify-center rounded-full ${
            isAbandoned ? "bg-warning/15 text-warning-foreground" : "bg-success/15 text-success"
          }`}
        >
          {isAbandoned ? <AlertTriangle className="size-7" /> : <CheckCircle2 className="size-7" />}
        </div>
        <div>
          <p className="text-xs font-semibold text-primary">{room.topic}</p>
          <h1 className="mt-1 text-xl font-bold text-foreground">{room.title}</h1>
        </div>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          {isAbandoned
            ? "This session ended unexpectedly - but don't worry, everything you worked on was saved."
            : "Nice work! You've completed this learning session."}
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
          <Clock className="size-3.5" /> {formatDuration(session.durationSeconds)} &middot; {formatDateTime(session.startedAt)}
        </span>

        <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${
              whiteboardSaved ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
            }`}
          >
            <PenTool className="size-3" /> {whiteboardSaved ? "Whiteboard saved" : "No whiteboard content"}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${
              codeSaved ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
            }`}
          >
            <Code2 className="size-3" /> {codeSaved ? `${codeFiles!.length} code file(s) saved` : "No code saved"}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${
              notesSaved ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
            }`}
          >
            <NotebookPen className="size-3" /> {notesSaved ? "Notes saved" : "No notes saved"}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={handleReviewSession}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Review the Session
          </button>
          <button
            type="button"
            onClick={handleContinueLearning}
            disabled={isStarting}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-60"
          >
            {isStarting ? "Starting..." : "Continue Learning"}
          </button>
          <Link
            href="/study-room"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Study Room Dashboard
          </Link>
          <Link
            href="/study-room/create"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Start Another Study Room
          </Link>
        </div>
      </div>

      {/* --- Lesson Summary ---------------------------------------------- */}
      <div className="mt-8" ref={reviewRef}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Sparkles className="size-4.5 text-primary" /> Learning Summary
          </h2>
          {summaryData?.status === "ready" && (
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:opacity-60"
            >
              <RefreshCw className={`size-3.5 ${regenerating ? "animate-spin" : ""}`} /> Regenerate
            </button>
          )}
        </div>

        <div className="mt-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          {insufficient && (
            <p className="text-sm text-muted-foreground">
              There isn't enough conversation in this session to generate a meaningful summary.
            </p>
          )}
          {genError && (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-destructive">{genError}</p>
              <button
                type="button"
                onClick={() => requestSummary(false)}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          )}
          {!insufficient && !genError && (summaryData?.status === "none" || summaryData?.status === "generating") && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Generating your learning summary...
            </p>
          )}
          {!insufficient && !genError && summaryData?.status === "failed" && (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-destructive">We couldn't generate a summary for this session.</p>
              <button
                type="button"
                onClick={() => requestSummary(false)}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {summary && (
            <div className="flex flex-col gap-5">
              <p className="text-sm leading-relaxed text-foreground">{summary.overview}</p>

              {summary.topicsCovered.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Topics Covered</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {summary.topicsCovered.map((t: string, i: number) => (
                      <span key={i} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {summary.keyConcepts.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Key Concepts Explained</p>
                  <div className="mt-2 flex flex-col gap-2">
                    {summary.keyConcepts.map((c: { term: string; explanation: string }, i: number) => (
                      <div key={i} className="rounded-xl bg-muted/50 p-3">
                        <p className="text-sm font-semibold text-foreground">{c.term}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{c.explanation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {summary.definitions.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Important Definitions</p>
                  <div className="mt-2 flex flex-col gap-2">
                    {summary.definitions.map((d: { term: string; definition: string }, i: number) => (
                      <p key={i} className="text-sm text-foreground">
                        <span className="font-semibold">{d.term}:</span> <span className="text-muted-foreground">{d.definition}</span>
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {summary.examples.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Examples &amp; Demonstrations</p>
                  <div className="mt-2">
                    <BulletList items={summary.examples} />
                  </div>
                </div>
              )}

              {summary.qaExchanges.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    From Your Conversation - Questions &amp; Your Responses
                  </p>
                  <div className="mt-2 flex flex-col gap-2.5">
                    {summary.qaExchanges.map((qa: { tutorQuestion: string; learnerResponse: string }, i: number) => (
                      <div key={i} className="rounded-xl border border-border p-3">
                        <p className="text-sm font-medium text-foreground">Q: {qa.tutorQuestion}</p>
                        <p className="mt-1 text-sm text-muted-foreground">A: {qa.learnerResponse}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {summary && (
        <div className="mt-4 flex flex-col gap-3">
          <Section title="Tutor's Assessment (AI-generated, not a grade)" icon={Sparkles} open={assessmentOpen} onToggle={() => setAssessmentOpen((v) => !v)}>
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-success">Understood Well</p>
                <div className="mt-2">
                  <BulletList items={summary.understoodWell} />
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-warning-foreground">Areas Requiring Improvement</p>
                <div className="mt-2">
                  <BulletList items={summary.areasForImprovement} />
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-destructive">Misunderstandings Identified</p>
                <div className="mt-2">
                  <BulletList items={summary.misunderstandings} />
                </div>
              </div>
            </div>
          </Section>

          <Section title="Recommended Next Steps" icon={Sparkles} open={nextStepsOpen} onToggle={() => setNextStepsOpen((v) => !v)}>
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Suggested Revision Topics</p>
                <div className="mt-2">
                  <BulletList items={summary.revisionTopics} />
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Recommended Next Activities</p>
                <div className="mt-2">
                  <BulletList items={summary.nextActivities} />
                </div>
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* --- Lesson Notes & Transcript access ----------------------------- */}
      <div className="mt-4 flex flex-col gap-3">
        {notesSaved && (
          <Section title="Lesson Notes" icon={NotebookPen} open={notesOpen} onToggle={() => setNotesOpen((v) => !v)}>
            <div
              className="text-sm leading-relaxed text-foreground [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-xs [&_blockquote]:text-primary [&_li]:ml-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
              dangerouslySetInnerHTML={{ __html: notes!.content }}
            />
          </Section>
        )}

        <Section title="Complete Transcript" icon={Clock} open={transcriptOpen} onToggle={() => setTranscriptOpen((v) => !v)}>
          {messages && messages.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {messages.map((m) => (
                <div key={m._id} className={`flex ${m.role === "tutor" ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[85%] rounded-xl px-3.5 py-2 text-sm leading-relaxed ${
                      m.role === "tutor" ? "rounded-tl-sm bg-muted text-foreground" : "rounded-tr-sm bg-primary text-primary-foreground"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No conversation was recorded for this session.</p>
          )}
        </Section>
      </div>
    </div>
  )
}

export default SessionCompletion
