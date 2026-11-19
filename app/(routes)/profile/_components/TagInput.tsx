"use client"

import React, { useState } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

// Tag-style input: type, then press Enter (or comma) to add a chip.
// Backspace on an empty input removes the last chip. Duplicates are rejected
// regardless of case.
export function TagInput({
  id,
  tags,
  onAdd,
  onRemove,
  placeholder,
  maxTags,
  maxLength,
  disabled,
  itemLabel,
}: {
  id: string
  tags: string[]
  onAdd: (tag: string) => void
  onRemove: (index: number) => void
  placeholder: string
  maxTags: number
  maxLength: number
  disabled?: boolean
  itemLabel: string
}) {
  const [draft, setDraft] = useState("")
  const [hint, setHint] = useState<string | null>(null)

  const commit = () => {
    const value = draft.trim().replace(/\s+/g, " ")
    if (!value) return
    if (tags.some(t => t.toLowerCase() === value.toLowerCase())) {
      setHint(`"${value}" is already added.`)
      return
    }
    if (tags.length >= maxTags) {
      setHint(`You can add up to ${maxTags} ${itemLabel}s.`)
      return
    }
    onAdd(value)
    setDraft("")
    setHint(null)
  }

  return (
    <div>
      <div
        className={cn(
          "flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1.5 transition-colors",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          disabled && "opacity-60"
        )}
        onClick={e => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}
      >
        {tags.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary/10 py-1 pr-1 pl-2 text-xs font-medium text-primary"
          >
            <span className="truncate">{tag}</span>
            <button
              type="button"
              aria-label={`Remove ${itemLabel} ${tag}`}
              disabled={disabled}
              onClick={() => onRemove(i)}
              className="flex size-4 cursor-pointer items-center justify-center rounded-sm hover:bg-primary/20"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={tags.length === 0 ? placeholder : `Add another ${itemLabel}`}
          onChange={e => {
            setDraft(e.target.value)
            if (hint) setHint(null)
          }}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault()
              commit()
            } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
              onRemove(tags.length - 1)
            }
          }}
          onBlur={commit}
          className="h-7 min-w-32 flex-1 bg-transparent px-1.5 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
      </div>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
