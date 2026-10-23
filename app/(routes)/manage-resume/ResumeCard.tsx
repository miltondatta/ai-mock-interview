"use client"

import React from "react"
import { CalendarClock, Download, Eye, FileText, HardDrive, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface ManagedResume {
  id: string
  fileName: string
  fileType: string
  fileSize?: number
  uploadedAt: number
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatUploadDate(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

// Served by app/api/resumes/[resumeId]/file, so the stored file URL never
// reaches the browser.
export function resumeFileUrl(id: string, download = false) {
  return `/api/resumes/${encodeURIComponent(id)}/file${download ? "?download=1" : ""}`
}

// Column layout shared by the list header and each row (md and up). Every
// column has a fixed width so the header lines up with the row values.
export const RESUME_ROW_GRID = "md:grid md:grid-cols-[minmax(0,1fr)_12rem_6rem_14rem] md:items-center md:gap-6"

// One full-width row in the Manage Resume list.
function ResumeCard({ resume, onDelete }: { resume: ManagedResume; onDelete: (resume: ManagedResume) => void }) {
  return (
    <div className={`flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-muted/50 ${RESUME_ROW_GRID}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <FileText className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" title={resume.fileName}>{resume.fileName}</p>
          <p className="text-xs font-medium text-muted-foreground">{resume.fileType}</p>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground md:text-sm md:text-foreground">
        <CalendarClock className="size-3.5 shrink-0 text-primary md:hidden" />
        {formatUploadDate(resume.uploadedAt)}
      </p>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground md:text-sm md:text-foreground">
        <HardDrive className="size-3.5 shrink-0 text-primary md:hidden" />
        {resume.fileSize ? formatFileSize(resume.fileSize) : "—"}
      </p>

      <div className="flex items-center gap-2 md:justify-end">
        <Button
          size="sm"
          nativeButton={false}
          render={<a href={resumeFileUrl(resume.id)} target="_blank" rel="noopener noreferrer" />}
        >
          <Eye /> View
        </Button>
        {/* `download` keeps this a file download instead of a page navigation,
            so the browser doesn't show a "Leave site?" prompt. */}
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<a href={resumeFileUrl(resume.id, true)} download={resume.fileName} />}
        >
          <Download /> Download
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Delete ${resume.fileName}`}
          onClick={() => onDelete(resume)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}

export default ResumeCard
