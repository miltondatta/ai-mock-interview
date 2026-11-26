"use client"

import React, { useContext } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Doc } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import InterviewCard from "./InterviewCard"
import InterviewEmptyState from "./InterviewEmptyState"

interface InterviewHistoryListProps {
  /** Caps the number of cards shown (most recent first). Omit to show all. */
  limit?: number
  /** When set, a "View all" link is shown pointing here whenever there are more interviews than `limit`. */
  viewAllHref?: string
  title?: string
}

// Shared interview list grid - backs both the Dashboard's condensed "Recent
// Interviews" section and the full Mock Interview History page, so the
// fetch/render logic for a candidate's interview sessions lives in one place.
function InterviewHistoryList({ limit, viewAllHref, title }: InterviewHistoryListProps) {
  const { userDetail } = useContext(UserDetailContext)

  const interviewList: Doc<'InterviewSessionTable'>[] | undefined = useQuery(
    api.Interview.GetUserInterviews,
    userDetail?._id ? { userId: userDetail._id } : "skip"
  )

  if (!interviewList) return null

  const visible = limit ? interviewList.slice(0, limit) : interviewList
  const hasMore = !!limit && interviewList.length > limit

  return (
    <div>
      {(title || (viewAllHref && hasMore)) && (
        <div className="flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
          {viewAllHref && hasMore && (
            <Link href={viewAllHref} className="inline-flex items-center gap-0.5 text-sm font-medium text-primary hover:text-primary/80">
              View all <ChevronRight className="size-4" />
            </Link>
          )}
        </div>
      )}

      {/* Both branches stay mounted and are toggled with CSS (not unmounted via a
          ternary) to avoid a remount flicker the instant this list flips
          between empty and non-empty. */}
      <div className={visible.length > 0 ? 'mt-4 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3' : 'hidden'}>
        {visible.map((interview) => (
          <InterviewCard key={interview._id} interview={interview} />
        ))}
      </div>
      <div className={visible.length === 0 ? '' : 'hidden'}>
        <InterviewEmptyState />
      </div>
    </div>
  )
}

export default InterviewHistoryList
