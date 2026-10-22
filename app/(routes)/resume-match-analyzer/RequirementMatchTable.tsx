import React from "react"
import { Panel, StatusBadge } from "./shared"
import type { AnalysisRequirement } from "@/utils/resumeMatchAnalysis"

function RequirementMatchTable({ requirements }: { requirements: AnalysisRequirement[] }) {
  return (
    <Panel className="p-0">
      <h2 className="px-5 pt-5 text-base font-semibold">Requirement Match Details</h2>
      {requirements.length === 0 ? (
        <p className="px-5 pt-3 pb-5 text-sm text-muted-foreground">No requirement details were returned for this analysis.</p>
      ) : (
        <div className="mt-3 overflow-x-auto px-5 pb-5">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <caption className="sr-only">Job requirements compared against the selected resume</caption>
            <thead>
              <tr className="bg-muted/70 text-xs text-muted-foreground">
                <th scope="col" className="rounded-l-lg px-3 py-2 font-medium">Job Requirement</th>
                <th scope="col" className="px-3 py-2 font-medium">Match Status</th>
                <th scope="col" className="px-3 py-2 font-medium">Evidence from Resume</th>
                <th scope="col" className="rounded-r-lg px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map((row) => (
                <tr key={row.id} className="border-b border-border align-top last:border-b-0">
                  <td className="px-3 py-3 font-medium">{row.requirement}</td>
                  <td className="px-3 py-3"><StatusBadge status={row.status} /></td>
                  <td className="px-3 py-3 text-foreground/75">
                    {row.resumeEvidence ? <>&ldquo;{row.resumeEvidence}&rdquo;</> : <span className="text-muted-foreground">Not found in resume</span>}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{row.explanation ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

export default RequirementMatchTable
