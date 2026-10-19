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
import { Badge } from "@/components/ui/badge"

type ParsedFeedback = {
    feedback?: string
    suggestions?: string
    rating?: string
}

type ScoredSkill = { name: string; score: number | null; feedback: string }

// Current feedback webhook output (n8n/Gemini), stored as a JSON string:
// { feedback: { summary, technical_skills: { score, feedback }, ...,
//   mode_specific_skills: [{ skill, score, feedback }] }, suggestion: [], rating }
type StructuredFeedback = {
    summary?: string
    skills: ScoredSkill[]
    modeSkills: ScoredSkill[]
    suggestions: string[]
    rating?: string
}

// "technical_skills" -> "Technical Skills"
function humanizeKey(key: string) {
    return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function toScore(value: unknown): number | null {
    const n = typeof value === "number" ? value : parseFloat(String(value ?? ""))
    return Number.isFinite(n) ? n : null
}

function toFeedbackData(raw: unknown): unknown {
    if (typeof raw !== "string") return raw
    // Strip a ```json fence if the model wrapped its output in one.
    const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    try {
        return JSON.parse(text)
    } catch {
        return raw
    }
}

// Returns null for anything that isn't the structured format, so older
// interviews keep rendering through parseFeedback below.
function parseStructuredFeedback(raw: unknown): StructuredFeedback | null {
    const data = toFeedbackData(raw)
    if (!data || typeof data !== "object" || Array.isArray(data)) return null
    const record = data as Record<string, unknown>
    const feedback = record.feedback
    if (!feedback || typeof feedback !== "object" || Array.isArray(feedback)) return null

    const skills: ScoredSkill[] = []
    let summary: string | undefined
    let modeSkills: ScoredSkill[] = []
    for (const [key, value] of Object.entries(feedback as Record<string, unknown>)) {
        if (key === "summary" && typeof value === "string") {
            summary = value
        } else if (key === "mode_specific_skills" && Array.isArray(value)) {
            modeSkills = value
                .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
                .map((item) => ({
                    name: String(item.skill ?? item.name ?? ""),
                    score: toScore(item.score),
                    feedback: String(item.feedback ?? ""),
                }))
        } else if (value && typeof value === "object" && !Array.isArray(value) && "score" in value) {
            const skill = value as Record<string, unknown>
            skills.push({ name: humanizeKey(key), score: toScore(skill.score), feedback: String(skill.feedback ?? "") })
        }
    }
    if (!summary && skills.length === 0 && modeSkills.length === 0) return null

    const suggestion = record.suggestion ?? record.suggestions
    const suggestions = Array.isArray(suggestion)
        ? suggestion.map(String).filter(Boolean)
        : typeof suggestion === "string" && suggestion.trim()
          ? [suggestion]
          : []
    const rating = record.rating != null && String(record.rating).trim() ? String(record.rating) : undefined

    return { summary, skills, modeSkills, suggestions, rating }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return <h3 className="text-xs font-semibold tracking-wide text-primary uppercase">{children}</h3>
}

function SkillRow({ skill }: { skill: ScoredSkill }) {
    const width = skill.score == null ? 0 : Math.max(0, Math.min(100, skill.score))
    return (
        <div className="rounded-xl border border-border bg-muted/30 p-3.5">
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">{skill.name}</p>
                {skill.score != null && (
                    <span className="shrink-0 text-sm font-semibold text-primary">{skill.score}/100</span>
                )}
            </div>
            {skill.score != null && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                </div>
            )}
            {skill.feedback && (
                <p className="mt-2 text-sm whitespace-pre-wrap text-foreground/90">{skill.feedback}</p>
            )}
        </div>
    )
}

function StructuredFeedbackView({ data }: { data: StructuredFeedback }) {
    return (
        <>
            {data.rating && (
                <section>
                    <SectionTitle>Overall Rating</SectionTitle>
                    <Badge variant="success" className="mt-2 px-3 py-1 text-sm">
                        {data.rating} / 10
                    </Badge>
                </section>
            )}

            {data.summary && (
                <section>
                    <SectionTitle>Summary</SectionTitle>
                    <p className="mt-1.5 text-sm whitespace-pre-wrap text-foreground/90">{data.summary}</p>
                </section>
            )}

            {data.skills.length > 0 && (
                <section>
                    <SectionTitle>Skills</SectionTitle>
                    <div className="mt-2 flex flex-col gap-2.5">
                        {data.skills.map((skill) => (
                            <SkillRow key={skill.name} skill={skill} />
                        ))}
                    </div>
                </section>
            )}

            {data.modeSkills.length > 0 && (
                <section>
                    <SectionTitle>Interview Mode Skills</SectionTitle>
                    <div className="mt-2 flex flex-col gap-2.5">
                        {data.modeSkills.map((skill, index) => (
                            <SkillRow key={`${skill.name}-${index}`} skill={skill} />
                        ))}
                    </div>
                </section>
            )}

            {data.suggestions.length > 0 && (
                <section>
                    <SectionTitle>Suggestions</SectionTitle>
                    <ul className="mt-1.5 flex list-disc flex-col gap-1.5 pl-5 text-sm text-foreground/90">
                        {data.suggestions.map((suggestion, index) => (
                            <li key={index} className="whitespace-pre-wrap">
                                {suggestion}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </>
    )
}

// Older feedback shapes - this reads several plausible key names and falls back
// to showing the raw content under "Feedback" rather than failing to render anything.
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
                if (typeof value === "object" && Object.keys(value as object).length) {
                    return Object.entries(value as Record<string, unknown>)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join("\n")
                }
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

    const structured = parseStructuredFeedback(interview?.feedback)
    const parsed = structured ? {} as ParsedFeedback : parseFeedback(interview?.feedback)

    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) router.push("/dashboard")
            }}
        >
            <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-xl">Interview Feedback</DialogTitle>
                    <DialogDescription>
                        {interview?.jobTitle || "Your mock interview"} performance summary
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-6 py-2">
                    {interview === undefined && (
                        <p className="text-sm text-muted-foreground">Loading feedback...</p>
                    )}

                    {interview && !interview.feedback && (
                        <p className="text-sm text-muted-foreground">
                            Feedback is not available for this interview yet.
                        </p>
                    )}

                    {structured && <StructuredFeedbackView data={structured} />}

                    {parsed.rating && (
                        <section>
                            <h3 className="text-xs font-semibold tracking-wide text-primary uppercase">
                                Rating
                            </h3>
                            {parsed.rating.length <= 12 ? (
                                <Badge variant="success" className="mt-2 px-3 py-1 text-xs">
                                    {parsed.rating}
                                </Badge>
                            ) : (
                                <p className="mt-1.5 text-sm whitespace-pre-wrap text-foreground/90">
                                    {parsed.rating}
                                </p>
                            )}
                        </section>
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
