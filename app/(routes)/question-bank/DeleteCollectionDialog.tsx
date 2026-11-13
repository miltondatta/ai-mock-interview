"use client"

import React from "react"
import { motion } from "motion/react"
import { AlertTriangle, BookOpen, Loader2, MessageSquareText, ShieldCheck, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import type { GenerationMode } from "./types"

export interface CollectionToDelete {
  _id: string
  title: string
  generationMode: GenerationMode
  topics: string[]
  jobTitle?: string
  totalQuestions: number
  createdAt: number
}

interface DeleteCollectionDialogProps {
  collection: CollectionToDelete | null
  deleting: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

function formatCreatedAt(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

// Confirmation shown before a saved question collection - and all its
// generated questions and cached answers - is permanently deleted.
function DeleteCollectionDialog({ collection, deleting, onOpenChange, onConfirm }: DeleteCollectionDialogProps) {
  const subject = collection
    ? collection.generationMode === "job"
      ? collection.jobTitle || collection.title
      : collection.topics.join(", ") || collection.title
    : ""

  return (
    <Dialog open={collection !== null} onOpenChange={(open) => { if (!deleting) onOpenChange(open) }}>
      <DialogContent showCloseButton={!deleting} className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="relative flex flex-col items-center overflow-hidden bg-gradient-to-b from-destructive/15 via-destructive/5 to-transparent px-6 pt-8 pb-5 text-center">
          <div className="pointer-events-none absolute -top-16 left-1/2 size-48 -translate-x-1/2 rounded-full bg-destructive/20 blur-3xl" />
          <div className="relative flex size-20 items-center justify-center">
            <motion.span
              className="absolute inset-0 rounded-full bg-destructive/20"
              animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
            />
            <motion.span
              className="absolute inset-2 rounded-full bg-destructive/25"
              animate={{ scale: [1, 1.25], opacity: [0.7, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
            />
            <motion.span
              initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 16 }}
              className="relative flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-destructive to-red-700 text-white shadow-lg shadow-destructive/30"
            >
              <Trash2 className="size-6" />
            </motion.span>
          </div>
          <DialogTitle className="mt-4 text-lg font-semibold">Delete this question collection?</DialogTitle>
          <DialogDescription className="mt-1.5 max-w-xs">
            This can&apos;t be undone. Once deleted, its questions and AI-generated answers are gone for good.
          </DialogDescription>

          {collection && (
            <motion.div
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="mt-4 flex w-full items-center gap-3 rounded-xl border border-destructive/20 bg-card px-3 py-2.5 text-left shadow-xs"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BookOpen className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium" title={subject}>{subject}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {collection.totalQuestions} questions &middot; {formatCreatedAt(collection.createdAt)}
                </span>
              </span>
            </motion.div>
          )}
        </div>

        <div className="px-6 pt-2 pb-5">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-destructive uppercase">
            <AlertTriangle className="size-3.5" /> What will be removed
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <BookOpen className="size-3.5" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">The question collection</p>
                <p className="text-xs text-muted-foreground">Every generated question in this set is permanently deleted.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <MessageSquareText className="size-3.5" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">Its AI-generated answers</p>
                <p className="text-xs text-muted-foreground">Cached detailed answers for these questions are deleted too.</p>
              </div>
            </li>
          </ul>
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
            Your other saved collections are not affected.
          </p>
        </div>

        <DialogFooter className="mx-0 mb-0">
          <DialogClose disabled={deleting} render={(props) => <Button {...props} variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            className="bg-destructive text-white shadow-sm shadow-destructive/30 hover:bg-destructive/90"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {deleting ? "Deleting…" : "Yes, Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DeleteCollectionDialog
