"use client"

import React, { useEffect, useState } from "react"
import { FileText, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

// A resume from the candidate's library (GET /api/resumes - resolved from the
// signed-in session, so only their own resumes are listed).
export interface SavedResume {
  id: string
  fileName: string
  fileType: string
  fileSize?: number
  uploadedAt: number
}

interface SavedResumePickerProps {
  selectedId: string | null
  onSelect: (resume: SavedResume | null) => void
  disabled?: boolean
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatUploadDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

// Lets the candidate reuse a resume they've already uploaded instead of
// uploading it again. Renders nothing when they have no saved resumes.
function SavedResumePicker({ selectedId, onSelect, disabled }: SavedResumePickerProps) {
  const [resumes, setResumes] = useState<SavedResume[] | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    fetch("/api/resumes", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setResumes(Array.isArray(data?.resumes) ? data.resumes : [])
      })
      .catch(() => {
        if (!cancelled) setResumes([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (resumes === undefined) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading your saved resumes…
      </p>
    )
  }
  if (resumes.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Choose one of your saved resumes, or upload a new one below.</p>
        {selectedId && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect(null)}
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            Clear selection
          </button>
        )}
      </div>
      <div role="radiogroup" aria-label="Your saved resumes" className="flex max-h-48 flex-col gap-2 overflow-y-auto">
        {resumes.map((resume) => {
          const isSelected = resume.id === selectedId
          return (
            <label
              key={resume.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                isSelected ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20" : "border-border hover:bg-muted/60"
              )}
            >
              <input
                type="radio"
                name="saved-resume"
                value={resume.id}
                checked={isSelected}
                disabled={disabled}
                onChange={() => onSelect(resume)}
                className="size-4 shrink-0 accent-[var(--primary)]"
              />
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <FileText className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{resume.fileName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[resume.fileType, resume.fileSize ? formatFileSize(resume.fileSize) : null, formatUploadDate(resume.uploadedAt)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

export default SavedResumePicker
