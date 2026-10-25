// Client-side PDF export for a resume match analysis. No PDF library exists
// in this project yet, so this renders a print-friendly report into a new
// window and lets the browser's native print dialog save it as a PDF -
// avoids pulling in a new dependency for a single "Download Report" button.
import { CATEGORY_LABELS, CATEGORY_ORDER, type ResumeMatchAnalysis } from "@/utils/resumeMatchAnalysis"

const STATUS_LABELS: Record<string, string> = {
  matched: "Matched",
  partial: "Partially matched",
  "not-evidenced": "Not evidenced",
  unclear: "Needs review",
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function listOrNone(items: string[]): string {
  if (items.length === 0) return `<p class="muted">None identified</p>`
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
}

function skillList(skills: { name: string; note?: string }[]): string {
  if (skills.length === 0) return `<p class="muted">None identified</p>`
  return `<ul>${skills
    .map((s) => `<li><strong>${escapeHtml(s.name)}</strong>${s.note ? ` — ${escapeHtml(s.note)}` : ""}</li>`)
    .join("")}</ul>`
}

export function buildResumeMatchReportHtml(analysis: ResumeMatchAnalysis, generatedAt: string): string {
  const scoreRows = CATEGORY_ORDER.map((key) => {
    const entry = analysis.categoryScores.find((c) => c.key === key)
    const score = entry?.score
    const pct = typeof score === "number" ? score : 0
    return `
      <div class="score-row">
        <span class="score-label">${escapeHtml(CATEGORY_LABELS[key])}</span>
        <div class="score-bar"><div class="score-fill" style="width:${pct}%"></div></div>
        <span class="score-value">${typeof score === "number" ? `${score}%` : "—"}</span>
      </div>`
  }).join("")

  const requirementRows = analysis.requirements
    .map(
      (req) => `
    <tr>
      <td>${escapeHtml(req.requirement)}</td>
      <td>${req.category ? escapeHtml(CATEGORY_LABELS[req.category]) : "—"}</td>
      <td>${req.importance ? escapeHtml(req.importance) : "—"}</td>
      <td>${req.status ? escapeHtml(STATUS_LABELS[req.status]) : "Not assessed"}</td>
    </tr>`
    )
    .join("")

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Resume Match Report - ${escapeHtml(analysis.jobTitle)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1a1a1a; padding: 32px; max-width: 880px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 26px 0 10px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 18px; line-height: 1.5; }
  .score-headline { display: flex; align-items: baseline; gap: 10px; margin: 16px 0; }
  .score-big { font-size: 40px; font-weight: 700; }
  .match-level { font-size: 13px; font-weight: 600; padding: 4px 10px; border-radius: 999px; background: #f0f0f0; }
  .score-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 13px; }
  .score-label { width: 170px; flex-shrink: 0; color: #444; }
  .score-bar { flex: 1; height: 8px; background: #eee; border-radius: 999px; overflow: hidden; }
  .score-fill { height: 100%; background: #2563eb; }
  .score-value { width: 42px; text-align: right; color: #444; }
  ul { margin: 0; padding-left: 20px; }
  li { margin-bottom: 4px; font-size: 13px; }
  .muted { color: #888; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 4px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  th { background: #fafafa; font-weight: 600; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>Resume Match Report</h1>
  <div class="meta">
    ${escapeHtml(analysis.jobTitle)}${analysis.companyName ? ` · ${escapeHtml(analysis.companyName)}` : ""}<br />
    Generated ${escapeHtml(generatedAt)}
  </div>

  <div class="score-headline">
    <span class="score-big">${typeof analysis.overallScore === "number" ? `${analysis.overallScore}%` : "—"}</span>
    ${analysis.matchLevel ? `<span class="match-level">${escapeHtml(analysis.matchLevel)}</span>` : ""}
  </div>

  <h2>Category Scores</h2>
  ${scoreRows}

  <h2>Key Strengths &amp; Main Gaps</h2>
  <div class="cols">
    <div>
      <p class="muted">Key strengths</p>
      ${skillList(analysis.matchedSkills.slice(0, 5))}
    </div>
    <div>
      <p class="muted">Main gaps</p>
      ${skillList(analysis.missingSkills.slice(0, 5))}
    </div>
  </div>

  <h2>Requirement-by-Requirement Match</h2>
  <table>
    <thead><tr><th>Requirement</th><th>Category</th><th>Importance</th><th>Status</th></tr></thead>
    <tbody>${requirementRows || `<tr><td colspan="4" class="muted">No requirements were returned.</td></tr>`}</tbody>
  </table>

  <h2>Strengths</h2>
  ${listOrNone(analysis.strengths)}

  <h2>Recommendations</h2>
  ${listOrNone(analysis.recommendations)}
</body>
</html>`
}

// Opens the report in a new window and triggers the browser's print dialog,
// where the candidate can choose "Save as PDF". Returns false when the
// popup was blocked, so the caller can tell them to allow it.
export function downloadResumeMatchReport(analysis: ResumeMatchAnalysis, generatedAt: string): boolean {
  // No "noopener" here on purpose - we need the returned window reference to
  // write the report into it, and some browsers (Firefox, Safari) return null
  // from window.open when "noopener" is set, leaving the opened tab blank.
  const printWindow = window.open("", "_blank")
  if (!printWindow) return false
  const html = buildResumeMatchReportHtml(analysis, generatedAt)
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.onload = () => {
    printWindow.focus()
    printWindow.print()
  }
  return true
}
