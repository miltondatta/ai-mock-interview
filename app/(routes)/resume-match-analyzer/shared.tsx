import React from "react"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { RequirementStatus } from "@/utils/resumeMatchAnalysis"

const STATUS_STYLES: Record<RequirementStatus, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  matched: { label: "Matched", variant: "success" },
  partial: { label: "Partially matched", variant: "warning" },
  "not-evidenced": { label: "Not evidenced", variant: "destructive" },
  unclear: { label: "Needs review", variant: "secondary" },
}

export function StatusBadge({ status }: { status: RequirementStatus | null }) {
  if (!status) return <Badge variant="outline">Not assessed</Badge>
  const { label, variant } = STATUS_STYLES[status]
  return <Badge variant={variant}>{label}</Badge>
}

export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xs", className)}>
      {children}
    </section>
  )
}

export type MatchTone = "success" | "warning" | "destructive" | "muted"

// Colors follow the match level n8n returns (its thresholds: Strong >= 85,
// Good >= 70, Partial >= 50, otherwise Low).
export function matchTone(matchLevel: string | null): MatchTone {
  const level = matchLevel?.toLowerCase() ?? ""
  if (level.startsWith("strong") || level.startsWith("good")) return "success"
  if (level.startsWith("partial")) return "warning"
  if (level.startsWith("low")) return "destructive"
  return "muted"
}

export const TONE_TEXT: Record<MatchTone, string> = {
  success: "text-success",
  warning: "text-warning-foreground",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
}

export function formatAnalysisDate(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <Panel className="flex flex-col items-center gap-1 py-14 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
    </Panel>
  )
}

export function LoadingPanel() {
  return (
    <Panel className="flex flex-col items-center gap-2 py-14 text-center" >
      <Loader2 className="size-6 animate-spin text-primary" />
      <p className="text-sm font-medium">Analyzing your resume…</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Comparing your resume with the job requirements. This can take a minute or two.
      </p>
    </Panel>
  )
}
