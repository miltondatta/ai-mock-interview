import type { FunctionReturnType } from "convex/server"
import type { api } from "@/convex/_generated/api"
import type { ExtractedProfile } from "@/utils/profile/types"

export type LoadedProfile = FunctionReturnType<typeof api.ProfessionalProfile.GetMyProfile>

// Form state for the Professional Profile. Every value is a plain string
// while it's being edited and is converted to the Convex shape on save.
// Rows carry a client-only `key` for stable React keys.

export interface WorkRow {
  key: string
  position: string
  company: string
  duration: string
  // One responsibility per line.
  responsibilities: string
  // Stored date fields this form doesn't edit. They're sent back unchanged
  // as long as the duration text wasn't edited, so an unrelated save never
  // drops them.
  original?: { duration?: string; startDate?: string; endDate?: string; isCurrent?: boolean }
}

export interface EducationRow {
  key: string
  institution: string
  degree: string
  fieldOfStudy: string
  graduationYear: string
}

export interface ProjectRow {
  key: string
  title: string
  description: string
  // Not edited in this form. Kept so a saved project URL isn't lost.
  url?: string
}

export interface Certification {
  name: string
  // Not edited here (certifications are tags). Kept so existing details survive a save.
  issuer?: string
  year?: number
  credentialUrl?: string
}

export interface ProfileFormState {
  headline: string
  location: string
  phone: string
  summary: string
  linkedinUrl: string
  githubUrl: string
  websiteUrl: string
  workExperience: WorkRow[]
  education: EducationRow[]
  skills: string[]
  certifications: Certification[]
  projects: ProjectRow[]
  resumeId: string | null
}

export type ScalarField = "headline" | "location" | "phone" | "summary" | "linkedinUrl" | "githubUrl" | "websiteUrl"

export const SCALAR_LABELS: Record<ScalarField, string> = {
  headline: "Headline",
  location: "Location",
  phone: "Phone",
  summary: "Summary",
  linkedinUrl: "LinkedIn",
  githubUrl: "GitHub",
  websiteUrl: "Website",
}

let keySeq = 0
export const newKey = () => `row-${Date.now().toString(36)}-${(keySeq++).toString(36)}`

export const emptyWorkRow = (): WorkRow => ({ key: newKey(), position: "", company: "", duration: "", responsibilities: "" })
export const emptyEducationRow = (): EducationRow => ({ key: newKey(), institution: "", degree: "", fieldOfStudy: "", graduationYear: "" })
export const emptyProjectRow = (): ProjectRow => ({ key: newKey(), title: "", description: "" })

// Older entries may only have start/end dates. Show them as the duration
// text, which is what this form edits.
function durationOf(w: { duration?: string; startDate?: string; endDate?: string; isCurrent?: boolean }): string {
  if (w.duration) return w.duration
  if (!w.startDate && !w.endDate && !w.isCurrent) return ""
  return `${w.startDate ?? ""} – ${w.isCurrent ? "Present" : w.endDate ?? ""}`.trim()
}

export function formFromProfile(p: LoadedProfile): ProfileFormState {
  return {
    headline: p?.headline ?? "",
    location: p?.location ?? "",
    phone: p?.phone ?? "",
    summary: p?.professionalSummary ?? "",
    linkedinUrl: p?.linkedinUrl ?? "",
    githubUrl: p?.githubUrl ?? "",
    websiteUrl: p?.websiteUrl ?? "",
    workExperience: (p?.workExperience ?? []).map(w => ({
      key: newKey(),
      position: w.position,
      company: w.company,
      duration: durationOf(w),
      responsibilities: (w.responsibilities ?? []).join("\n"),
      original: { duration: w.duration, startDate: w.startDate, endDate: w.endDate, isCurrent: w.isCurrent },
    })),
    education: (p?.education ?? []).map(e => ({
      key: newKey(),
      institution: e.institution,
      degree: e.degree ?? "",
      fieldOfStudy: e.fieldOfStudy ?? "",
      graduationYear: e.graduationYear ? String(e.graduationYear) : "",
    })),
    skills: p?.skills ?? [],
    certifications: p?.certifications ?? [],
    projects: (p?.projects ?? []).map(pr => ({ key: newKey(), title: pr.title, description: pr.description ?? "", url: pr.url })),
    // Only a resume that's still in the user's library (resolved server-side).
    resumeId: p?.resume?.id ?? null,
  }
}

// "Name, Issuer, Year", the label the reference design uses for certification chips.
export function certLabel(c: Certification): string {
  return [c.name, c.issuer, c.year ? String(c.year) : undefined].filter(Boolean).join(", ")
}

