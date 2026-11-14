"use client"

import { Bot, Check, X } from "lucide-react"
import type { PendingApproval } from "./workspaceTypes"

interface ToolApprovalBannerProps {
  approval: PendingApproval
  onApprove: () => void
  onReject: () => void
}

// Shown whenever the Tutor wants to take a destructive workspace action
// (replace code, clear the whiteboard, restructure notes) - the learner
// must explicitly approve or reject before anything is applied. Auto-
// rejects after a timeout owned by the caller (Workspace.tsx) if ignored.
function ToolApprovalBanner({ approval, onApprove, onReject }: ToolApprovalBannerProps) {
  return (
    <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 border-b border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
      <div className="flex items-center gap-2 text-foreground">
        <Bot className="size-4 shrink-0 text-warning-foreground" />
        <span className="font-medium">{approval.description}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onReject}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        >
          <X className="size-3.5" /> Decline
        </button>
        <button
          type="button"
          onClick={onApprove}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          <Check className="size-3.5" /> Approve
        </button>
      </div>
    </div>
  )
}

export default ToolApprovalBanner
