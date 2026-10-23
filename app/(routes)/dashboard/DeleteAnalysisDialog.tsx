"use client"

import React from "react"
import { motion } from "motion/react"
import { AlertTriangle, BarChart3, FileText, Loader2, ShieldCheck, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog"

export interface AnalysisToDelete {
  _id: string
  jobTitle: string
  resumeFileName?: string
  createdAt: number
}

interface DeleteAnalysisDialogProps {
  analysis: AnalysisToDelete | null
  deleting: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

function formatCreatedAt(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

// Confirmation shown before a saved Resume Match analysis is removed from the
// candidate's history.
function DeleteAnalysisDialog({ analysis, deleting, error, onOpenChange, onConfirm }: DeleteAnalysisDialogProps) {
  return (
    <Dialog open={analysis !== null} onOpenChange={(open) => { if (!deleting) onOpenChange(open) }}>
      <DialogContent showCloseButton={!deleting} className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="relative flex flex-col items-center overflow-hidden bg-gradient-to-b from-primary/15 via-primary/5 to-transparent px-6 pt-8 pb-5 text-center">
          <div className="pointer-events-none absolute -top-16 left-1/2 size-48 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex size-20 items-center justify-center">
            <motion.span
              className="absolute inset-0 rounded-full bg-primary/20"
              animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
            />
            <motion.span
              className="absolute inset-2 rounded-full bg-primary/25"
              animate={{ scale: [1, 1.25], opacity: [0.7, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
            />
            <motion.span
              initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 16 }}
              className="relative flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30"
            >
              <BarChart3 className="size-6" />
            </motion.span>
          </div>
          <DialogTitle className="mt-4 text-lg font-semibold">Remove this analysis from your history?</DialogTitle>
          <DialogDescription className="mt-1.5 max-w-xs">
            The saved match results will be permanently deleted. This can&apos;t be undone.
          </DialogDescription>

          {analysis && (
            <motion.div
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="mt-4 flex w-full items-center gap-3 rounded-xl border border-primary/20 bg-card px-3 py-2.5 text-left shadow-xs"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BarChart3 className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{analysis.jobTitle}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  Analyzed {formatCreatedAt(analysis.createdAt)}
                </span>
              </span>
            </motion.div>
          )}
        </div>

        <div className="px-6 pt-2 pb-5">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
            <AlertTriangle className="size-3.5" /> What happens next
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Trash2 className="size-3.5" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">Analysis results removed</p>
                <p className="text-xs text-muted-foreground">Score, skill comparison, assessment and recommendations are deleted.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                <FileText className="size-3.5" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">Your resume stays</p>
                <p className="text-xs text-muted-foreground">
                  {analysis?.resumeFileName ? `${analysis.resumeFileName} remains` : "The resume remains"} in Manage Resume.
                </p>
              </div>
            </li>
          </ul>
          {error ? (
            <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
          ) : (
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
              Your interviews and other saved analyses are not affected.
            </p>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0">
          <DialogClose render={<Button variant="outline" />} disabled={deleting}>
            Cancel
          </DialogClose>
          <Button onClick={onConfirm} disabled={deleting}>
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {deleting ? "Deleting…" : "Proceed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DeleteAnalysisDialog