// Whether the user has saved any professional-profile content. Onboarding can
// create the profile row on its own, so the row existing isn't enough to count
// as "has a profile". Used to choose Set Up versus Edit, and the view page's
// empty state.
export function hasProfessionalData(p: LoadedProfile): boolean {
  if (!p) return false
  return !!(
    p.headline || p.professionalSummary || p.location || p.phone ||
    p.linkedinUrl || p.githubUrl || p.websiteUrl ||
    p.workExperience?.length || p.education?.length || p.skills?.length ||
    p.certifications?.length || p.projects?.length || p.resume
  )
}

// --- Validation -----------------------------------------------------------------

export type FormErrors = Partial<Record<string, string>>

const URL_FIELDS: ScalarField[] = ["linkedinUrl", "githubUrl", "websiteUrl"]

function isValidUrl(value: string): boolean {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
  try {
    const u = new URL(withScheme)
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".")
  } catch {
    return false
  }
}

const isBlankWork = (w: WorkRow) => !w.position.trim() && !w.company.trim() && !w.duration.trim() && !w.responsibilities.trim()
const isBlankEducation = (e: EducationRow) => !e.institution.trim() && !e.degree.trim() && !e.fieldOfStudy.trim() && !e.graduationYear.trim()
const isBlankProject = (p: ProjectRow) => !p.title.trim() && !p.description.trim()

// Mirrors the server rules in convex/ProfessionalProfile.ts, so most problems
// are shown next to their field before saving. Error keys are field names or
// "<section>.<rowKey>.<field>".
export function validateForm(f: ProfileFormState): FormErrors {
  const errors: FormErrors = {}
  if (f.headline.trim().length > 200) errors.headline = "Keep the headline under 200 characters."
  if (f.location.trim().length > 200) errors.location = "Keep the location under 200 characters."
  if (f.phone.trim() && !/^[+0-9()\-.\s]{5,40}$/.test(f.phone.trim())) errors.phone = "Use digits, spaces and + ( ) - . only."
  if (f.summary.trim().length > 5000) errors.summary = "Keep the summary under 5,000 characters."
  for (const field of URL_FIELDS) {
    const v = f[field].trim()
    if (v && !isValidUrl(v)) errors[field] = "Enter a valid web address."
  }
  for (const w of f.workExperience) {
    if (isBlankWork(w)) continue
    if (!w.position.trim()) errors[`work.${w.key}.position`] = "Position is required."
    if (!w.company.trim()) errors[`work.${w.key}.company`] = "Company is required."
  }
  const maxYear = new Date().getFullYear() + 10
  for (const e of f.education) {
    if (isBlankEducation(e)) continue
    if (!e.institution.trim()) errors[`education.${e.key}.institution`] = "Institution is required."
    const y = e.graduationYear.trim()
    if (y && (!/^\d{4}$/.test(y) || Number(y) < 1950 || Number(y) > maxYear)) {
      errors[`education.${e.key}.graduationYear`] = `Enter a year between 1950 and ${maxYear}.`
    }
  }
  for (const p of f.projects) {
    if (isBlankProject(p)) continue
    if (!p.title.trim()) errors[`project.${p.key}.title`] = "Project title is required."
  }
  return errors
}

// Converts the form to UpdateProfile arguments. Every section is sent, so an
// emptied field is cleared on the server. Blank rows are dropped.
export function toUpdateArgs(f: ProfileFormState) {
  return {
    headline: f.headline,
    location: f.location,
    phone: f.phone,
    professionalSummary: f.summary,
    linkedinUrl: f.linkedinUrl,
    githubUrl: f.githubUrl,
    websiteUrl: f.websiteUrl,
    workExperience: f.workExperience.filter(w => !isBlankWork(w)).map(w => {
      const responsibilities = w.responsibilities.split("\n").map(r => r.trim()).filter(Boolean)
      // Duration untouched: send the stored fields back as they were.
      if (w.original && w.duration === durationOf(w.original)) {
        return {
          position: w.position,
          company: w.company,
          duration: w.original.duration,
          startDate: w.original.startDate,
          endDate: w.original.endDate,
          isCurrent: w.original.isCurrent,
          responsibilities,
        }
      }
      return { position: w.position, company: w.company, duration: w.duration || undefined, responsibilities }
    }),
    education: f.education.filter(e => !isBlankEducation(e)).map(e => ({
      institution: e.institution,
      degree: e.degree || undefined,
      fieldOfStudy: e.fieldOfStudy || undefined,
      graduationYear: e.graduationYear.trim() ? Number(e.graduationYear) : undefined,
    })),
    skills: f.skills,
    certifications: f.certifications,
    projects: f.projects.filter(p => !isBlankProject(p)).map(p => ({
      title: p.title,
      description: p.description || undefined,
      url: p.url,
    })),
    resumeId: f.resumeId,
  }
}

