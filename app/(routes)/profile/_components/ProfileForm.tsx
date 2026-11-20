"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import {
  Award,
  BriefcaseBusiness,
  CircleAlert,
  CircleCheck,
  FileText,
  FolderOpen,
  GraduationCap,
  LoaderCircle,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Unlink,
  Upload,
  X,
} from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { ResumeImportResponse } from "@/utils/profile/types"
import type { SavedResume } from "@/app/(routes)/_components/SavedResumePicker"
import {
  SCALAR_LABELS,
  certLabel,
  emptyEducationRow,
  emptyProjectRow,
  emptyWorkRow,
  formFromProfile,
  formSignature,
  mergeExtracted,
  toUpdateArgs,
  validateForm,
  type FormErrors,
  type ImportSummary,
  type LoadedProfile,
  type ProfileFormState,
  type ScalarField,
} from "../_lib/formState"
import { TagInput } from "./TagInput"
import { ExistingResumeDialog } from "./ExistingResumeDialog"

const MAX_RESUME_BYTES = 1 * 1024 * 1024

// Convex error text looks like "[CONVEX M(...)] ... Uncaught Error: <msg>".
function convexMessage(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : ""
  return raw.match(/Uncaught Error: ([^\n]+)/)?.[1]?.trim() || fallback
}

// --- Small layout helpers ------------------------------------------------------

function Field({ label, htmlFor, error, children, className }: { label: string; htmlFor: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function SectionHeader({ icon: Icon, title, action }: { icon: React.ComponentType<{ className?: string }>; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="size-4 text-muted-foreground" /> {title}
      </h3>
      {action}
    </div>
  )
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-primary hover:text-primary/80">
      <Plus className="size-3.5" /> {children}
    </button>
  )
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick} className="shrink-0 text-muted-foreground hover:text-destructive">
      <Trash2 />
    </Button>
  )
}

const inputClass = "h-10 bg-card px-3"

// --- Main form ---------------------------------------------------------------------

