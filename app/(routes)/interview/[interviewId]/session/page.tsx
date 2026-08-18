"use client"

import { useParams } from "next/navigation"
import InterviewSession from "@/components/interview/InterviewSession"

function InterviewSessionPage() {
    const { interviewId } = useParams<{ interviewId: string }>()

    return <InterviewSession interviewId={interviewId} />
}

export default InterviewSessionPage
