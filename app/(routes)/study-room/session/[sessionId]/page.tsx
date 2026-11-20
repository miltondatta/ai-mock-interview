"use client"

import React, { useContext, useMemo } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "convex/react"
import { ArrowLeft } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import StudyRoomTutorSession from "./StudyRoomTutorSession"
import SessionCompletion from "./SessionCompletion"

function StudyRoomSessionPage() {
  const params = useParams<{ sessionId: string }>()
  const { userDetail } = useContext(UserDetailContext)
  const userId: Id<"UserTable"> | undefined = userDetail?._id
  const sessionId = params.sessionId as Id<"studyRoomSessions">

  const data = useQuery(
    api.StudyRoom.GetStudyRoomSession,
    userId ? { userId, sessionId } : "skip"
  )

  // M3 - GetStudyRoomSession re-fires on every single conversation turn
  // (AppendStudyRoomMessage patches this exact session row's updatedAt),
  // which would otherwise hand StudyRoomTutorSession a brand-new `room`
  // object identity dozens of times per minute while the live Tutor call is
  // up. Memoizing it on the fields that actually matter, together with
  // StudyRoomTutorSession being memo'd, keeps that per-turn reactivity from
  // cascading into the live audio call's component tree at all - it only
  // ever re-renders for a reason that actually matters to it. Computed
  // ahead of the early returns below so this hook is never called
  // conditionally.
  const tutorRoom = useMemo(() => {
    const room = data?.room
    if (!room) return null
    return { _id: room._id, title: room.title, topic: room.topic, objective: room.objective }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.room?._id, data?.room?.title, data?.room?.topic, data?.room?.objective])

  if (data === undefined) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14 text-center text-sm text-muted-foreground">Loading session...</div>
    )
  }

  if (data === null) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14 text-center">
        <p className="text-sm font-semibold text-foreground">This session could not be found.</p>
        <Link href="/study-room" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="size-4" /> Back to AI Study Room
        </Link>
      </div>
    )
  }

  const { session, room } = data

  // Live AI Tutor experience - voice + text, the actual M2 deliverable.
  if (session.status === "in_progress") {
    return <StudyRoomTutorSession sessionId={sessionId} room={tutorRoom!} />
  }

  // Session already ended (completed or abandoned) - M4's full Session
  // Completion experience: lesson summary, saved-workspace indicators,
  // transcript/notes access, and the four follow-on actions.
  return (
    <div>
      <div className="mx-auto max-w-3xl px-6 pt-6 md:px-10">
        <Link
          href={`/study-room/${room._id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
        >
          <ArrowLeft className="size-4" /> Back to {room.title}
        </Link>
      </div>
      <SessionCompletion
        sessionId={sessionId}
        session={{
          status: session.status as "completed" | "abandoned",
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          durationSeconds: session.durationSeconds,
          summaryStatus: session.summaryStatus,
        }}
        room={{ _id: room._id, title: room.title, topic: room.topic, objective: room.objective, category: room.category }}
      />
    </div>
  )
}

export default StudyRoomSessionPage
