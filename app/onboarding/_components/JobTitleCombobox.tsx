"use client"

import React, { useId, useMemo, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { JOB_TITLES } from "../constants"

const MAX_SUGGESTIONS = 8

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}

// Each query word must match some word in the title, either as a prefix or
// within a small typo distance. So "prject manager" still finds
// "Project Manager".
function scoreTitle(title: string, query: string): number {
  const t = title.toLowerCase()
  if (t === query) return 1000
  if (t.startsWith(query)) return 900 - t.length
  if (t.includes(query)) return 700 - t.indexOf(query)

  const titleWords = t.split(/[\s/,.-]+/).filter(Boolean)
  const queryWords = query.split(/\s+/).filter(Boolean)
  let total = 0
  for (const q of queryWords) {
    let best = 0
    for (const w of titleWords) {
      if (w.startsWith(q)) best = Math.max(best, 100)
      else if (q.length >= 3) {
        const d = editDistance(q, w.slice(0, Math.max(q.length, Math.min(w.length, q.length + 1))))
        const allowed = q.length >= 6 ? 2 : 1
        if (d <= allowed) best = Math.max(best, 80 - d * 15)
      }
    }
    if (best === 0) return 0
    total += best
  }
  return total / queryWords.length
}

export function suggestJobTitles(input: string): string[] {
  const query = input.trim().toLowerCase().replace(/\s+/g, " ")
  if (!query) return []
  return JOB_TITLES
    .map(title => ({ title, score: scoreTitle(title, query) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, MAX_SUGGESTIONS)
    .map(r => r.title)
}

// Searchable job-title input. Suggestions are only a shortcut: whatever the
// user types is a valid custom title.
export function JobTitleCombobox({
  value,
  onChange,
  onSubmit,
  disabled,
  inputId,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  disabled?: boolean
  inputId: string
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const suggestions = useMemo(() => {
    const list = suggestJobTitles(value)
    // A suggestion that exactly matches what's already typed adds nothing.
    return list.length === 1 && list[0].toLowerCase() === value.trim().toLowerCase() ? [] : list
  }, [value])
  const showList = open && suggestions.length > 0

  const choose = (title: string) => {
    onChange(title)
    setOpen(false)
    setHighlight(-1)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && suggestions.length > 0) {
      e.preventDefault()
      setOpen(true)
      setHighlight(h => (h + 1) % suggestions.length)
    } else if (e.key === "ArrowUp" && suggestions.length > 0) {
      e.preventDefault()
      setOpen(true)
      setHighlight(h => (h <= 0 ? suggestions.length - 1 : h - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (showList && highlight >= 0) choose(suggestions[highlight])
      else {
        setOpen(false)
        onSubmit?.()
      }
    } else if (e.key === "Escape") {
      setOpen(false)
      setHighlight(-1)
    }
  }

  return (
    <div className="relative">
      <Input
        id={inputId}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && highlight >= 0 ? `${listId}-${highlight}` : undefined}
        autoComplete="off"
        maxLength={200}
        placeholder="e.g. Senior UX Designer"
        value={value}
        disabled={disabled}
        onChange={e => {
          onChange(e.target.value)
          setOpen(true)
          setHighlight(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Wait before closing so a click on a suggestion still registers.
          blurTimer.current = setTimeout(() => setOpen(false), 120)
        }}
        onKeyDown={onKeyDown}
        className="h-11 bg-card px-3.5 text-base md:text-sm"
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-lg"
        >
          {suggestions.map((title, i) => (
            <li
              key={title}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={e => e.preventDefault()}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => {
                if (blurTimer.current) clearTimeout(blurTimer.current)
                choose(title)
              }}
              className={cn(
                "cursor-pointer px-4 py-2 text-sm text-popover-foreground",
                i === highlight && "bg-muted"
              )}
            >
              {title}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
