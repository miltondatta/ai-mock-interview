"use client"

import React, { useContext } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { useQuery } from "convex/react"
import { AlertTriangle, ArrowRight, BarChart3, CloudOff, FileText, History, Loader2, ShieldCheck, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { api } from "@/convex/_generated/api"
import { UserDetailContext } from "@/context/UserDetailContext"
import type { ManagedResume } from "./ResumeCard"

interface DeleteResumeDialogProps {
  resume: ManagedResume | null
  deleting: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

// Related analyses listed before "+ N more".
const MAX_LISTED_ANALYSES = 3

function ConsequenceRow({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <Icon className="size-3.5" />
      </span>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </li>
  )
}

function formatCreatedAt(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

// Confirmation shown before a resume is permanently deleted from the library
// and from file storage. While saved match analyses still use the resume, the
// dialog asks the candidate to delete that history first instead.
function DeleteResumeDialog({ resume, deleting, onOpenChange, onConfirm }: DeleteResumeDialogProps) {
  const { userDetail } = useContext(UserDetailContext)
  const relatedAnalyses = useQuery(
    api.Resumes.GetResumeRelatedAnalyses,
    resume && userDetail?._id ? { userId: userDetail._id, resumeId: resume.id } : "skip"
  )
  const loading = resume !== null && relatedAnalyses === undefined
  const hasHistory = (relatedAnalyses?.length ?? 0) > 0
  // Theme-colored "action needed" look when history blocks the delete.
  const tone = hasHistory ? "primary" : "destructive"

  return (
    <Dialog open={resume !== null} onOpenChange={(open) => { if (!deleting) onOpenChange(open) }}>
      <DialogContent showCloseButton={!deleting} className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <div
          className={cn(
            "relative flex flex-col items-center overflow-hidden bg-gradient-to-b to-transparent px-6 pt-8 pb-5 text-center",
            tone === "primary" ? "from-primary/15 via-primary/5" : "from-destructive/15 via-destructive/5"
          )}
        >
          <div className={cn("pointer-events-none absolute -top-16 left-1/2 size-48 -translate-x-1/2 rounded-full blur-3xl", tone === "primary" ? "bg-primary/20" : "bg-destructive/20")} />
          <div className="relative flex size-20 items-center justify-center">
            <motion.span
              className={cn("absolute inset-0 rounded-full", tone === "primary" ? "bg-primary/20" : "bg-destructive/20")}
              animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
            />
            <motion.span
              className={cn("absolute inset-2 rounded-full", tone === "primary" ? "bg-primary/25" : "bg-destructive/25")}
              animate={{ scale: [1, 1.25], opacity: [0.7, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
            />
            <motion.span
              key={tone}
              initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 16 }}
              className={cn(
                "relative flex size-14 items-center justify-center rounded-full shadow-lg",
                tone === "primary"
                  ? "bg-primary text-primary-foreground shadow-primary/30"
                  : "bg-gradient-to-br from-destructive to-red-700 text-white shadow-destructive/30"
              )}
            >
              {hasHistory ? <History className="size-6" /> : <Trash2 className="size-6" />}
            </motion.span>
          </div>
          <DialogTitle className="mt-4 text-lg font-semibold">
            {hasHistory ? "Delete the related history first" : "Delete this resume forever?"}
          </DialogTitle>
          <DialogDescription className="mt-1.5 max-w-xs">
            {hasHistory
              ? `This resume is used by ${relatedAnalyses!.length} saved resume match ${relatedAnalyses!.length === 1 ? "analysis" : "analyses"}. Delete ${relatedAnalyses!.length === 1 ? "it" : "them"} from your Resume Match History, then come back to delete the resume.`
              : "This can't be undone. Once deleted, the file is gone for good - make sure you have a copy if you still need it."}
          </DialogDescription>

          {resume && (
            <motion.div
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className={cn(
                "mt-4 flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left shadow-xs",
                tone === "primary" ? "border-primary/20" : "border-destructive/20"
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <FileText className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{resume.fileName}</span>
                <span className="block text-xs text-muted-foreground">{resume.fileType}</span>
              </span>
            </motion.div>
          )}
        </div>

        <div className="px-6 pt-2 pb-5">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Checking resume match history…
            </p>
          ) : hasHistory ? (
            <>
              <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
                <BarChart3 className="size-3.5" /> Related resume match history
              </p>
              <ul className="mt-3 flex flex-col divide-y divide-border rounded-xl border border-border">
                {relatedAnalyses!.slice(0, MAX_LISTED_ANALYSES).map((analysis) => (
                  <li key={analysis._id} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <BarChart3 className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{analysis.jobTitle}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatCreatedAt(analysis.createdAt)}</span>
                  </li>
                ))}
                {relatedAnalyses!.length > MAX_LISTED_ANALYSES && (
                  <li className="px-3 py-2 text-xs text-muted-foreground">
                    + {relatedAnalyses!.length - MAX_LISTED_ANALYSES} more
                  </li>
                )}
              </ul>
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
                Your resume is safe - nothing has been deleted.
              </p>
            </>
          ) : (
            <>
              <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-destructive uppercase">
                <AlertTriangle className="size-3.5" /> What will be removed
              </p>
              <ul className="mt-3 flex flex-col gap-3">
                <ConsequenceRow
                  icon={CloudOff}
                  title="The resume file"
                  description="Permanently deleted from file storage and your resume library."
                />
              </ul>
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
                Your interviews and Practice Coach sessions are kept.
              </p>
            </>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0">
          <DialogClose render={<Button variant="outline" />} disabled={deleting}>
            {hasHistory ? "Cancel" : "Keep Resume"}
          </DialogClose>
          {hasHistory ? (
            <Button nativeButton={false} render={<Link href="/dashboard#resume-match-history" />}>
              Go to Resume Match History <ArrowRight />
            </Button>
          ) : (
            <Button
              variant="destructive"
              className="bg-destructive text-white shadow-sm shadow-destructive/30 hover:bg-destructive/90"
              onClick={onConfirm}
              disabled={deleting || loading}
            >
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {deleting ? "Deleting…" : "Yes, Delete Permanently"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DeleteResumeDialog
