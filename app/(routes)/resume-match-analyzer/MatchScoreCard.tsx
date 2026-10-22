import React from "react"
import { Info, Trophy } from "lucide-react"
import { cn } from "@/lib/utils"
import { Panel, TONE_TEXT, type MatchTone } from "./shared"
import type { CategoryScore } from "@/utils/resumeMatchAnalysis"

// Visual tones only - these never influence the scores returned by n8n.
const BAR_TONES = ["bg-success", "bg-sky-500", "bg-violet-500", "bg-primary", "bg-muted-foreground/50"]

const RING_STROKE: Record<MatchTone, string> = {
  success: "stroke-success",
  warning: "stroke-warning",
  destructive: "stroke-destructive",
  muted: "stroke-muted-foreground",
}

const INSIGHT_PANEL: Record<MatchTone, string> = {
  success: "border-success/25 bg-success/10",
  warning: "border-warning/30 bg-warning/10",
  destructive: "border-destructive/25 bg-destructive/10",
  muted: "border-border bg-muted/60",
}

const RING_RADIUS = 52
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

interface MatchScoreCardProps {
  score: number | null
  matchLevel: string | null
  tone: MatchTone
  insight: { headline: string; description: string }
  categoryScores: CategoryScore[]
}

function ScoreRing({ score, matchLevel, tone }: { score: number | null; matchLevel: string | null; tone: MatchTone }) {
  return (
    <div className="relative mx-auto size-48 shrink-0 sm:size-52">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={RING_RADIUS} fill="none" strokeWidth="11" className="stroke-muted" />
        {score !== null && (
          <circle
            cx="60"
            cy="60"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="11"
            strokeLinecap="round"
            className={RING_STROKE[tone]}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - score / 100)}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tracking-tight sm:text-5xl">{score !== null ? `${score}%` : "—"}</span>
        <span className={cn("mt-1 flex items-center gap-1 text-sm font-semibold", TONE_TEXT[tone])}>
          {score !== null ? (matchLevel ?? "Match level unavailable") : "Score unavailable"}
          <span
            title="Weighted across required skills, experience, responsibilities, education and preferred skills by the analysis workflow."
            aria-label="How this score is calculated"
            className="cursor-help"
          >
            <Info className="size-3.5" />
          </span>
        </span>
      </div>
    </div>
  )
}

function CategoryScoreBars({ scores }: { scores: CategoryScore[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">Category Scores</h3>
      <ul className="mt-3 flex flex-col gap-2.5">
        {scores.map((category, i) => (
          <li key={category.key} className="grid grid-cols-[minmax(0,10rem)_1fr_2.75rem] items-center gap-3 text-sm">
            <span className="truncate text-foreground/80">{category.label}</span>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label={category.label}
              aria-valuenow={category.score ?? undefined}
              aria-valuetext={category.score === null ? "Unavailable" : undefined}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              {category.score !== null && (
                <div
                  className={`h-full rounded-full ${BAR_TONES[i % BAR_TONES.length]}`}
                  style={{ width: `${category.score}%` }}
                />
              )}
            </div>
            <span className="text-right font-medium tabular-nums">
              {category.score !== null ? `${category.score}%` : <span className="text-muted-foreground">N/A</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MatchScoreCard({ score, matchLevel, tone, insight, categoryScores }: MatchScoreCardProps) {
  return (
    <Panel>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[auto_1fr] md:items-center">
        <div>
          <h2 className="text-base font-semibold">Overall Match Score</h2>
          <div className="mt-4">
            <ScoreRing score={score} matchLevel={matchLevel} tone={tone} />
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className={cn("flex gap-3 rounded-lg border p-4", INSIGHT_PANEL[tone])}>
            <Trophy className="mt-0.5 size-6 shrink-0 text-warning" />
            <div>
              <p className={cn("font-semibold", TONE_TEXT[tone])}>{insight.headline}</p>
              <p className="mt-1 text-sm text-foreground/75">{insight.description}</p>
            </div>
          </div>
          <CategoryScoreBars scores={categoryScores} />
        </div>
      </div>
    </Panel>
  )
}

export default MatchScoreCard
