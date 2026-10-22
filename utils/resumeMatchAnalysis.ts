// Normalizes the Resume Job Match n8n webhook response into the shape the
// Resume Match Analyzer screen renders.
//
// The workflow's "Calculate Score" node returns:
//   { success, analysisStatus, jobTitle, companyName, jobDescriptionSource,
//     overallScore, matchLevel,
//     categoryScores: { requiredSkills, experience, responsibilities, education, preferredSkills },
//     requirements: [{ requirementId, requirement, category, importance, evidenceCriteria }],
//     requirementEvidence: [{ requirementId, status, resumeEvidence, explanation }],
//     matchedSkills[], missingSkills[], unclearSkills[], strengths[],
//     recommendations[], interviewFocusAreas[], lang }
//
// Every score comes from n8n - nothing here calculates or fills in a score.
// The list fields are free-form Gemini output (strings or small objects), so
// they are coerced defensively, and anything invalid is dropped or reported as
// unavailable rather than invented.

export type CategoryKey =
    | "requiredSkills"
    | "experience"
    | "responsibilities"
    | "education"
    | "preferredSkills"

export type RequirementStatus = "matched" | "partial" | "not-evidenced" | "unclear"

export interface CategoryScore {
    key: CategoryKey
    label: string
    // null when n8n didn't return a valid 0-100 number.
    score: number | null
}

export interface AnalysisSkill {
    name: string
    note?: string
}

export interface AnalysisRequirement {
    id: string
    requirement: string
    category: CategoryKey | null
    importance: "required" | "preferred" | null
    evidenceCriteria?: string
    // null when n8n returned no evidence entry for this requirement.
    status: RequirementStatus | null
    resumeEvidence?: string
    explanation?: string
}

export interface ResumeMatchAnalysis {
    jobTitle: string
    companyName?: string
    jobDescriptionSource: "text" | "url" | null
    overallScore: number | null
    matchLevel: string | null
    categoryScores: CategoryScore[]
    matchedSkills: AnalysisSkill[]
    missingSkills: AnalysisSkill[]
    unclearSkills: AnalysisSkill[]
    requirements: AnalysisRequirement[]
    strengths: string[]
    recommendations: string[]
    interviewFocusAreas: string[]
    lang: string | null
}

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
    requiredSkills: "Required skills",
    experience: "Relevant experience",
    responsibilities: "Responsibilities",
    education: "Education / Certifications",
    preferredSkills: "Preferred skills",
}

export const CATEGORY_ORDER: CategoryKey[] = [
    "requiredSkills",
    "experience",
    "responsibilities",
    "education",
    "preferredSkills",
]

export class ResumeMatchResponseError extends Error {}

const MAX_TEXT = 2000
const MAX_ITEMS = 100

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

function cleanText(value: unknown): string | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
    if (typeof value !== "string") return undefined
    const text = value.trim()
    return text ? text.slice(0, MAX_TEXT) : undefined
}

function pickText(item: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
        const text = cleanText(item[key])
        if (text) return text
    }
    return undefined
}

function toScore(value: unknown): number | null {
    const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100) return null
    return Math.round(n)
}

function toArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value.slice(0, MAX_ITEMS) : []
}

const SKILL_NAME_KEYS = ["skill", "name", "skillName", "title", "label", "area", "requirement"]
const SKILL_NOTE_KEYS = ["note", "notes", "reason", "explanation", "evidence", "resumeEvidence", "details", "description"]

function toSkills(value: unknown): AnalysisSkill[] {
    const skills: AnalysisSkill[] = []
    for (const item of toArray(value)) {
        if (typeof item === "string") {
            const name = cleanText(item)
            if (name) skills.push({ name })
        } else if (isRecord(item)) {
            const name = pickText(item, SKILL_NAME_KEYS)
            if (name) skills.push({ name, note: pickText(item, SKILL_NOTE_KEYS) })
        }
    }
    return skills
}

// strengths / recommendations / interviewFocusAreas - strings, or objects
// like { area, reason } that are flattened to "area: reason".
function toTextList(value: unknown): string[] {
    const items: string[] = []
    for (const item of toArray(value)) {
        if (typeof item === "string") {
            const text = cleanText(item)
            if (text) items.push(text)
        } else if (isRecord(item)) {
            const title = pickText(item, ["title", "area", "skill", "name", "topic", "strength", "recommendation"])
            const detail = pickText(item, ["description", "reason", "details", "explanation", "action", "suggestion", "text"])
            const text = title && detail ? `${title}: ${detail}` : title ?? detail
            if (text) items.push(text)
        }
    }
    return items
}

function toCategory(value: unknown): CategoryKey | null {
    return typeof value === "string" && (CATEGORY_ORDER as string[]).includes(value) ? (value as CategoryKey) : null
}

