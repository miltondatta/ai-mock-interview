"use client"

import React from "react"
import Link from "next/link"
import {
  Bot,
  Clock,
  Loader2,
  Repeat,
  Sparkles,
  ArrowRight,
  Video,
  BookOpen,
  Dumbbell,
  HelpCircle,
  FolderGit2,
  RotateCcw,
} from "lucide-react"
import { formatDateTime, TOPIC_STATUS_META, type StudyRoomDashboardItem, type TaskType } from "./types"

export type RoomCardAction = "start" | "continue" | "repeat"

const ACTION_META: Record<RoomCardAction, { label: string; icon: React.ElementType }> = {
  start: { label: "Start Learning", icon: Sparkles },
  continue: { label: "Continue", icon: ArrowRight },
  repeat: { label: "Repeat", icon: Repeat },
}

// A topic with no Study Room yet always "Start Learning"s a new one. Once a
// room exists, a finished lesson "Repeat"s it and everything else (in
// progress, or abandoned) "Continue"s - both labels dispatch to the exact
// same StartStudyRoomSession call (see page.tsx's handleAction), which
// resumes the room's live session if one exists or starts a brand-new
// attempt under the same canonical room otherwise, never touching any
// previous attempt's transcript or summary (M2).
function getAction(item: StudyRoomDashboardItem): RoomCardAction {
  if (!item.studyRoomId) return "start"
  if (item.studyRoomStatus === "completed") return "repeat"
  return "continue"
}

// M5 - leading icon per task type (from any already-generated learning
// resources - see convex/StudyPlanner.ts's GetStudyRoomTopics); falls back
// to a generic Bot icon for a topic with none yet, or a standalone room.
const TASK_TYPE_ICON: Record<TaskType, React.ElementType> = {
  video: Video,
  reading: BookOpen,
  practice: Dumbbell,
  quiz: HelpCircle,
  project: FolderGit2,
  revision: RotateCcw,
}

function TopicRow({
  item,
  busy,
  onAction,
}: {
  item: StudyRoomDashboardItem
  busy: boolean
  onAction: (item: StudyRoomDashboardItem, action: RoomCardAction) => void
}) {
  const action = getAction(item)
  const actionMeta = ACTION_META[action]
  const ActionIcon = actionMeta.icon
  const statusMeta = TOPIC_STATUS_META[item.studyRoomStatus]
  const TypeIcon = (item.taskType && TASK_TYPE_ICON[item.taskType]) || Bot
  const detailsHref = item.studyRoomId ? `/study-room/${item.studyRoomId}` : undefined

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-xs transition-colors hover:border-primary/30">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <TypeIcon className="size-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {detailsHref ? (
            <Link
              href={detailsHref}
              className="truncate text-sm font-semibold text-foreground hover:text-primary hover:underline"
              title={item.title}
            >
              {item.title}
            </Link>
          ) : (
            <p className="truncate text-sm font-semibold text-foreground" title={item.title}>
              {item.title}
            </p>
          )}
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta.badgeClass}`}>
            {statusMeta.label}
          </span>
        </div>
        {item.description && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={item.description}>
            {item.description}
          </p>
        )}
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="size-3 shrink-0" />
          {item.lastAccessedAt ? `Last accessed ${formatDateTime(item.lastAccessedAt)}` : "Not started yet"}
          {item.totalSessions > 0 && (
            <>
              &middot; {item.totalSessions} session{item.totalSessions === 1 ? "" : "s"}
            </>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={() => onAction(item, action)}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ActionIcon className="size-3.5" />}
        {busy ? "Working..." : actionMeta.label}
      </button>
    </div>
  )
}

export default TopicRow
