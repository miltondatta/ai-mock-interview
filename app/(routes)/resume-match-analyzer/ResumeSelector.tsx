"use client"

import React, { useRef } from "react"
import { EllipsisVertical, FileText, Loader2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Panel } from "./shared"
import { RESUME_UPLOAD_LIMITS } from "./constants"

export interface ResumeOption {
  id: string
  fileName: string
  fileType: string
  fileSize?: number
  uploadedAt: number
}

interface ResumeSelectorProps {
  // undefined while the list is loading.
  resumes: ResumeOption[] | undefined
  selectedId: string | null
  onSelect: (id: string) => void
  onUpload: (file: File) => void
  isUploading: boolean
  disabled: boolean
  onMenuClick: () => void
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatUploadDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function ResumeSelector({ resumes, selectedId, onSelect, onUpload, isUploading, disabled, onMenuClick }: ResumeSelectorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Clear so picking the same file again still fires onChange.
    e.target.value = ""
    if (file) onUpload(file)
  }

  return (
    <Panel className="flex flex-col">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          1
        </span>
        1. Select Your Resume
      </h2>

      {resumes === undefined ? (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading your resumes…
        </div>
      ) : resumes.length > 0 ? (
        <div role="radiogroup" aria-label="Previously uploaded resumes" className="mt-4 flex max-h-72 flex-col gap-2 overflow-y-auto">
          {resumes.map((resume) => {
            const isSelected = resume.id === selectedId
            return (
              <div
                key={resume.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                  isSelected ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20" : "border-border hover:bg-muted/60"
                )}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="radio"
                    name="selected-resume"
                    value={resume.id}
                    checked={isSelected}
                    disabled={disabled}
                    onChange={() => onSelect(resume.id)}
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
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`More actions for ${resume.fileName}`}
                  onClick={onMenuClick}
                >
                  <EllipsisVertical />
                </Button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <FileText className="size-6 text-muted-foreground" />
          <p className="mt-1 text-sm font-medium">No resumes uploaded yet</p>
          <p className="text-xs text-muted-foreground">Upload a resume to compare it against a job description.</p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Supported formats: {RESUME_UPLOAD_LIMITS.formats} (Max {RESUME_UPLOAD_LIMITS.maxSize})
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button variant="outline" disabled={isUploading || disabled} onClick={() => fileInputRef.current?.click()}>
          {isUploading ? <Loader2 className="animate-spin" /> : <Upload />}
          {isUploading ? "Uploading…" : "Upload New Resume"}
        </Button>
      </div>
    </Panel>
  )
}

export default ResumeSelector
