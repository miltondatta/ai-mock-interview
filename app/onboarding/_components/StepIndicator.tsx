import React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

// Numbered progress indicator: completed steps show a filled check, the
// active step has a ring, and upcoming steps are muted. The line leading
// into a step is filled once that step has been reached.
export function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <ol className="flex items-center justify-center" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1
        const done = step < current
        const active = step === current
        return (
          <li key={step} className="flex items-center">
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  "mx-1.5 h-0.5 w-6 rounded-full transition-colors sm:mx-3 sm:w-12",
                  step <= current ? "bg-primary" : "bg-border"
                )}
              />
            )}
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-xs font-semibold transition-all",
                done && "bg-primary text-primary-foreground",
                active && "border-2 border-primary bg-card text-primary ring-4 ring-primary/15",
                !done && !active && "border-2 border-border bg-card text-muted-foreground"
              )}
            >
              {done ? <Check className="size-4" strokeWidth={3} /> : step}
              <span className="sr-only">{done ? " (completed)" : active ? " (current)" : ""}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
