"use client"

import React, { useContext, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { UserDetailContext } from "@/context/UserDetailContext"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { FileUpload } from "@/components/ui/file-upload"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  FileText,
  Headphones,
  Play,
  Pause,
  RotateCcw,
  Clock,
  Loader2,
  ListChecks,
  Lock,
  Sparkles,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { Id } from "@/convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import { PRACTICE_QUESTIONS, FREE_PLAN_MAX_QUESTIONS } from "./questions"

// "Tell me about yourself" is pre-selected for every new session - it's the
// de facto opener in almost any interview, so starting the candidate there
// instead of an empty list.
const DEFAULT_SELECTED_QUESTIONS = [PRACTICE_QUESTIONS[0]]

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function relativeTime(timestamp: number) {
  const diffMins = Math.round((Date.now() - timestamp) / 60000)
  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.round(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.round(diffHours / 24)}d ago`
}

const WAVE_BAR_HEIGHTS = [8, 14, 10, 18, 11, 16, 9]

function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-1" aria-hidden>
      {WAVE_BAR_HEIGHTS.map((h, i) => (
        <motion.span
          key={i}
          className="w-1 rounded-full bg-primary/70"
          style={{ height: h }}
          animate={active ? { scaleY: [1, 1.9, 0.5, 1.5, 1] } : { scaleY: 0.6 }}
          transition={
            active
              ? { duration: 0.9 + (i % 3) * 0.2, repeat: Infinity, ease: "easeInOut", delay: i * 0.05 }
              : { duration: 0.2 }
          }
        />
      ))}
    </div>
  )
}

function PracticeCoach() {
  const { userDetail } = useContext(UserDetailContext)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [jobTitle, setJobTitle] = useState("")
  const [jobDescription, setJobDescription] = useState("")
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>(DEFAULT_SELECTED_QUESTIONS)
  const [upgradeNoticeOpen, setUpgradeNoticeOpen] = useState(false)
  const [questionsNoticeOpen, setQuestionsNoticeOpen] = useState(false)
  const [invalidFileNotice, setInvalidFileNotice] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [autoplayRequested, setAutoplayRequested] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [audioErrorRowId, setAudioErrorRowId] = useState<Id<"PracticeCoachTable"> | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [sessionToDelete, setSessionToDelete] = useState<Id<"PracticeCoachTable"> | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [generatingAudioId, setGeneratingAudioId] = useState<Id<"PracticeCoachTable"> | null>(null)
  const [resumeUploadKey, setResumeUploadKey] = useState(0)
  const [formNotice, setFormNotice] = useState<{ type: "required" | "advisory"; message: string } | null>(null)

  // Every Practice Coach generation for this user, newest first - rendered as
  // a single playlist, each row playable and deletable on its own.
  const allGenerations = useQuery(
    api.PracticeCoach.GetAllPracticeCoachGenerationsForUser,
    userDetail?._id ? { userId: userDetail._id } : "skip"
  )

  type PracticeCoachGeneration = NonNullable<typeof allGenerations>[number]

  // Setting audioUrl and requesting autoplay happen in separate state
  // updates, so autoplay only actually starts once the <audio> element's
  // src has re-rendered with the new value.
  useEffect(() => {
    if (!autoplayRequested || !audioUrl) return
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    audio.play().catch(() => {})
    setAutoplayRequested(false)
  }, [audioUrl, autoplayRequested])

  const runGeneration = async () => {
    if (!resumeFile || generating) return
    setGenerating(true)
    try {
      const formData = new FormData()
      formData.append("file", resumeFile)
      formData.append("jobTitle", jobTitle)
      formData.append("jobDescription", jobDescription)
      formData.append("selectedQuestions", JSON.stringify(selectedQuestions))
      const res = await fetch("/api/practice-coach/generate", {
        method: "POST",
        body: formData,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        console.error("Failed to generate practice video:", data?.error)
      } else {
        setAudioUrl(data?.audioUrl ?? null)
        // Clear the form so the candidate starts the next session fresh -
        // this also re-disables Generate Scripts until a resume is chosen again.
        setResumeFile(null)
        setJobTitle("")
        setJobDescription("")
        setSelectedQuestions(DEFAULT_SELECTED_QUESTIONS)
        setResumeUploadKey((key) => key + 1)
      }
    } catch (e) {
      console.error("Failed to generate practice video:", e)
    } finally {
      setGenerating(false)
    }
  }

  // The dropzone's own "accept" hint doesn't block drag-and-drop or an "all
  // files" picker override, so the real check happens here - anything that
  // isn't a PDF is rejected immediately, with no option but to acknowledge.
  const onResumeFileChange = (files: File[]) => {
    const file = files[0]
    if (!file) return
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    if (!isPdf) {
      setResumeFile(null)
      setResumeUploadKey((key) => key + 1)
      setInvalidFileNotice("Only PDF files are supported for your resume. Please upload a .pdf file.")
      return
    }
    setResumeFile(file)
  }

  // Multi-select, capped at FREE_PLAN_MAX_QUESTIONS until real plan-based
  // gating exists - picking past the cap surfaces the upgrade dialog instead.
  const onToggleQuestion = (question: string) => {
    setSelectedQuestions((prev) => {
      if (prev.includes(question)) {
        return prev.filter((q) => q !== question)
      }
      if (prev.length >= FREE_PLAN_MAX_QUESTIONS) {
        setUpgradeNoticeOpen(true)
        return prev
      }
      return [...prev, question]
    })
  }

  const onGenerateVideo = () => {
    if (!resumeFile || generating) return

    const trimmedTitle = jobTitle.trim()
    const trimmedDescription = jobDescription.trim()

    // Job description alone isn't enough to tailor a script to a role -
    // require the job title whenever a description is given.
    if (!trimmedTitle && trimmedDescription) {
      setFormNotice({
        type: "required",
        message:
          "Please add a Job Title along with the Job Description so we can tailor the script to the right role.",
      })
      return
    }

    // Job title and/or description are otherwise optional - nudge the
    // candidate toward providing both for a better script, but let them
    // choose to proceed without one or both.
    if (!trimmedTitle && !trimmedDescription) {
      setFormNotice({
        type: "advisory",
        message:
          "You haven't added a Job Title or Job Description. Providing both helps us generate a better, more tailored practice script.",
      })
      return
    }

    if (trimmedTitle && !trimmedDescription) {
      setFormNotice({
        type: "advisory",
        message:
          "You haven't added a Job Description. Providing both the Job Title and Job Description helps us generate a better, more tailored practice script.",
      })
      return
    }

    // Only the default question selected - on the free plan there's still
    // room for more, so offer the candidate a chance to add some before
    // the script locks in around just one question.
    if (selectedQuestions.length === 1) {
      setQuestionsNoticeOpen(true)
      return
    }

    runGeneration()
  }

  const onTogglePlayback = () => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return
    if (isPlaying) {
      audio.pause()
    } else {
      if (audio.ended) audio.currentTime = 0
      audio.play()
    }
  }

  const onRestart = () => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return
    audio.currentTime = 0
    audio.play()
  }

  const onSeek = (value: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = value
    setCurrentTime(value)
  }

  // Loads/generates a given row's audio, then plays it.
  const onLoadGeneration = async (generation: PracticeCoachGeneration) => {
    if (generatingAudioId) return

    if (generation.audioUrl) {
      setAudioError(null)
      setAudioErrorRowId(null)
      setAudioUrl(generation.audioUrl)
      setAutoplayRequested(true)
      return
    }

    setGeneratingAudioId(generation._id)
    setAudioError(null)
    setAudioErrorRowId(null)
    try {
      const res = await fetch("/api/practice-coach/generate-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practiceCoachId: generation._id }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setAudioError(data?.error ?? "Unable to generate audio. Please try again.")
        setAudioErrorRowId(generation._id)
        return
      }
      setAudioUrl(data?.audioUrl ?? null)
      setAutoplayRequested(true)
    } catch (e) {
      console.error("Failed to generate audio for this practice script:", e)
      setAudioError("Unable to generate audio. Please try again.")
      setAudioErrorRowId(generation._id)
    } finally {
      setGeneratingAudioId(null)
    }
  }

  const onPlayerButtonClick = (generation: PracticeCoachGeneration) => {
    if (generatingAudioId) return
    const isRowLoaded = !!audioUrl && !!generation.audioUrl && audioUrl === generation.audioUrl
    if (isRowLoaded) {
      onTogglePlayback()
    } else {
      onLoadGeneration(generation)
    }
  }

  const onConfirmDelete = async () => {
    if (!sessionToDelete || isDeleting) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch("/api/practice-coach/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practiceCoachId: sessionToDelete }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setDeleteError(data?.error ?? "Unable to delete this session. Please try again.")
        return
      }
      const deletedGeneration = allGenerations?.find((g) => g._id === sessionToDelete)
      if (deletedGeneration?.audioUrl && deletedGeneration.audioUrl === audioUrl) {
        audioRef.current?.pause()
        setAudioUrl(null)
        setIsPlaying(false)
      }
      setSessionToDelete(null)
    } catch (e) {
      console.error("Failed to delete practice session:", e)
      setDeleteError("Unable to delete this session. Please try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="relative mx-auto max-w-5xl overflow-hidden px-6 py-10 md:px-10 md:py-14">
      <div className="pointer-events-none absolute -top-24 left-1/4 -z-10 size-80 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -top-10 right-0 -z-10 size-72 rounded-full bg-primary/10 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-4"
      >
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Headphones className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Practice Coach</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground md:text-base">
            Let AI transform your resume into personalized interview practice — so you know what to say and how to say it
          </p>
        </div>
      </motion.div>

      {/* Playlist */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="relative mt-8 overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-sm md:p-8"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 size-48 rounded-full bg-primary/10 blur-2xl" />

        {allGenerations && allGenerations.length > 0 ? (
          <div className="relative z-10 flex flex-col divide-y divide-border">
            {allGenerations.map((generation) => {
              const isRowLoaded = !!audioUrl && !!generation.audioUrl && audioUrl === generation.audioUrl
              const isRowGeneratingAudio = generatingAudioId === generation._id
              // Only the question whose narration has started by the current
              // playback position - timeline entries are already in the
              // order they're read, so the last one at or before now is active.
              const activeQuestion = isRowLoaded
                ? generation.questionTimeline?.reduce<string | null>(
                    (active, entry) => (entry.startTime <= currentTime ? entry.question : active),
                    null
                  ) ?? null
                : null
              return (
                <div key={generation._id} className="flex flex-col gap-6 py-6 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => onPlayerButtonClick(generation)}
                        disabled={isRowGeneratingAudio}
                        className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 disabled:pointer-events-none disabled:opacity-60"
                      >
                        {isRowGeneratingAudio ? (
                          <Loader2 className="size-6 animate-spin" />
                        ) : isRowLoaded && isPlaying ? (
                          <Pause className="size-6" />
                        ) : (
                          <Play className="size-6" />
                        )}
                      </button>
                      <div>
                        <p className="font-semibold text-foreground">
                          {generation.jobTitle || "Practice script"}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          {isRowGeneratingAudio ? "Generating audio…" : relativeTime(generation.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Waveform active={isRowLoaded && isPlaying} />
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => {
                          setDeleteError(null)
                          setSessionToDelete(generation._id)
                        }}
                        disabled={isRowLoaded && isPlaying}
                        aria-label="Delete session"
                        className="shrink-0 text-muted-foreground"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>

                  {audioErrorRowId === generation._id && audioError && (
                    <p className="text-sm text-destructive">{audioError}</p>
                  )}

                  {isRowLoaded && (
                    <AnimatePresence mode="wait">
                      {activeQuestion && (
                        <motion.div
                          key={activeQuestion}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.25 }}
                          className="rounded-xl border border-primary/30 bg-primary/5 p-3.5"
                        >
                          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
                            <ListChecks className="size-3.5" />
                            Now practicing
                          </p>
                          <p className="mt-1 text-sm font-medium leading-snug text-foreground">
                            {activeQuestion}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}

                  {isRowLoaded && (
                    <div className="flex items-center gap-3">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={onRestart}
                        aria-label="Restart"
                        className="shrink-0 text-muted-foreground"
                      >
                        <RotateCcw />
                      </Button>
                      <span className="w-9 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                        {formatTime(currentTime)}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={duration || 0}
                        step={0.1}
                        value={currentTime}
                        onChange={(e) => onSeek(Number(e.target.value))}
                        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                      />
                      <span className="w-9 shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatTime(duration)}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="relative z-10 flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Headphones className="size-6" />
            </div>
            <div>
              <p className="font-medium text-foreground">No practice sessions yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Upload your resume below to generate your first personalized practice script and audio.
              </p>
            </div>
          </div>
        )}

        <audio
          ref={audioRef}
          src={audioUrl ?? undefined}
          preload="metadata"
          className="hidden"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={(e) => {
            setIsPlaying(false)
            e.currentTarget.currentTime = 0
            setCurrentTime(0)
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        />
      </motion.div>

      <Dialog
        open={!!sessionToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setSessionToDelete(null)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this practice session?</DialogTitle>
            <DialogDescription>
              This will permanently delete the generated audio recording and the saved script for this
              practice session. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isDeleting}
              onClick={() => {
                setSessionToDelete(null)
                setDeleteError(null)
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirmDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!formNotice}
        onOpenChange={(open) => {
          if (!open) setFormNotice(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {formNotice?.type === "required" ? "Job title needed" : "Add more detail for a better script"}
            </DialogTitle>
            <DialogDescription>{formNotice?.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {formNotice?.type === "required" ? (
              <Button onClick={() => setFormNotice(null)}>Got it</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setFormNotice(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setFormNotice(null)
                    runGeneration()
                  }}
                >
                  Proceed
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={questionsNoticeOpen} onOpenChange={setQuestionsNoticeOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </div>
            <DialogTitle className="mt-3">Practice more than just one?</DialogTitle>
            <DialogDescription>
              You&apos;ve picked just 1 question so far. On the free plan you can choose{" "}
              <span className="font-semibold text-primary">
                {FREE_PLAN_MAX_QUESTIONS - selectedQuestions.length} more
              </span>{" "}
              before generating your script - the more you pick, the more targeted practice you get.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuestionsNoticeOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setQuestionsNoticeOpen(false)
                runGeneration()
              }}
            >
              Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={upgradeNoticeOpen} onOpenChange={setUpgradeNoticeOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Lock className="size-5" />
            </div>
            <DialogTitle className="mt-3">Upgrade to select more questions</DialogTitle>
            <DialogDescription>
              The free plan lets you pick up to {FREE_PLAN_MAX_QUESTIONS} questions per practice
              session. Upgrade your plan to select more at once.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpgradeNoticeOpen(false)}>
              Maybe later
            </Button>
            <Button render={<Link href="/upgrade" />}>
              <Sparkles />
              Upgrade Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!invalidFileNotice} onOpenChange={(open) => { if (!open) setInvalidFileNotice(null) }}>
        <DialogContent>
          <DialogHeader>
            <div className="flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="size-5" />
            </div>
            <DialogTitle className="mt-3">Unsupported file type</DialogTitle>
            <DialogDescription>{invalidFileNotice}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setInvalidFileNotice(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generation form */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-sm md:p-8"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Create a new practice session</h2>
              <p className="text-sm text-muted-foreground">
                Upload your resume and the role details — we&apos;ll generate a tailored script and audio.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <Button
              size="lg"
              onClick={onGenerateVideo}
              disabled={!resumeFile || generating}
              className="shadow-md shadow-primary/20"
            >
              {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Generate Scripts
            </Button>
            <AnimatePresence>
              {generating && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="text-sm font-medium text-primary"
                >
                  Generating Scripts….
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <FileText className="size-4 text-primary" />
              Upload Resume
            </label>
            <FileUpload key={resumeUploadKey} onChange={onResumeFileChange} />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <label className="flex w-36 shrink-0 items-center gap-1.5 text-sm font-medium text-foreground">
              <Briefcase className="size-4 text-primary" />
              Job Title
            </label>
            <Input
              placeholder="Ex. Full Stack React Developer"
              className="flex-1"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
            <label className="flex w-36 shrink-0 items-center gap-1.5 text-sm font-medium text-foreground">
              <FileText className="size-4 text-primary" />
              Job Description
            </label>
            <Textarea
              placeholder="Enter or Paste Job Description"
              className="h-[140px] flex-1"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
          </div>

          <div className="relative space-y-4 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 shadow-sm shadow-primary/10 sm:p-5">
            <div className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-primary/15 blur-2xl" />

            <div className="relative flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative flex size-10 shrink-0 items-center justify-center">
                  <motion.span
                    className="absolute inset-0 rounded-full bg-primary/25"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <div className="relative flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/30">
                    <ListChecks className="size-5" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <label className="text-base font-bold tracking-tight text-foreground">
                      Practice Questions
                    </label>
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[0.65rem] font-semibold text-primary-foreground">
                      <Sparkles className="size-3" />
                      Recommended
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                    Pick the questions you&apos;d like this session&apos;s script to focus on.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-bold tabular-nums",
                    selectedQuestions.length >= FREE_PLAN_MAX_QUESTIONS
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary/10 text-primary"
                  )}
                >
                  {selectedQuestions.length}/{FREE_PLAN_MAX_QUESTIONS} selected
                </span>
                <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  Free plan
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {PRACTICE_QUESTIONS.map((question, index) => {
                const isSelected = selectedQuestions.includes(question)
                const isAtCap = !isSelected && selectedQuestions.length >= FREE_PLAN_MAX_QUESTIONS
                return (
                  <motion.button
                    key={question}
                    type="button"
                    onClick={() => onToggleQuestion(question)}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(index, 10) * 0.02 }}
                    className={cn(
                      "group relative flex items-start gap-2.5 rounded-xl border p-3 text-left text-sm transition-all",
                      isSelected
                        ? "border-primary bg-primary/10 text-foreground shadow-sm shadow-primary/10"
                        : isAtCap
                          ? "border-border/60 bg-muted/10 text-muted-foreground/70"
                          : "border-border bg-muted/20 text-foreground hover:border-primary/40 hover:bg-primary/5"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full border transition-colors",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-transparent"
                      )}
                    >
                      <CheckCircle2 className="size-3.5" />
                    </span>
                    <span className="flex-1 leading-snug">{question}</span>
                    {isAtCap && (
                      <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
                    )}
                  </motion.button>
                )
              })}
            </div>

            <AnimatePresence>
              {selectedQuestions.length >= FREE_PLAN_MAX_QUESTIONS && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-xs"
                >
                  <span className="text-muted-foreground">
                    You&apos;ve hit the free plan&apos;s {FREE_PLAN_MAX_QUESTIONS}-question limit.
                  </span>
                  <Button size="xs" variant="outline" render={<Link href="/upgrade" />}>
                    Upgrade
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default PracticeCoach
