"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { FileUpload } from "@/components/ui/file-upload"
import {
  Briefcase,
  FileText,
  PlayCircle,
  Play,
  Pause,
  RotateCcw,
  UploadCloud,
  Sparkles,
  Video,
} from "lucide-react"

function PracticeCoach() {
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [jobTitle, setJobTitle] = useState("")
  const [jobDescription, setJobDescription] = useState("")
  const [generating, setGenerating] = useState(false)

  const onGenerateVideo = async () => {
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
      }
    } catch (e) {
      console.error("Failed to generate practice video:", e)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="relative mx-auto max-w-6xl overflow-hidden px-6 py-10 md:px-10 md:py-14">
      <div className="pointer-events-none absolute -top-16 left-1/2 -z-10 size-80 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Practice Coach
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
          Let AI transform your resume into personalized interview practice — so you know what to say and how to say it
        </p>
      </motion.div>

      {/* List area for created audio/video */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="mt-8 flex min-h-[140px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 p-6 md:p-8"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <PlayCircle className="size-5" />
          </div>
          <p className="text-sm text-muted-foreground">
            Your generated audio and video will appear here
          </p>
        </div>
      </motion.div>

      {/* Generation form */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="mt-8 rounded-2xl border border-border bg-muted/20 p-6 md:p-8"
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1 space-y-6">
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <UploadCloud className="size-4 text-primary" />
                Upload Resume
              </label>
              <FileUpload onChange={(files) => setResumeFile(files[0] ?? null)} />
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

          <div className="flex shrink-0 flex-col items-end gap-2">
            <Button
              size="lg"
              onClick={onGenerateVideo}
              disabled={!resumeFile || generating}
            >
              <Sparkles />
              Generate Video
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
                  Generating Practice Video....
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Video player area */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className="mt-8 flex flex-col items-center gap-5"
      >
        <div className="relative flex h-[360px] w-full items-center justify-center overflow-hidden rounded-3xl border border-border bg-muted/20">
          <div className="pointer-events-none absolute size-56 rounded-full bg-primary/15 blur-3xl" />
          <Video className="relative size-12 text-muted-foreground/40" />
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card p-1.5 shadow-sm">
          <Button size="lg" className="rounded-full">
            <Play />
            Play
          </Button>
          <Button size="lg" variant="secondary" className="rounded-full">
            <Pause />
            Pause
          </Button>
          <Button size="lg" variant="outline" className="rounded-full">
            <RotateCcw />
            Resume
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

export default PracticeCoach
