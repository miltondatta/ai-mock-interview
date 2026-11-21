"use client"

import React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface PaginationProps {
  /** 1-based current page. */
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  className?: string
  /** Optional human-readable range, e.g. "Showing 1-20 of 347". */
  summary?: string
}

// 1, "ellipsis", 4, 5, 6, "ellipsis", 20 - always shows the first/last page
// plus a small neighborhood around the current one, collapsing the rest.
function paginationRange(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 1) return [1]
  const delta = 1
  const left = Math.max(2, current - delta)
  const right = Math.min(total - 1, current + delta)
  const range: (number | "ellipsis")[] = [1]
  if (left > 2) range.push("ellipsis")
  for (let i = left; i <= right; i++) range.push(i)
  if (right < total - 1) range.push("ellipsis")
  range.push(total)
  return range
}

// Shared pagination control (compact page numbers + prev/next), styled to
// match the app's existing Button component and badge/chip conventions
// rather than introducing a new visual language. Renders nothing when
// there's only one page.
export function Pagination({ page, pageCount, onPageChange, className, summary }: PaginationProps) {
  if (pageCount <= 1) return null
  const items = paginationRange(page, pageCount)

  return (
    <nav aria-label="Pagination" className={cn("flex flex-col items-center gap-3 sm:flex-row sm:justify-between", className)}>
      {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
        </Button>

        {items.map((item, idx) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${idx}`} className="px-1.5 text-sm text-muted-foreground select-none">
              …
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant={item === page ? "default" : "outline"}
              size="icon-sm"
              aria-label={`Page ${item}`}
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPageChange(item)}
              className="tabular-nums"
            >
              {item}
            </Button>
          )
        )}

        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Next page"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  )
}
