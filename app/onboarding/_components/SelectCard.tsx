import React from "react"
import { cn } from "@/lib/utils"

// Single-choice option tile used by the timeline, availability and referral
// steps. It renders as a radio, so a group of these works with a keyboard and
// screen readers.
export function SelectCard({
  selected,
  onSelect,
  disabled,
  className,
  children,
}: {
  selected: boolean
  onSelect: () => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-center rounded-lg border bg-card px-3 py-2.5 text-left text-sm transition-colors outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
        selected
          ? "border-primary bg-primary/5 text-primary"
          : "border-border text-foreground hover:border-primary/40 hover:bg-muted/50",
        className
      )}
    >
      {children}
    </button>
  )
}
