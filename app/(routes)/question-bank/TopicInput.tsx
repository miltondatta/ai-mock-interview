"use client"

import React, { useMemo, useRef, useState } from "react"
import { GripVertical, Search, X } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { GenerationMode } from "./types"
import { getSuggestions } from "./suggestionData"

interface TopicInputProps {
  mode: GenerationMode
  inputValue: string
  onInputChange: (value: string) => void
  tags: string[]
  onAddTag: (value: string) => void
  onRemoveTag: (tag: string) => void
  jobDescription: string
  onJobDescriptionChange: (value: string) => void
  disabled?: boolean
}

function TopicInput({
  mode,
  inputValue,
  onInputChange,
  tags,
  onAddTag,
  onRemoveTag,
  jobDescription,
  onJobDescriptionChange,
  disabled,
}: TopicInputProps) {
  const [showJobDescription, setShowJobDescription] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const suggestions = useMemo(
    () => getSuggestions(mode, inputValue, tags),
    [mode, inputValue, tags]
  )
  const isOpen = isFocused && suggestions.length > 0

  function selectSuggestion(value: string) {
    onAddTag(value)
    setHighlightedIndex(-1)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault()
      setHighlightedIndex((prev) => {
        const delta = e.key === "ArrowDown" ? 1 : -1
        const next = prev + delta
        if (next < 0) return suggestions.length - 1
        if (next >= suggestions.length) return 0
        return next
      })
      return
    }
    if (e.key === "Enter") {
      e.preventDefault()
      if (isOpen && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        selectSuggestion(suggestions[highlightedIndex])
      } else if (inputValue.trim()) {
        onAddTag(inputValue)
        setHighlightedIndex(-1)
      }
      return
    }
    if (e.key === "Escape") {
      setIsFocused(false)
    }
  }

  return (
    <div>
      <div className="relative">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-colors focus-within:ring-2 focus-within:ring-ring/40">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={inputValue}
            disabled={disabled}
            onChange={(e) => {
              onInputChange(e.target.value)
              setHighlightedIndex(-1)
            }}
            onFocus={() => {
              if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
              setIsFocused(true)
            }}
            onBlur={() => {
              // Delay so a click on a suggestion registers before the list unmounts.
              blurTimerRef.current = setTimeout(() => setIsFocused(false), 150)
            }}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            autoComplete="off"
            // Some browser extensions (password managers, Grammarly, etc.) inject an
            // autocomplete attribute into text inputs right after the server HTML
            // paints but before React hydrates, which trips a hydration-mismatch
            // warning on this exact attribute. It's cosmetic (not a real bug in this
            // component), so this one node opts out of that specific check.
            suppressHydrationWarning
            placeholder={
              mode === "skill"
                ? "Start typing a topic e.g., 'React.js'"
                : "Start typing a job role e.g., 'Product Manager'"
            }
            className="w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
        </div>

        {isOpen && (
          <ul
            role="listbox"
            className="absolute inset-x-0 top-[calc(100%+6px)] z-10 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-lg"
          >
            {suggestions.map((suggestion, index) => (
              <li key={suggestion}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === highlightedIndex}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => selectSuggestion(suggestion)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground transition-colors",
                    index === highlightedIndex ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  )}
                >
                  <Search className="size-3.5 shrink-0 text-muted-foreground" />
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {mode === "job" && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowJobDescription((v) => !v)}
            className="text-sm font-medium text-primary hover:underline"
          >
            {showJobDescription ? "Hide job description" : "+ Add job description (optional)"}
          </button>
          {showJobDescription && (
            <Textarea
              value={jobDescription}
              disabled={disabled}
              onChange={(e) => onJobDescriptionChange(e.target.value)}
              placeholder="Paste the job description to generate more targeted questions…"
              rows={3}
              className="mt-2 resize-none rounded-xl shadow-sm"
            />
          )}
        </div>
      )}

      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground"
            >
              <GripVertical className="size-3.5 text-muted-foreground" />
              {tag}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemoveTag(tag)}
                aria-label={`Remove ${tag}`}
                className="ml-0.5 flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-black/5 hover:text-foreground disabled:cursor-not-allowed"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default TopicInput
