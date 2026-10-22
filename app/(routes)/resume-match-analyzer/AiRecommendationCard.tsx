import React from "react"
import { Download, Lightbulb, Mic } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Panel } from "./shared"

interface AiRecommendationCardProps {
  recommendation: string | null
  onStartMockInterview: () => void
  onDownloadReport: () => void
}

function AiRecommendationCard({ recommendation, onStartMockInterview, onDownloadReport }: AiRecommendationCardProps) {
  return (
    <Panel className="flex flex-col gap-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Lightbulb className="size-5 text-warning" />
          AI Recommendation
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground/80">
          {recommendation ?? <span className="text-muted-foreground">No recommendation was returned for this analysis.</span>}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Button className="h-11 w-full text-sm" onClick={onStartMockInterview}>
          <Mic />
          Start Targeted Mock Interview
        </Button>
        <p className="text-center text-xs text-muted-foreground">Get interview questions based on this analysis</p>
      </div>
      <Button variant="outline" className="h-11 w-full border-primary/40 text-primary hover:text-primary" onClick={onDownloadReport}>
        <Download />
        Download Report (PDF)
      </Button>
    </Panel>
  )
}

export default AiRecommendationCard
