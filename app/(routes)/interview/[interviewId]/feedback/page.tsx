"use client"

import { useParams, useRouter } from "next/navigation"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

type ParsedFeedback = {
    feedback?: string
    suggestions?: string
    rating?: string
}

// The feedback webhook's exact response shape isn't documented, so this reads
// several plausible key names and falls back to showing the raw content under
// "Feedback" rather than failing to render anything.
function parseFeedback(raw: unknown): ParsedFeedback {
    if (raw == null) return {}

    let data: unknown = raw
    if (typeof data === "string") {
        const text = data
        try {
            data = JSON.parse(text)
        } catch {
            return { feedback: text }
        }
    }

    if (data && typeof data === "object" && !Array.isArray(data)) {
        const record = data as Record<string, unknown>
        const pick = (...keys: string[]) => {
            for (const key of keys) {
                const value = record[key]
                if (value == null) continue
                if (typeof value === "string" && value.trim()) return value
                if (typeof value === "number") return String(value)
                if (Array.isArray(value) && value.length) return value.map((item) => `• ${item}`).join("\n")
            }
            return undefined
        }

        const feedback = pick("feedback", "Feedback", "summary", "overallFeedback")
        const suggestions = pick("suggestion", "suggestions", "Suggestion", "Suggestions", "improvements", "recommendations")
        const rating = pick("rating", "Rating", "score", "overallRating")

        if (feedback || suggestions || rating) {
            return { feedback, suggestions, rating }
        }
    }

    return { feedback: JSON.stringify(data, null, 2) }
}

function InterviewFeedbackPage() {
    const { interviewId } = useParams<{ interviewId: string }>()
    const router = useRouter()

    const interview = useQuery(api.Interview.GetInterviewSession, {
        interviewId: interviewId as Id<"InterviewSessionTable">
    })

    const parsed = parseFeedback(interview?.feedback)

    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) router.push("/dashboard")
            }}
        >
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-xl">Interview Feedback</DialogTitle>
                    <DialogDescription>
                        {interview?.jobTitle || "Your mock interview"} performance summary
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-5 py-2">
                    {interview === undefined && (
                        <p className="text-sm text-muted-foreground">Loading feedback...</p>
                    )}

                    {interview && !interview.feedback && (
                        <p className="text-sm text-muted-foreground">
                            Feedback is not available for this interview yet.
                        </p>
                    )}

                    {parsed.feedback && (
                        <section>
                            <h3 className="text-xs font-semibold tracking-wide text-primary uppercase">
                                Feedback
                            </h3>
                            <p className="mt-1.5 text-sm whitespace-pre-wrap text-foreground/90">
                                {parsed.feedback}
                            </p>
                        </section>
                    )}

                    {parsed.suggestions && (
                        <section>
                            <h3 className="text-xs font-semibold tracking-wide text-primary uppercase">
                                Suggestions
                            </h3>
                            <p className="mt-1.5 text-sm whitespace-pre-wrap text-foreground/90">
                                {parsed.suggestions}
                            </p>
                        </section>
                    )}

                    {parsed.rating && (
                        <section>
                            <h3 className="text-xs font-semibold tracking-wide text-primary uppercase">
                                Rating
                            </h3>
                            {parsed.rating.length <= 12 ? (
                                <span className="mt-1.5 inline-flex w-fit rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground">
                                    {parsed.rating}
                                </span>
                            ) : (
                                <p className="mt-1.5 text-sm whitespace-pre-wrap text-foreground/90">
                                    {parsed.rating}
                                </p>
                            )}
                        </section>
                    )}
                </div>

                <DialogFooter>
                    <DialogClose>
                        <Button>Close</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default InterviewFeedbackPage