export function ProfileForm({ userId, profile }: { userId: Id<"UserTable">; profile: LoadedProfile }) {
  const router = useRouter()
  const updateProfile = useMutation(api.ProfessionalProfile.UpdateProfile)

  // State is set once from the loaded profile. Reactive updates after saving
  // don't overwrite what the user is editing.
  const [form, setForm] = useState<ProfileFormState>(() => formFromProfile(profile))
  const [savedSignature, setSavedSignature] = useState(() => formSignature(formFromProfile(profile)))
  const [savedResumeId, setSavedResumeId] = useState<string | null>(profile?.resume?.id ?? null)
  const [linkedResumeName, setLinkedResumeName] = useState<string | null>(profile?.resume?.fileName ?? null)

  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<{ kind: "success" | "error"; message: string } | null>(null)
  const inFlight = useRef(false)

  const [importing, setImporting] = useState<"upload" | "existing" | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const dirty = useMemo(() => formSignature(form) !== savedSignature, [form, savedSignature])
  const locked = saving || importing !== null

  // Warn before leaving the page with unsaved edits, including unsaved imports.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  const set = <K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) => {
    setForm(f => ({ ...f, [key]: value }))
    if (saveState?.kind === "success") setSaveState(null)
  }
  const clearError = (key: string) => {
    if (errors[key]) setErrors(({ [key]: _removed, ...rest }) => rest)
  }

  function updateRow<S extends "workExperience" | "education" | "projects">(
    section: S,
    key: string,
    patch: Partial<ProfileFormState[S][number]>,
    errorKey?: string
  ) {
    setForm(f => ({
      ...f,
      [section]: (f[section] as { key: string }[]).map(r => (r.key === key ? { ...r, ...patch } : r)),
    }))
    if (errorKey) clearError(errorKey)
    if (saveState?.kind === "success") setSaveState(null)
  }
  function removeRow(section: "workExperience" | "education" | "projects", key: string) {
    setForm(f => ({ ...f, [section]: (f[section] as { key: string }[]).filter(r => r.key !== key) }))
  }

  // --- Resume import ---------------------------------------------------------------

  async function runImport(kind: "upload" | "existing", request: () => Promise<Response>) {
    if (locked) return
    setImporting(kind)
    setImportError(null)
    setSaveState(null)
    try {
      const res = await request()
      const data = (await res.json().catch(() => ({}))) as Partial<ResumeImportResponse> & { error?: string }
      if (!res.ok || !data.extracted) throw new Error(data.error || "We couldn't read your resume. Please try again.")
      // The form is locked while importing, so `form` is current here.
      const { form: merged, summary } = mergeExtracted(form, data.extracted, data.sourceFileName ?? "your resume")
      if (data.resume) {
        merged.resumeId = data.resume.id
        setLinkedResumeName(data.resume.fileName)
      }
      setForm(merged)
      setImportSummary(summary)
      setErrors({})
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "We couldn't read your resume. Please try again.")
    } finally {
      setImporting(null)
    }
  }

  function onFileChosen(file: File | undefined) {
    if (fileInputRef.current) fileInputRef.current.value = ""
    if (!file) return
    const name = file.name.toLowerCase()
    const isPdf = file.type === "application/pdf" || name.endsWith(".pdf")
    if (!isPdf) {
      setImportError("Please choose a PDF file.")
      return
    }
    if (file.size > MAX_RESUME_BYTES) {
      setImportError("Your resume must be 1 MB or smaller.")
      return
    }
    const body = new FormData()
    body.append("file", file)
    runImport("upload", () => fetch("/api/profile/resume-import", { method: "POST", body }))
  }

  function onExistingChosen(resume: SavedResume) {
    setPickerOpen(false)
    runImport("existing", () =>
      fetch("/api/profile/resume-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId: resume.id }),
      })
    )
  }

  function resolveConflict(field: ScalarField, useIncoming: boolean) {
    if (!importSummary) return
    const conflict = importSummary.conflicts.find(c => c.field === field)
    if (conflict && useIncoming) set(field, conflict.incoming)
    setImportSummary({ ...importSummary, conflicts: importSummary.conflicts.filter(c => c.field !== field) })
  }

  // --- Save --------------------------------------------------------------------------

  async function save() {
    if (inFlight.current || locked) return
    const found = validateForm(form)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setSaveState({ kind: "error", message: "Please fix the highlighted fields." })
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus()
      })
      return
    }

    inFlight.current = true
    setSaving(true)
    setSaveState(null)
    try {
      const { resumeId, ...rest } = toUpdateArgs(form)
      // Only send the resume when it changed, so the link isn't rewritten on every save.
      await updateProfile({ userId, ...rest, ...(resumeId !== savedResumeId ? { resumeId } : {}) })
      setSavedSignature(formSignature(form))
      setSavedResumeId(resumeId)
      setImportSummary(null)
      setSaveState({ kind: "success", message: "Your professional profile has been saved." })
      // Go to the profile view (M4). The success state shows briefly while it loads.
      router.push("/profile")
    } catch (e) {
      setSaveState({ kind: "error", message: convexMessage(e, "We couldn't save your profile. Please try again.") })
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  const completion = profile?.completion

  return (
    <div className="px-5 py-6 sm:px-8">
      <h2 className="text-base font-semibold text-foreground">Professional Profile</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Used to tailor your mock interviews. Fill it in manually or import from a resume.
      </p>

      {/* Resume import */}
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={e => onFileChosen(e.target.files?.[0])}
        />
        <Button variant="outline" size="lg" disabled={locked} onClick={() => fileInputRef.current?.click()} className="border-primary/50 text-primary">
          {importing === "upload" ? <LoaderCircle className="animate-spin" /> : <Upload />}
          {importing === "upload" ? "Reading resume…" : "Upload resume to fill"}
        </Button>
        <Button variant="outline" size="lg" disabled={locked} onClick={() => setPickerOpen(true)}>
          {importing === "existing" ? <LoaderCircle className="animate-spin" /> : <FileText />}
          {importing === "existing" ? "Reading resume…" : "Use existing resume"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">PDF Only. Maximum size 1 MB. PDFs are also saved to your resume library.</p>

      {linkedResumeName && form.resumeId && (
        <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/40 py-1.5 pr-1.5 pl-3 text-xs text-muted-foreground">
          <FileText className="size-3.5 shrink-0" />
          <span className="truncate">Linked resume: <span className="font-medium text-foreground">{linkedResumeName}</span></span>
          <Button variant="ghost" size="icon-xs" aria-label="Unlink resume from profile" disabled={locked} onClick={() => set("resumeId", null)}>
            <Unlink />
          </Button>
        </div>
      )}

      {importError && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {importError}
        </p>
      )}

      {importSummary && <ImportReview summary={importSummary} onResolve={resolveConflict} onDismiss={() => setImportSummary(null)} />}

      <ExistingResumeDialog open={pickerOpen} onOpenChange={setPickerOpen} onChoose={onExistingChosen} linkedResumeId={form.resumeId} />

      <fieldset disabled={locked} className="mt-6 flex flex-col gap-5">
        {/* Basic information */}
        <Field label="Headline" htmlFor="pf-headline" error={errors.headline}>
          <Input id="pf-headline" className={inputClass} placeholder="Senior Backend Engineer" maxLength={200} value={form.headline} aria-invalid={!!errors.headline}
            onChange={e => { set("headline", e.target.value); clearError("headline") }} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Location" htmlFor="pf-location" error={errors.location}>
            <Input id="pf-location" className={inputClass} placeholder="Berlin, Germany" maxLength={200} value={form.location} aria-invalid={!!errors.location}
              onChange={e => { set("location", e.target.value); clearError("location") }} />
          </Field>
          <Field label="Phone" htmlFor="pf-phone" error={errors.phone}>
            <Input id="pf-phone" type="tel" className={inputClass} placeholder="+1 555 000 0000" maxLength={40} value={form.phone} aria-invalid={!!errors.phone}
              onChange={e => { set("phone", e.target.value); clearError("phone") }} />
          </Field>
        </div>
        <Field label="Summary" htmlFor="pf-summary" error={errors.summary}>
          <Textarea id="pf-summary" className="min-h-24 bg-card px-3" placeholder="A short professional summary." maxLength={5000} value={form.summary} aria-invalid={!!errors.summary}
            onChange={e => { set("summary", e.target.value); clearError("summary") }} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          {(["linkedinUrl", "githubUrl", "websiteUrl"] as const).map(field => (
            <Field key={field} label={SCALAR_LABELS[field]} htmlFor={`pf-${field}`} error={errors[field]}>
              <Input id={`pf-${field}`} type="url" inputMode="url" className={inputClass} placeholder="https://…" maxLength={500} value={form[field]} aria-invalid={!!errors[field]}
                onChange={e => { set(field, e.target.value); clearError(field) }} />
            </Field>
          ))}
        </div>

        {/* Work experience */}
        <section className="flex flex-col gap-3 pt-2">
          <SectionHeader icon={BriefcaseBusiness} title="Work Experience"
            action={<AddButton onClick={() => set("workExperience", [...form.workExperience, emptyWorkRow()])}>Add role</AddButton>} />
          {form.workExperience.map((w, i) => {
            const e = (f: string) => errors[`work.${w.key}.${f}`]
            return (
              <div key={w.key} className="flex flex-col gap-2.5 rounded-xl border border-border p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <Input aria-label={`Position, role ${i + 1}`} className={inputClass} placeholder="Position" maxLength={200} value={w.position} aria-invalid={!!e("position")}
                      onChange={ev => updateRow("workExperience", w.key, { position: ev.target.value }, `work.${w.key}.position`)} />
                    {e("position") && <p className="mt-1 text-xs text-destructive">{e("position")}</p>}
                  </div>
                  <RemoveButton label={`Delete role ${i + 1}`} onClick={() => removeRow("workExperience", w.key)} />
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div>
                    <Input aria-label={`Company, role ${i + 1}`} className={inputClass} placeholder="Company" maxLength={200} value={w.company} aria-invalid={!!e("company")}
                      onChange={ev => updateRow("workExperience", w.key, { company: ev.target.value }, `work.${w.key}.company`)} />
                    {e("company") && <p className="mt-1 text-xs text-destructive">{e("company")}</p>}
                  </div>
                  <Input aria-label={`Employment duration, role ${i + 1}`} className={inputClass} placeholder="2020 – 2024" maxLength={100} value={w.duration}
                    onChange={ev => updateRow("workExperience", w.key, { duration: ev.target.value })} />
                </div>
                <Textarea aria-label={`Responsibilities, role ${i + 1}`} className="min-h-20 bg-card px-3" placeholder="Responsibilities (one per line)" value={w.responsibilities}
                  onChange={ev => updateRow("workExperience", w.key, { responsibilities: ev.target.value })} />
              </div>
            )
          })}
        </section>

        {/* Education */}
        <section className="flex flex-col gap-3">
          <SectionHeader icon={GraduationCap} title="Education"
            action={<AddButton onClick={() => set("education", [...form.education, emptyEducationRow()])}>Add education</AddButton>} />
          {form.education.map((ed, i) => {
            const e = (f: string) => errors[`education.${ed.key}.${f}`]
            return (
              <div key={ed.key} className="flex flex-col gap-2.5 rounded-xl border border-border p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <Input aria-label={`Institution, education ${i + 1}`} className={inputClass} placeholder="Institution" maxLength={200} value={ed.institution} aria-invalid={!!e("institution")}
                      onChange={ev => updateRow("education", ed.key, { institution: ev.target.value }, `education.${ed.key}.institution`)} />
                    {e("institution") && <p className="mt-1 text-xs text-destructive">{e("institution")}</p>}
                  </div>
                  <RemoveButton label={`Delete education ${i + 1}`} onClick={() => removeRow("education", ed.key)} />
                </div>
                <div className="grid gap-2.5 sm:grid-cols-[1fr_1fr_8rem]">
                  <Input aria-label={`Degree, education ${i + 1}`} className={inputClass} placeholder="Degree" maxLength={200} value={ed.degree}
                    onChange={ev => updateRow("education", ed.key, { degree: ev.target.value })} />
                  <Input aria-label={`Field of study, education ${i + 1}`} className={inputClass} placeholder="Field of study" maxLength={200} value={ed.fieldOfStudy}
                    onChange={ev => updateRow("education", ed.key, { fieldOfStudy: ev.target.value })} />
                  <div>
                    <Input aria-label={`Graduation year, education ${i + 1}`} inputMode="numeric" className={inputClass} placeholder="Year" maxLength={4} value={ed.graduationYear} aria-invalid={!!e("graduationYear")}
                      onChange={ev => updateRow("education", ed.key, { graduationYear: ev.target.value.replace(/\D/g, "") }, `education.${ed.key}.graduationYear`)} />
                    {e("graduationYear") && <p className="mt-1 text-xs text-destructive">{e("graduationYear")}</p>}
                  </div>
                </div>
              </div>
            )
          })}
        </section>

        {/* Skills */}
        <Field label="Skills" htmlFor="pf-skills">
          <TagInput id="pf-skills" itemLabel="skill" placeholder="Type a skill and press Enter" maxTags={100} maxLength={60}
            tags={form.skills}
            onAdd={tag => set("skills", [...form.skills, tag])}
            onRemove={i => set("skills", form.skills.filter((_, idx) => idx !== i))} />
        </Field>

        {/* Certifications */}
        <Field label="Certifications" htmlFor="pf-certifications">
          <TagInput id="pf-certifications" itemLabel="certification" placeholder="Type a certification and press Enter" maxTags={50} maxLength={200}
            tags={form.certifications.map(certLabel)}
            onAdd={name => set("certifications", [...form.certifications, { name }])}
            onRemove={i => set("certifications", form.certifications.filter((_, idx) => idx !== i))} />
        </Field>

        {/* Projects */}
        <section className="flex flex-col gap-3">
          <SectionHeader icon={FolderOpen} title="Projects"
            action={<AddButton onClick={() => set("projects", [...form.projects, emptyProjectRow()])}>Add project</AddButton>} />
          {form.projects.map((p, i) => {
            const err = errors[`project.${p.key}.title`]
            return (
              <div key={p.key} className="flex flex-col gap-2.5 rounded-xl border border-border p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <Input aria-label={`Project title, project ${i + 1}`} className={inputClass} placeholder="Project title" maxLength={200} value={p.title} aria-invalid={!!err}
                      onChange={ev => updateRow("projects", p.key, { title: ev.target.value }, `project.${p.key}.title`)} />
                    {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
                  </div>
                  <RemoveButton label={`Delete project ${i + 1}`} onClick={() => removeRow("projects", p.key)} />
                </div>
                <Textarea aria-label={`Project description, project ${i + 1}`} className="min-h-20 bg-card px-3" placeholder="Project description" maxLength={5000} value={p.description}
                  onChange={ev => updateRow("projects", p.key, { description: ev.target.value })} />
              </div>
            )
          })}
        </section>
      </fieldset>

      {/* Save */}
      <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-h-5 text-sm" aria-live="polite">
          {saveState?.kind === "success" ? (
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5 font-medium text-success"><CircleCheck className="size-4" /> {saveState.message}</span>
              {completion && (
                <span className="text-xs text-muted-foreground">
                  {completion.isComplete
                    ? "Your profile is complete."
                    : `Profile ${completion.percent}% complete. Still missing: ${completion.missing.map(missingLabel).join(", ")}.`}
                </span>
              )}
            </span>
          ) : saveState?.kind === "error" ? (
            <span role="alert" className="flex items-center gap-1.5 text-destructive"><CircleAlert className="size-4" /> {saveState.message}</span>
          ) : dirty ? (
            <span className="text-muted-foreground">You have unsaved changes.</span>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="lg"
            disabled={locked}
            nativeButton={false}
            render={<Link href="/profile" />}
            onClick={e => {
              if (dirty && !window.confirm("Discard your unsaved changes?")) e.preventDefault()
            }}
            className="h-10 px-4 text-muted-foreground"
          >
            Cancel
          </Button>
          <Button size="lg" onClick={save} disabled={locked} className="h-10 px-5">
            {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
            {saving ? "Saving…" : "Save Profile"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function missingLabel(field: string): string {
  switch (field) {
    case "headline": return "headline"
    case "professionalSummary": return "summary"
    case "location": return "location"
    case "skills": return "at least one skill"
    case "experienceOrEducation": return "work experience or education"
    default: return field
  }
}

// Summary of a resume import, plus a decision for each field where the
// resume disagrees with what the user has already entered.
function ImportReview({
  summary,
  onResolve,
  onDismiss,
}: {
  summary: ImportSummary
  onResolve: (field: ScalarField, useIncoming: boolean) => void
  onDismiss: () => void
}) {
  const added = [
    summary.filledFields.length && `filled ${summary.filledFields.length} field${summary.filledFields.length === 1 ? "" : "s"}`,
    summary.addedWork && `added ${summary.addedWork} role${summary.addedWork === 1 ? "" : "s"}`,
    summary.addedEducation && `${summary.addedEducation} education entr${summary.addedEducation === 1 ? "y" : "ies"}`,
    summary.addedSkills && `${summary.addedSkills} skill${summary.addedSkills === 1 ? "" : "s"}`,
    summary.addedCertifications && `${summary.addedCertifications} certification${summary.addedCertifications === 1 ? "" : "s"}`,
    summary.addedProjects && `${summary.addedProjects} project${summary.addedProjects === 1 ? "" : "s"}`,
  ].filter(Boolean) as string[]

  return (
    <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Imported from {summary.sourceFileName}</p>
            <p className="mt-0.5 text-muted-foreground">
              {added.length > 0
                ? `We ${added.join(", ")}. Review the details below, correct anything that's off, then click Save Profile.`
                : summary.conflicts.length > 0
                  ? "Your profile already covers this resume, apart from the differences below."
                  : "Nothing new found. Your profile already includes the details from this resume."}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Dismiss import summary" onClick={onDismiss}>
          <X />
        </Button>
      </div>

      {summary.conflicts.length > 0 && (
        <div className="mt-4 flex flex-col gap-2.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Award className="size-3.5 text-primary" /> These fields already had your own values, which we kept. Choose which to use:
          </p>
          {summary.conflicts.map(c => (
            <div key={c.field} className="rounded-lg border border-border bg-card p-3 text-sm">
              <p className="font-medium text-foreground">{SCALAR_LABELS[c.field]}</p>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Yours</p>
                  <p className="line-clamp-3 break-words text-foreground">{c.current}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">From resume</p>
                  <p className="line-clamp-3 break-words text-foreground">{c.incoming}</p>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onResolve(c.field, false)}>Keep mine</Button>
                <Button size="sm" onClick={() => onResolve(c.field, true)}>Use resume value</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
