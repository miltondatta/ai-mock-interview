"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { CheckCircle2, CircleAlert, FileSearch, FileText, Loader2, Search, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RESUME_UPLOAD_LIMITS } from "../resume-match-analyzer/constants"
import ResumeCard, { RESUME_ROW_GRID, type ManagedResume } from "./ResumeCard"
import DeleteResumeDialog from "./DeleteResumeDialog"

interface Notice {
  tone: "success" | "error"
  message: string
}

function ManageResumePage() {
  // Loaded through /api/resumes, which identifies the candidate from their
  // Clerk session - undefined while loading.
  const [resumes, setResumes] = useState<ManagedResume[] | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [pendingDelete, setPendingDelete] = useState<ManagedResume | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  const loadResumes = useCallback(async () => {
    try {
      const res = await fetch("/api/resumes", { cache: "no-store" })
      const data = await res.json().catch(() => null)
      if (!res.ok || !Array.isArray(data?.resumes)) {
        setResumes([])
        setLoadError(data?.error ?? "Unable to load your resumes. Please refresh the page.")
        return
      }
      setLoadError(null)
      setResumes(data.resumes)
    } catch {
      setResumes([])
      setLoadError("Unable to load your resumes. Please check your connection and refresh the page.")
    }
  }, [])

  useEffect(() => {
    loadResumes()
  }, [loadResumes])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!resumes || !term) return resumes
    return resumes.filter((r) => r.fileName.toLowerCase().includes(term))
  }, [resumes, search])

  // Adds the file to the shared resume library, so it's immediately available
  // in Create Interview, Practice Coach and the Resume Match Analyzer.
  const uploadResume = async (file: File) => {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    if (!isPdf) {
      setNotice({ tone: "error", message: "Only PDF files are supported for your resume. Please upload a .pdf file." })
      return
    }
    if (file.size > RESUME_UPLOAD_LIMITS.maxBytes) {
      setNotice({ tone: "error", message: `Your resume must be ${RESUME_UPLOAD_LIMITS.maxSize} or smaller.` })
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/resume-match/upload-resume", { method: "POST", body: formData })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.resumeId) {
        setNotice({ tone: "error", message: data?.error ?? "Unable to upload your resume. Please try again." })
        return
      }
      const alreadyAdded = resumes?.some((r) => r.id === data.resumeId) ?? false
      setSearch("")
      await loadResumes()
      setNotice({
        tone: "success",
        message: alreadyAdded
          ? `${data.fileName ?? file.name} is already in your resumes.`
          : `${file.name} uploaded. It's now available in Create Interview, Practice Coach and the Resume Match Analyzer.`,
      })
    } catch {
      setNotice({ tone: "error", message: "Unable to upload your resume. Please check your connection and try again." })
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Clear so picking the same file again still fires onChange.
    e.target.value = ""
    if (file) uploadResume(file)
  }

  const uploadButton = (size: "default" | "lg") => (
    <Button size={size} disabled={isUploading} onClick={() => fileInputRef.current?.click()}>
      {isUploading ? <Loader2 className="animate-spin" /> : <Upload />}
      {isUploading ? "Uploading…" : "Upload Resume"}
    </Button>
  )

  const deleteResume = async () => {
    if (!pendingDelete || deleting) return
    const target = pendingDelete
    setDeleting(true)
    try {
      const res = await fetch(`/api/resumes/${encodeURIComponent(target.id)}`, { method: "DELETE" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setNotice({ tone: "error", message: data?.error ?? "Unable to delete your resume. Please try again." })
        if (res.status === 404) {
          setPendingDelete(null)
          await loadResumes()
        }
        return
      }
      setResumes((current) => current?.filter((r) => r.id !== target.id))
      setPendingDelete(null)
      setNotice({ tone: "success", message: `${target.fileName} was deleted.` })
    } catch {
      setNotice({ tone: "error", message: "Unable to delete your resume. Please check your connection and try again." })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Manage Resume</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload, view, download or delete your resumes.
            {resumes && resumes.length > 0 && (
              <span className="ml-1 font-medium text-foreground">
                {resumes.length} {resumes.length === 1 ? "resume" : "resumes"}
              </span>
            )}
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          {resumes && resumes.length > 0 && (
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <label htmlFor="resume-search" className="sr-only">Search resumes</label>
              <Input
                id="resume-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by file name"
                className="h-9 pl-9"
              />
            </div>
          )}
          {uploadButton("default")}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleFileChange}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        Supported formats: {RESUME_UPLOAD_LIMITS.formats} (Max {RESUME_UPLOAD_LIMITS.maxSize})
      </p>

      {loadError && (
        <div role="alert" className="mt-6 flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <p className="flex-1">{loadError}</p>
        </div>
      )}

      {filtered === undefined ? (
        <div className="mt-10 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading your resumes…
        </div>
      ) : filtered.length > 0 ? (
        <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className={`hidden border-b border-border bg-muted/50 px-5 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase ${RESUME_ROW_GRID}`}>
            <span>File Name</span>
            <span>Uploaded</span>
            <span>Size</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-border">
            {filtered.map((resume) => (
              <ResumeCard key={resume.id} resume={resume} onDelete={setPendingDelete} />
            ))}
          </div>
        </div>
      ) : resumes && resumes.length > 0 ? (
        <div className="mt-10 flex flex-col items-center gap-1 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <Search className="size-6 text-muted-foreground" />
          <p className="mt-1 text-sm font-medium">No resumes match &ldquo;{search.trim()}&rdquo;</p>
          <p className="text-xs text-muted-foreground">Try a different file name.</p>
        </div>
      ) : !loadError ? (
        <div className="mt-10 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-muted/40 px-10 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FileText className="size-7" />
          </span>
          <div className="flex flex-col items-center gap-1.5">
            <h2 className="text-lg font-semibold">No resumes yet</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Upload a resume here, or in Create Interview, Practice Coach or the Resume Match Analyzer, and it will show up here.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            {uploadButton("lg")}
            <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/resume-match-analyzer" />}>
              <FileSearch /> Resume Match Analyzer
            </Button>
          </div>
        </div>
      ) : null}

      <DeleteResumeDialog
        resume={pendingDelete}
        deleting={deleting}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        onConfirm={deleteResume}
      />

      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex justify-center sm:inset-x-auto sm:right-6 sm:bottom-6">
        {notice && (
          <div
            role="status"
            className="pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg"
          >
            {notice.tone === "success"
              ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              : <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />}
            <p className="flex-1">{notice.message}</p>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss notice"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ManageResumePage
