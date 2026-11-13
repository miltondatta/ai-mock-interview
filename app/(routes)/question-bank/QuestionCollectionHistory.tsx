"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useMutation } from "convex/react"
import { ArrowRight, BookOpen, CalendarClock, Share2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { QuestionBankCollectionSummary } from "./types"
import DeleteCollectionDialog, { type CollectionToDelete } from "./DeleteCollectionDialog"
import ShareCollectionDialog from "./ShareCollectionDialog"

function formatCreatedAt(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

const HISTORY_ROW_GRID = "md:grid md:grid-cols-[minmax(0,1fr)_8rem_12rem_13.5rem] md:items-center md:gap-5"

interface HistoryRowProps {
  item: QuestionBankCollectionSummary
  onDelete: (item: QuestionBankCollectionSummary) => void
  onShare: (item: QuestionBankCollectionSummary) => void
}

function HistoryRow({ item, onDelete, onShare }: HistoryRowProps) {
  const href = `/question-bank?collectionId=${item._id}`
  const subject = item.generationMode === "job" ? item.jobTitle || item.title : item.topics.join(", ")
  return (
    <div className={cn("group flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-muted/50", HISTORY_ROW_GRID)}>
      <Link href={href} className="flex min-w-0 items-center gap-3 focus-visible:outline-none">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BookOpen className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold group-hover:text-primary" title={subject}>{subject}</p>
          <p className="mt-0.5 text-xs text-muted-foreground capitalize">{item.generationMode} mode</p>
        </div>
      </Link>

      <p className="text-xs text-muted-foreground md:text-sm md:text-foreground">
        {item.totalQuestions} questions
      </p>

      <p className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground md:text-sm md:text-foreground">
        <CalendarClock className="size-3.5 shrink-0 text-primary md:hidden" />
        {formatCreatedAt(item.createdAt)}
      </p>

      <div className="flex flex-nowrap items-center gap-2 md:justify-end">
        <Button size="sm" nativeButton={false} render={<Link href={href} />}>
          View <ArrowRight />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:bg-success/10 hover:text-success"
          aria-label={`Share ${subject}`}
          onClick={() => onShare(item)}
        >
          <Share2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:bg-primary/10 hover:text-primary"
          aria-label={`Delete ${subject}`}
          onClick={() => onDelete(item)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function QuestionCollectionHistory({ userId, items }: { userId: Id<"UserTable">; items: QuestionBankCollectionSummary[] }) {
  const deleteCollection = useMutation(api.QuestionBank.DeleteCollection)
  const [pendingDelete, setPendingDelete] = useState<CollectionToDelete | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [sharingItem, setSharingItem] = useState<QuestionBankCollectionSummary | null>(null)

  const onConfirmDelete = async () => {
    if (!pendingDelete || deleting) return
    setDeleting(true)
    try {
      await deleteCollection({ userId, collectionId: pendingDelete._id as Id<"questionBankCollections"> })
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="mt-14">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Question Bank History</h2>
        <p className="mt-1 text-sm text-muted-foreground">Saved question collections. Open one to revisit its questions and answers.</p>
      </div>

      {items.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className={cn("hidden border-b border-border bg-muted/50 px-5 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase", HISTORY_ROW_GRID)}>
            <span>Subject</span>
            <span>Questions</span>
            <span>Generated</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-border">
            {items.map((item) => (
              <HistoryRow key={item._id} item={item} onDelete={setPendingDelete} onShare={setSharingItem} />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/40 px-10 py-12 text-center">
          <BookOpen className="size-8 text-muted-foreground" />
          <h3 className="text-base font-semibold">No saved collections yet</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Generate a question collection above to see it here.
          </p>
        </div>
      )}

      <DeleteCollectionDialog
        collection={pendingDelete}
        deleting={deleting}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        onConfirm={onConfirmDelete}
      />

      {sharingItem && (
        <ShareCollectionDialog
          open={!!sharingItem}
          onOpenChange={(open) => { if (!open) setSharingItem(null) }}
          userId={userId}
          collectionId={sharingItem._id as Id<"questionBankCollections">}
          title={sharingItem.generationMode === "job" ? sharingItem.jobTitle || sharingItem.title : sharingItem.topics.join(", ")}
          isShared={sharingItem.isShared}
          shareToken={sharingItem.shareToken}
        />
      )}
    </section>
  )
}

export default QuestionCollectionHistory