function toStatus(value: unknown): RequirementStatus | null {
    if (typeof value !== "string") return null
    switch (value.trim().toLowerCase().replace(/[\s-]+/g, "_")) {
        case "matched":
            return "matched"
        case "partially_matched":
        case "partial":
            return "partial"
        case "not_evidenced":
        case "not_matched":
            return "not-evidenced"
        case "unclear":
            return "unclear"
        default:
            return null
    }
}

function toRequirements(requirementsRaw: unknown, evidenceRaw: unknown): AnalysisRequirement[] {
    const evidenceById = new Map<string, Record<string, unknown>>()
    for (const entry of toArray(evidenceRaw)) {
        if (!isRecord(entry)) continue
        const id = cleanText(entry.requirementId)
        if (id && !evidenceById.has(id)) evidenceById.set(id, entry)
    }

    const requirements: AnalysisRequirement[] = []
    const seen = new Set<string>()
    for (const [index, item] of toArray(requirementsRaw).entries()) {
        if (!isRecord(item)) continue
        const text = cleanText(item.requirement)
        if (!text) continue
        const id = cleanText(item.requirementId) ?? `req-${index}`
        seen.add(id)
        const evidence = evidenceById.get(id)
        const importance = cleanText(item.importance)?.toLowerCase()
        requirements.push({
            id,
            requirement: text,
            category: toCategory(item.category),
            importance: importance === "required" || importance === "preferred" ? importance : null,
            evidenceCriteria: cleanText(item.evidenceCriteria),
            status: evidence ? toStatus(evidence.status) : null,
            resumeEvidence: evidence ? cleanText(evidence.resumeEvidence) : undefined,
            explanation: evidence ? cleanText(evidence.explanation) : undefined,
        })
    }

    // Evidence for a requirement the requirement list didn't include - keep it
    // only when the entry itself says which requirement it is about.
    for (const [id, evidence] of evidenceById) {
        if (seen.has(id)) continue
        const text = pickText(evidence, ["requirement", "requirementText"])
        if (!text) continue
        requirements.push({
            id,
            requirement: text,
            category: toCategory(evidence.category),
            importance: null,
            status: toStatus(evidence.status),
            resumeEvidence: cleanText(evidence.resumeEvidence),
            explanation: cleanText(evidence.explanation),
        })
    }
    return requirements
}

// n8n's Respond to Webhook node returns the object directly, but tolerate it
// arriving as a JSON string or wrapped in a one-item array.
function unwrap(raw: unknown): unknown {
    let value = raw
    if (typeof value === "string") {
        try {
            value = JSON.parse(value)
        } catch {
            throw new ResumeMatchResponseError("The analysis service returned invalid JSON.")
        }
    }
    if (Array.isArray(value) && value.length === 1) value = value[0]
    return value
}

export function normalizeResumeMatchResponse(raw: unknown, fallbackJobTitle: string): ResumeMatchAnalysis {
    const data = unwrap(raw)
    if (!isRecord(data)) {
        throw new ResumeMatchResponseError("The analysis service returned an unexpected response.")
    }
    if (data.success !== true || (data.analysisStatus !== undefined && data.analysisStatus !== "completed")) {
        throw new ResumeMatchResponseError("The analysis did not complete.")
    }

    const scores = isRecord(data.categoryScores) ? data.categoryScores : {}
    const analysis: ResumeMatchAnalysis = {
        jobTitle: cleanText(data.jobTitle) ?? fallbackJobTitle,
        companyName: cleanText(data.companyName),
        jobDescriptionSource:
            data.jobDescriptionSource === "text" || data.jobDescriptionSource === "url" ? data.jobDescriptionSource : null,
        overallScore: toScore(data.overallScore),
        matchLevel: cleanText(data.matchLevel) ?? null,
        categoryScores: CATEGORY_ORDER.map((key) => ({ key, label: CATEGORY_LABELS[key], score: toScore(scores[key]) })),
        matchedSkills: toSkills(data.matchedSkills),
        missingSkills: toSkills(data.missingSkills),
        unclearSkills: toSkills(data.unclearSkills),
        requirements: toRequirements(data.requirements, data.requirementEvidence),
        strengths: toTextList(data.strengths),
        recommendations: toTextList(data.recommendations),
        interviewFocusAreas: toTextList(data.interviewFocusAreas),
        lang: cleanText(data.lang) ?? null,
    }

    // A "successful" response with no score and nothing to show is not a
    // usable analysis - surface it as a failure instead of an empty result.
    if (analysis.overallScore === null && analysis.requirements.length === 0) {
        throw new ResumeMatchResponseError("The analysis service returned an incomplete result.")
    }
    return analysis
}
