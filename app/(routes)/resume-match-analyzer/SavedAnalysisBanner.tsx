"use client"

import React from "react"
import { Download, ExternalLink, FileText, History, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatAnalysisDate } from "./shared"

interface SavedAnalysisBannerProps {
  createdAt: number
  resumeId: string
  resumeFileName?: string
  // False when the resume has since been removed from the candidate's library.
  resumeAvailable: boolean
  jobDescriptionUrl?: string
}

// Shown while a saved analysis opened from the dashboard history is on screen.
// The form above is filled with the resume and job description it used.
function SavedAnalysisBanner({ createdAt, resumeId, resumeFileName, resumeAvailable, jobDescriptionUrl }: SavedAnalysisBannerProps) {
  const fileUrl = `/api/resumes/${encodeURIComponent(resumeId)}/file`
  return (
    <div className="mt-5 flex flex-col gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <History className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">Viewing saved analysis from {formatAnalysisDate(createdAt)}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1">
              <FileText className="size-3.5 shrink-0 text-primary" />
              Resume: <span className="truncate font-medium text-foreground">{resumeFileName || "Resume"}</span>
              {!resumeAvailable && <span>(no longer in your resumes)</span>}
            </span>
            {jobDescriptionUrl && (
              <a
                href={jobDescriptionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-1 hover:text-foreground"
              >
                <Link2 className="size-3.5 shrink-0 text-primary" />
                <span className="truncate underline underline-offset-2">Job posting</span>
              </a>
            )}
          </p>
        </div>
      </div>
      {resumeAvailable && (
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<a href={fileUrl} target="_blank" rel="noopener noreferrer" />}>
            <ExternalLink /> View Resume
          </Button>
          <Button variant="ghost" size="sm" nativeButton={false} render={<a href={`${fileUrl}?download=1`} download={resumeFileName || "Resume.pdf"} />}>
            <Download /> Download
          </Button>
        </div>
      )}
    </div>
  )
}

export default SavedAnalysisBanner
