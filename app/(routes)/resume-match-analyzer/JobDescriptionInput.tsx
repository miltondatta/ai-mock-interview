"use client"

import React from "react"
import { Briefcase, Link2, Loader2, Sparkles, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Panel } from "./shared"
import { JOB_DESCRIPTION_MAX_LENGTH, JOB_TITLE_MAX_LENGTH } from "./constants"

export type JobInputMode = "text" | "url"

interface JobDescriptionInputProps {
  mode: JobInputMode
  onModeChange: (mode: JobInputMode) => void
  jobTitle: string
  onJobTitleChange: (value: string) => void
  description: string
  onDescriptionChange: (value: string) => void
  url: string
  onUrlChange: (value: string) => void
  onAnalyze: () => void
  isAnalyzing: boolean
}

function JobDescriptionInput({
  mode,
  onModeChange,
  jobTitle,
  onJobTitleChange,
  description,
  onDescriptionChange,
  url,
  onUrlChange,
  onAnalyze,
  isAnalyzing,
}: JobDescriptionInputProps) {
  return (
    <Panel className="flex flex-col">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Briefcase className="size-3.5" />
        </span>
        2. Add Job Description
      </h2>

      <label htmlFor="job-title" className="sr-only">
        Job title
      </label>
      <Input
        id="job-title"
        value={jobTitle}
        maxLength={JOB_TITLE_MAX_LENGTH}
        disabled={isAnalyzing}
        onChange={(e) => onJobTitleChange(e.target.value)}
        placeholder="Job title, e.g. Senior Technical Project Manager"
        className="mt-4 h-9"
      />

      {mode === "text" ? (
        <div className="mt-2 flex flex-1 flex-col">
          <label htmlFor="job-description" className="sr-only">
            Job description
          </label>
          <Textarea
            id="job-description"
            value={description}
            maxLength={JOB_DESCRIPTION_MAX_LENGTH}
            disabled={isAnalyzing}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Paste the full job description here..."
            className="field-sizing-fixed h-40 resize-y"
          />
          <p className="mt-1.5 text-right text-xs text-muted-foreground" aria-live="polite">
            {description.length.toLocaleString()} / {JOB_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters
          </p>
        </div>
      ) : (
        <div className="mt-2 flex flex-1 flex-col gap-1.5">
          <label htmlFor="job-url" className="text-sm font-medium">
            Job posting URL
          </label>
          <Input
            id="job-url"
            type="url"
            value={url}
            disabled={isAnalyzing}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://example.com/jobs/senior-technical-project-manager"
            className="h-9"
          />
          <p className="text-xs text-muted-foreground">
            The job posting is read during analysis. If the page can&apos;t be read, paste the description instead.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="link"
          className="h-auto justify-start px-0"
          disabled={isAnalyzing}
          onClick={() => onModeChange(mode === "text" ? "url" : "text")}
        >
          {mode === "text" ? (
            <>
              <Link2 />
              Or paste a job posting URL
            </>
          ) : (
            <>
              <FileText />
              Or paste the job description text
            </>
          )}
        </Button>
        <Button size="lg" className="px-4" disabled={isAnalyzing} onClick={onAnalyze}>
          {isAnalyzing ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {isAnalyzing ? "Analyzing…" : "Analyze Match"}
        </Button>
      </div>
    </Panel>
  )
}

export default JobDescriptionInput
