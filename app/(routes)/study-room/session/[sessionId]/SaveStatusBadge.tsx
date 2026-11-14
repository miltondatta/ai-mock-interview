"use client"

import { Check, Loader2, CloudOff } from "lucide-react"

export type SaveStatus = "idle" | "saving" | "saved" | "error"

interface SaveStatusBadgeProps {
  status: SaveStatus
  onRetry?: () => void
}

// Shared "Saving... / Saved / Save failed" indicator for the Whiteboard,
// Code Editor and Notes panels (M4 - "show clear saving, saved, and
// save-error indicators"). Renders nothing for "idle" (nothing has changed
// yet since load, so there's nothing to report).
function SaveStatusBadge({ status, onRetry }: SaveStatusBadgeProps) {
  if (status === "idle") return null
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Saving...
      </span>
    )
  }
  if (status === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
        title="Click to retry saving"
      >
        <CloudOff className="size-3" /> Save failed - retry
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-success">
      <Check className="size-3" /> Saved
    </span>
  )
}

export default SaveStatusBadge
