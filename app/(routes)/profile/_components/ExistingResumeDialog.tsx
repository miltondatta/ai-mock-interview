"use client"

import React, { useEffect, useState } from "react"
import { FileText, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { SavedResume } from "@/app/(routes)/_components/SavedResumePicker"

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

// Picks a resume from the user's existing library (GET /api/resumes, scoped
// to the signed-in user on the server) to fill the profile from.
export function ExistingResumeDialog({
  open,
  onOpenChange,
  onChoose,
  linkedResumeId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChoose: (resume: SavedResume) => void
  linkedResumeId: string | null
}) {
  const [resumes, setResumes] = useState<SavedResume[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setResumes(null)
    setLoadError(false)
    setSelected(linkedResumeId)
    fetch("/api/resumes", { cache: "no-store" })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(data => {
        if (!cancelled) setResumes(Array.isArray(data?.resumes) ? data.resumes : [])
      })
      .catch(() => {
        if (!cancelled) {
          setResumes([])
          setLoadError(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, linkedResumeId])

  const chosen = resumes?.find(r => r.id === selected) ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <div className="p-5 pb-3">
          <DialogTitle className="text-base font-semibold">Use an existing resume</DialogTitle>
          <DialogDescription className="mt-1">
            We&apos;ll read it and fill in any empty fields. Nothing you&apos;ve entered is replaced without asking.
          </DialogDescription>
        </div>

        <div className="max-h-80 overflow-y-auto px-5 pb-4">
          {resumes === null ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Loading your resumes…
            </p>
          ) : resumes.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              {loadError
                ? "We couldn't load your resumes. Please close this and try again."
                : "You haven't uploaded any resumes yet. Use \"Upload resume to fill\" instead."}
            </p>
          ) : (
            <ul role="radiogroup" aria-label="Your resumes" className="flex flex-col gap-2">
              {resumes.map(r => {
                const isSelected = r.id === selected
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelected(r.id)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      )}
                    >
                      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                        <FileText className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{r.fileName}</span>
                        <span className="block text-xs text-muted-foreground">
                          Uploaded {formatDate(r.uploadedAt)}
                          {r.id === linkedResumeId ? " · Linked to your profile" : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0">
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button disabled={!chosen} onClick={() => chosen && onChoose(chosen)}>
            Fill from this resume
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