// Snapshot used to detect unsaved changes. Row keys are left out so that
// regenerated keys don't count as edits.
export function formSignature(f: ProfileFormState): string {
  return JSON.stringify(toUpdateArgs(f))
}

// --- Resume import merge ----------------------------------------------------------

export interface ImportConflict {
  field: ScalarField
  current: string
  incoming: string
}

export interface ImportSummary {
  sourceFileName: string
  filledFields: ScalarField[]
  addedWork: number
  addedEducation: number
  addedSkills: number
  addedCertifications: number
  addedProjects: number
  conflicts: ImportConflict[]
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ")

// Merges extracted resume details into the form without overwriting anything
// the user already has:
//   - an empty text field is filled in
//   - a filled field with a different value becomes a conflict for the user
//     to decide, and the form keeps the user's value
//   - list sections get only new entries appended (de-duplicated against
//     what's there), and existing rows are never edited
// Nothing is saved until the user reviews the form and clicks Save Profile.
export function mergeExtracted(
  form: ProfileFormState,
  x: ExtractedProfile,
  sourceFileName: string
): { form: ProfileFormState; summary: ImportSummary } {
  const next: ProfileFormState = { ...form }
  const summary: ImportSummary = {
    sourceFileName,
    filledFields: [],
    addedWork: 0,
    addedEducation: 0,
    addedSkills: 0,
    addedCertifications: 0,
    addedProjects: 0,
    conflicts: [],
  }

  const incomingScalars: Record<ScalarField, string> = {
    headline: x.headline,
    location: x.location,
    phone: x.phone,
    summary: x.summary,
    linkedinUrl: x.linkedinUrl,
    githubUrl: x.githubUrl,
    websiteUrl: x.websiteUrl,
  }
  for (const field of Object.keys(incomingScalars) as ScalarField[]) {
    const incoming = incomingScalars[field].trim()
    if (!incoming) continue
    const current = form[field].trim()
    if (!current) {
      next[field] = incoming
      summary.filledFields.push(field)
    } else if (norm(current) !== norm(incoming)) {
      summary.conflicts.push({ field, current, incoming })
    }
  }

  // Blank placeholder rows are swapped out for imported entries rather than
  // left above them.
  const work = form.workExperience.filter(w => !isBlankWork(w))
  const workKeys = new Set(work.map(w => `${norm(w.position)}|${norm(w.company)}`))
  for (const w of x.workExperience) {
    const k = `${norm(w.position)}|${norm(w.company)}`
    if (workKeys.has(k)) continue
    workKeys.add(k)
    work.push({ key: newKey(), position: w.position, company: w.company, duration: w.duration, responsibilities: w.responsibilities.join("\n") })
    summary.addedWork++
  }
  if (summary.addedWork > 0) next.workExperience = work

  const edu = form.education.filter(e => !isBlankEducation(e))
  const eduKeys = new Set(edu.map(e => `${norm(e.institution)}|${norm(e.degree)}`))
  for (const e of x.education) {
    const k = `${norm(e.institution)}|${norm(e.degree)}`
    if (eduKeys.has(k)) continue
    eduKeys.add(k)
    edu.push({
      key: newKey(),
      institution: e.institution,
      degree: e.degree,
      fieldOfStudy: e.fieldOfStudy,
      graduationYear: e.graduationYear ? String(e.graduationYear) : "",
    })
    summary.addedEducation++
  }
  if (summary.addedEducation > 0) next.education = edu

  const skillKeys = new Set(form.skills.map(norm))
  const skills = [...form.skills]
  for (const s of x.skills) {
    if (skillKeys.has(norm(s)) || skills.length >= 100) continue
    skillKeys.add(norm(s))
    skills.push(s)
    summary.addedSkills++
  }
  next.skills = skills

  const certKeys = new Set(form.certifications.map(c => norm(c.name)))
  const certs = [...form.certifications]
  for (const c of x.certifications) {
    if (certKeys.has(norm(c)) || certs.length >= 50) continue
    certKeys.add(norm(c))
    certs.push({ name: c })
    summary.addedCertifications++
  }
  next.certifications = certs

  const projects = form.projects.filter(p => !isBlankProject(p))
  const projectKeys = new Set(projects.map(p => norm(p.title)))
  for (const p of x.projects) {
    if (projectKeys.has(norm(p.title))) continue
    projectKeys.add(norm(p.title))
    projects.push({ key: newKey(), title: p.title, description: p.description })
    summary.addedProjects++
  }
  if (summary.addedProjects > 0) next.projects = projects

  return { form: next, summary }
}
