import React from "react"
import { Badge } from "@/components/ui/badge"
import { Panel } from "./shared"

interface MatchSummaryCardProps {
  jobTitle: string
  analysisDate: string
  matchLevel: string | null
  matchLevelVariant: "success" | "warning" | "destructive" | "secondary"
  keyStrengths: string[]
  mainGaps: string[]
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 border-b border-border py-3 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

function NoneIdentified() {
  return <span className="text-muted-foreground">None identified</span>
}

function MatchSummaryCard({ jobTitle, analysisDate, matchLevel, matchLevelVariant, keyStrengths, mainGaps }: MatchSummaryCardProps) {
  return (
    <Panel>
      <h2 className="text-base font-semibold">Match Summary</h2>
      <dl className="mt-2">
        <SummaryRow label="Job Title">
          <span className="font-medium break-words">{jobTitle}</span>
        </SummaryRow>
        <SummaryRow label="Analysis Date">{analysisDate}</SummaryRow>
        <SummaryRow label="Match Level">
          {matchLevel ? <Badge variant={matchLevelVariant}>{matchLevel}</Badge> : <span className="text-muted-foreground">Unavailable</span>}
        </SummaryRow>
        <SummaryRow label="Key Strengths">
          {keyStrengths.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {keyStrengths.map((skill) => (
                <Badge key={skill} variant="success" className="max-w-full truncate">{skill}</Badge>
              ))}
            </div>
          ) : (
            <NoneIdentified />
          )}
        </SummaryRow>
        <SummaryRow label="Main Gaps">
          {mainGaps.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {mainGaps.map((skill) => (
                <Badge key={skill} variant="default" className="max-w-full truncate">{skill}</Badge>
              ))}
            </div>
          ) : (
            <NoneIdentified />
          )}
        </SummaryRow>
      </dl>
    </Panel>
  )
}

export default MatchSummaryCard
