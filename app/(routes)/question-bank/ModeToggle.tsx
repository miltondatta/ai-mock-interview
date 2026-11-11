"use client"

import React from "react"
import { BookOpen, Briefcase } from "lucide-react"
import { cn } from "@/lib/utils"
import type { GenerationMode } from "./types"

interface ModeToggleProps {
  mode: GenerationMode
  onChange: (mode: GenerationMode) => void
  disabled?: boolean
}

const OPTIONS: { id: GenerationMode; label: string; icon: typeof BookOpen }[] = [
  { id: "skill", label: "Skill", icon: BookOpen },
  { id: "job", label: "Job", icon: Briefcase },
]

function ModeToggle({ mode, onChange, disabled }: ModeToggleProps) {
  return (
    <div className="inline-flex w-full rounded-xl border border-border bg-muted/50 p-1 sm:w-auto" role="tablist" aria-label="Question generation mode">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon
        const active = mode === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors sm:flex-none sm:px-10",
              active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              disabled && "cursor-not-allowed opacity-60"
            )}
          >
            <Icon className="size-4" />
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export default ModeToggle
