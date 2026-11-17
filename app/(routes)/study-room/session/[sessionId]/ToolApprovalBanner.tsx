"use client"

import { Bot, Check, X } from "lucide-react"
import type { PendingApproval } from "./workspaceTypes"

interface ToolApprovalBannerProps {
  approval: PendingApproval
  onApprove: () => void
  onReject: () => void
}

// Shown whenever the Tutor wants to take a destructive workspace action
// (replace code, clear the whiteboard, restructure notes, delete elements
// or sections) - the learner must explicitly approve or reject before
// anything is applied. Auto-rejects after a timeout owned by the caller
// (Workspace.tsx) if ignored. Phase 4 adds the Tutor's explanation and a
// preview of the new content so the change can be reviewed first; Phase 3
// shows how many more requests are queued behind this one.
function ToolApprovalBanner({ approval, onApprove, onReject }: ToolApprovalBannerProps) {
  return (
    <div className="absolute inset-x-0 top-0 z-30 flex flex-col gap-2 border-b border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-foreground">
          <Bot className="size-4 shrink-0 text-warning-foreground" />
          <span className="font-medium">{approval.description}</span>
          {approval.queuedBehind ? (
            <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              +{approval.queuedBehind} more
            </span>
          ) : null}
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
      {approval.details && <p className="pl-6 text-xs text-muted-foreground">{approval.details}</p>}
      {approval.preview && (
        <pre className="ml-6 max-h-40 overflow-auto rounded-lg border border-border bg-card px-3 py-2 text-xs whitespace-pre-wrap text-foreground">
          {approval.preview}
        </pre>
      )}
    </div>
  )
}

export default ToolApprovalBanner
