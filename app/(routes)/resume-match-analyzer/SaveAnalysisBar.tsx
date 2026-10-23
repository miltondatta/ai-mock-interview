"use client"

import React from "react"
import Link from "next/link"
import { ArrowRight, BookmarkPlus, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type SaveState = "unsaved" | "saving" | "saved"

interface SaveAnalysisBarProps {
  state: SaveState
  savedAnalysisId: string | null
  onSave: () => void
}

// Shown under a fresh result. Analyses are only stored when the candidate
// clicks Save Analysis - otherwise the result is gone once they leave.
function SaveAnalysisBar({ state, savedAnalysisId, onSave }: SaveAnalysisBarProps) {
  const saved = state === "saved"
  return (
    <div
      className={cn(
        "mt-5 flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        saved ? "border-success/30 bg-success/10" : "border-primary/25 bg-primary/5"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            saved ? "bg-success/15 text-success" : "bg-primary/10 text-primary"
          )}
        >
          {saved ? <CheckCircle2 className="size-4" /> : <BookmarkPlus className="size-4" />}
        </span>
        <div>
          <p className="text-sm font-medium">{saved ? "Analysis saved" : "Save this analysis?"}</p>
          <p className="text-xs text-muted-foreground">
            {saved
              ? "You can reopen it any time from Resume Match History on your dashboard."
              : "This result isn't saved yet. Save it to keep it in your dashboard history."}
          </p>
        </div>
      </div>
      {saved ? (
        <Button
          variant="outline"
          className="w-fit"
          nativeButton={false}
          render={<Link href={savedAnalysisId ? `/resume-match-analyzer?analysisId=${savedAnalysisId}` : "/dashboard"} />}
        >
          View in history <ArrowRight />
        </Button>
      ) : (
        <Button className="w-fit px-4" disabled={state === "saving"} onClick={onSave}>
          {state === "saving" ? <Loader2 className="animate-spin" /> : <BookmarkPlus />}
          {state === "saving" ? "Saving…" : "Save Analysis"}
        </Button>
      )}
    </div>
  )
}

export default SaveAnalysisBar
