"use client"

import React from "react"
import { cn } from "@/lib/utils"
import type { Difficulty } from "./types"

export type DifficultyFilterValue = "all" | Difficulty

interface DifficultyFiltersProps {
  active: DifficultyFilterValue
  onChange: (value: DifficultyFilterValue) => void
  counts: { all: number; beginner: number; intermediate: number; advanced: number }
}

const TONE_CLASSES: Record<DifficultyFilterValue, { active: string; idle: string }> = {
  all: {
    active: "border-primary/50 bg-primary/10 text-primary",
    idle: "border-transparent bg-muted text-muted-foreground hover:border-primary/30",
  },
  beginner: {
    active: "border-success/40 bg-success/15 text-success",
    idle: "border-transparent bg-success/5 text-success/70 hover:border-success/30",
  },
  intermediate: {
    active: "border-warning/50 bg-warning/20 text-warning-foreground",
    idle: "border-transparent bg-warning/10 text-warning-foreground/70 hover:border-warning/40",
  },
  advanced: {
    active: "border-destructive/40 bg-destructive/15 text-destructive",
    idle: "border-transparent bg-destructive/5 text-destructive/70 hover:border-destructive/30",
  },
}

const LABELS: Record<DifficultyFilterValue, string> = {
  all: "All",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
}

function DifficultyFilters({ active, onChange, counts }: DifficultyFiltersProps) {
  const pills: DifficultyFilterValue[] = ["all", "beginner", "intermediate", "advanced"]
  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5">
      {pills.map((pill) => {
        const isActive = active === pill
        const tone = TONE_CLASSES[pill]
        return (
          <button
            key={pill}
            type="button"
            onClick={() => onChange(pill)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              isActive ? tone.active : tone.idle
            )}
          >
            {LABELS[pill]}
            <span className="text-xs font-semibold opacity-80">{counts[pill]}</span>
          </button>
        )
      })}
    </div>
  )
}

export default DifficultyFilters
