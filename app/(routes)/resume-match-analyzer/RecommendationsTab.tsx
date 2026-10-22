import React from "react"
import { CircleCheck, Mic, Star, Target, TrendingUp } from "lucide-react"
import { EmptyPanel, Panel } from "./shared"
import type { ResumeMatchAnalysis } from "@/utils/resumeMatchAnalysis"

function RecommendationsTab({ analysis }: { analysis: ResumeMatchAnalysis }) {
  const groups = [
    { title: "Recommendations", icon: Target, items: analysis.recommendations },
    { title: "Interview preparation", icon: Mic, items: analysis.interviewFocusAreas },
    {
      title: "Skills to strengthen",
      icon: TrendingUp,
      items: analysis.missingSkills.map((skill) => (skill.note ? `${skill.name}: ${skill.note}` : skill.name)),
    },
    { title: "Strengths to highlight", icon: Star, items: analysis.strengths },
  ].filter((group) => group.items.length > 0)

  if (groups.length === 0) {
    return <EmptyPanel title="No recommendations" description="The analysis didn't return any recommendations." />
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Suggestions to improve your match for this role.</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {groups.map((group) => {
          const Icon = group.icon
          return (
            <Panel key={group.title}>
              <h2 className="flex items-center gap-2.5 text-base font-semibold">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                {group.title}
              </h2>
              <ul className="mt-4 flex flex-col gap-2.5">
                {group.items.map((item, i) => (
                  <li key={`${item}-${i}`} className="flex items-start gap-2.5 text-sm">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
                    <span className="text-foreground/85">{item}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )
        })}
      </div>
    </div>
  )
}

export default RecommendationsTab
