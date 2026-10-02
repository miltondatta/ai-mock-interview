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
  Briefcase,
  FileText,
  Headphones,
  Play,
  Pause,
  RotateCcw,
  Clock,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react"
import { Id } from "@/convex/_generated/dataModel"

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
  const [generating, setGenerating] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [autoplayRequested, setAutoplayRequested] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
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
        setResumeUploadKey((key) => key + 1)
      }
    } catch (e) {
      console.error("Failed to generate practice video:", e)
    } finally {
      setGenerating(false)
    }
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
      setAudioUrl(generation.audioUrl)
      setAutoplayRequested(true)
      return
    }

    setGeneratingAudioId(generation._id)
    setAudioError(null)
    try {
      const res = await fetch("/api/practice-coach/generate-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practiceCoachId: generation._id }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setAudioError(data?.error ?? "Unable to generate audio. Please try again.")
        return
      }
      setAudioUrl(data?.audioUrl ?? null)
      setAutoplayRequested(true)
    } catch (e) {
      console.error("Failed to generate audio for this practice script:", e)
      setAudioError("Unable to generate audio. Please try again.")
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
                        aria-label="Delete session"
                        className="shrink-0 text-muted-foreground"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>

                  {isRowLoaded && audioError && <p className="text-sm text-destructive">{audioError}</p>}

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
          onEnded={() => setIsPlaying(false)}
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
            <FileUpload key={resumeUploadKey} onChange={(files) => setResumeFile(files[0] ?? null)} />
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
        </div>
      </motion.div>
    </div>
  )
}

export default PracticeCoach
