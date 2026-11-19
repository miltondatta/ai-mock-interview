"use client"

import React, { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  BriefcaseBusiness,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Clock,
  CloudUpload,
  FileText,
  LoaderCircle,
  Minus,
  Plus,
  X,
} from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  INTENT_OPTIONS,
  INTERVIEW_TIMELINE_OPTIONS,
  MAX_RESUME_BYTES,
  MAX_YEARS_OF_EXPERIENCE,
  POPULAR_ROLES,
  PRODUCT_NAME,
  REFERRAL_OPTIONS,
  STEP,
  STEP_COUNT,
  WEEKLY_AVAILABILITY_OPTIONS,
  type UserIntent,
} from "../constants"
import { StepIndicator } from "./StepIndicator"
import { SelectCard } from "./SelectCard"
import { JobTitleCombobox } from "./JobTitleCombobox"
import { ReferralIcon } from "./ReferralIcon"

export type OnboardingProfile = FunctionReturnType<typeof api.ProfessionalProfile.GetMyProfile>

// Minimum time the "Personalizing..." screen stays up, so it doesn't just flash.
const MIN_FINISH_SCREEN_MS = 1500

// The onboarding fields SaveOnboarding accepts (userId and step are added on save).
interface OnboardingPayload {
  userIntent?: UserIntent
  targetJobRole?: string
  yearsOfExperience?: number
  targetCompany?: string
  interviewTimeline?: string
  weeklyAvailability?: string
  referralSource?: string
}

interface LinkedResume {
  id: string
  fileName: string
}

// Convex error messages look like "[CONVEX M(...)] ... Uncaught Error: <msg>".
// Only <msg> is shown.
function errorMessage(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : ""
  const match = raw.match(/Uncaught Error: ([^\n]+)/)
  return match?.[1]?.trim() || fallback
}

// Where to reopen the wizard: the saved step, adjusted to what's actually
// answered. With no intent saved it's the intent screen; for hiring it's the
// referral step, because the candidate steps don't apply.
function initialStep(profile: OnboardingProfile): number {
  if (!profile?.userIntent) return STEP.intent
  if (profile.userIntent === "hiring") return STEP.referral
  const saved = profile.onboardingStep ?? STEP.role
  return Math.min(Math.max(saved, STEP.role), STEP.referral)
}

function parseYears(text: string): number | null {
  if (text.trim() === "") return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

export function OnboardingWizard({ userId, profile }: { userId: Id<"UserTable">; profile: OnboardingProfile }) {
  const router = useRouter()
  const saveOnboarding = useMutation(api.ProfessionalProfile.SaveOnboarding)
  const updateProfile = useMutation(api.ProfessionalProfile.UpdateProfile)

  // Answers live here for the whole wizard, so moving back and forth keeps
  // them even for steps that were skipped rather than saved.
  const [step, setStep] = useState(() => initialStep(profile))
  const [intent, setIntent] = useState<UserIntent | undefined>(profile?.userIntent)
  const [role, setRole] = useState(profile?.targetJobRole ?? "")
  const [years, setYears] = useState(
    profile?.yearsOfExperience !== undefined ? String(profile.yearsOfExperience) : ""
  )
  const [company, setCompany] = useState(profile?.targetCompany ?? "")
  const [timeline, setTimeline] = useState(profile?.interviewTimeline)
  const [availability, setAvailability] = useState(profile?.weeklyAvailability)
  const [referral, setReferral] = useState(profile?.referralSource)
  const [resume, setResume] = useState<LinkedResume | null>(
    profile?.resume ? { id: profile.resume.id, fileName: profile.resume.fileName } : null
  )

  const [busy, setBusy] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A synchronous guard, because a fast double-click can land before the
  // `busy` state update re-renders the disabled buttons.
  const inFlight = useRef(false)

  const yearsValue = parseYears(years)
  const yearsInvalid =
    years.trim() !== "" &&
    (yearsValue === null || yearsValue < 0 || yearsValue > MAX_YEARS_OF_EXPERIENCE)

  const canAdvance: Record<number, boolean> = {
    [STEP.role]: role.trim().length > 0,
    [STEP.experience]: yearsValue !== null && !yearsInvalid,
    [STEP.timeline]: !!timeline && !!availability,
    [STEP.resume]: !uploading,
    [STEP.referral]: !!referral,
  }

  // Saves `payload` together with the step being moved to, then moves there.
  // Nothing moves if the save fails, so the wizard never gets ahead of what's stored.
  async function saveAndGo(nextStep: number, payload: OnboardingPayload) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      await saveOnboarding({ userId, ...payload, currentStep: nextStep })
      setStep(nextStep)
    } catch (e) {
      setError(errorMessage(e, "We couldn't save your answer. Please try again."))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  async function finish(payload: OnboardingPayload) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setFinishing(true)
    setError(null)
    try {
      await Promise.all([
        saveOnboarding({ userId, ...payload, currentStep: STEP.referral, markCompleted: true }),
        new Promise(resolve => setTimeout(resolve, MIN_FINISH_SCREEN_MS)),
      ])
      // The professional profile isn't marked complete here. That's decided
      // by the profile data itself (M1 completion rules).
      router.replace("/dashboard")
    } catch (e) {
      setFinishing(false)
      setBusy(false)
      inFlight.current = false
      setError(errorMessage(e, "We couldn't finish setting things up. Please try again."))
    }
  }

  function goBack() {
    if (busy) return
    setError(null)
    if (step === STEP.referral && intent === "hiring") setStep(STEP.intent)
    else setStep(s => Math.max(STEP.intent, s - 1))
  }

  function handleNext() {
    if (busy || !canAdvance[step]) return
    switch (step) {
      case STEP.role:
        return saveAndGo(STEP.experience, { targetJobRole: role.trim() })
      case STEP.experience:
        return saveAndGo(STEP.timeline, { yearsOfExperience: yearsValue ?? undefined, targetCompany: company })
      case STEP.timeline:
        return saveAndGo(STEP.resume, { interviewTimeline: timeline, weeklyAvailability: availability })
      case STEP.resume:
        // The resume is linked as soon as it's uploaded, so there's nothing else to save.
        return saveAndGo(STEP.referral, {})
      case STEP.referral:
        return finish({ referralSource: referral })
    }
  }

  // Skip moves on without saving this step's answers. Anything saved before
  // is kept.
  function handleSkip() {
    if (busy || uploading) return
    if (step === STEP.referral) return finish({})
    return saveAndGo(step + 1, {})
  }

  function chooseIntent(value: UserIntent) {
    setIntent(value)
    // Hiring tools don't exist in the app yet, so the intent is only recorded
    // and no employer features or permissions are switched on. The
    // candidate-specific steps are skipped.
    return saveAndGo(value === "hiring" ? STEP.referral : STEP.role, { userIntent: value })
  }

  async function uploadResume(file: File) {
    setError(null)
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF file.")
      return
    }
    if (file.size > MAX_RESUME_BYTES) {
      setError("Your resume must be 10 MB or smaller.")
      return
    }
    setUploading(true)
    try {
      // Goes through the existing resume library (ImageKit + duplicate
      // detection), then the library entry is linked to the profile.
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/resume-match/upload-resume", { method: "POST", body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.resumeId) throw new Error(data.error || "Unable to upload your resume. Please try again.")
      await updateProfile({ userId, resumeId: data.resumeId })
      setResume({ id: data.resumeId, fileName: data.fileName ?? file.name })
    } catch (e) {
      setError(e instanceof Error && !e.message.startsWith("[CONVEX") ? e.message : errorMessage(e, "Unable to upload your resume. Please try again."))
    } finally {
      setUploading(false)
    }
  }

  async function removeResume() {
    if (uploading || busy) return
    setError(null)
    try {
      // Only unlinks it from the profile. The file stays in the resume library.
      await updateProfile({ userId, resumeId: null })
      setResume(null)
    } catch (e) {
      setError(errorMessage(e, "Unable to remove the resume. Please try again."))
    }
  }

  // --- Intent screen (unnumbered) -------------------------------------------
  if (step === STEP.intent) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          How will you use {PRODUCT_NAME}?
        </h1>
        <div role="radiogroup" aria-label="How will you use the platform" className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2">
          {INTENT_OPTIONS.map(option => {
            const Icon = option.value === "hiring" ? BriefcaseBusiness : CircleUserRound
            const selected = intent === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={busy}
                onClick={() => chooseIntent(option.value)}
                className={cn(
                  "group flex cursor-pointer flex-col rounded-xl border bg-card p-5 text-left transition-all outline-none sm:p-6",
                  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-wait",
                  selected ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/50 hover:shadow-sm"
                )}
              >
                <div className="flex items-center justify-between">
                  <Icon className="size-6 text-primary" />
                  {busy && selected ? (
                    <LoaderCircle className="size-4 animate-spin text-primary" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                  )}
                </div>
                <span className="mt-4 font-semibold text-foreground">{option.title}</span>
                <span className="mt-2 text-sm leading-relaxed text-muted-foreground">{option.description}</span>
              </button>
            )
          })}
        </div>
        {error && <p role="alert" className="mt-6 text-center text-sm text-destructive">{error}</p>}
      </div>
    )
  }

  // --- Numbered steps -------------------------------------------------------
  const isHiring = intent === "hiring"
  const isLast = step === STEP.referral
  const skipLabel = step === STEP.resume ? "Skip for now" : "Skip"

  return (
    <div className="relative mx-auto flex w-full max-w-xl flex-col">
      {!isHiring && <StepIndicator current={step} total={STEP_COUNT} />}

      <div className={cn("min-h-[300px]", isHiring ? "mt-2" : "mt-10 sm:mt-14")}>
        {step === STEP.role && (
          <section>
            <label htmlFor="onboarding-role" className="block text-lg font-semibold text-primary">
              What role are you interviewing for?
            </label>
            <div className="mt-3">
              <JobTitleCombobox inputId="onboarding-role" value={role} onChange={setRole} onSubmit={handleNext} disabled={busy} />
            </div>
            <p className="mt-6 text-xs font-medium tracking-wide text-muted-foreground uppercase">Popular roles</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {POPULAR_ROLES.map(r => {
                const selected = role.trim().toLowerCase() === r.toLowerCase()
                return (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={selected}
                    disabled={busy}
                    onClick={() => setRole(r)}
                    className={cn(
                      "cursor-pointer rounded-lg border px-3.5 py-2 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      selected
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/50"
                    )}
                  >
                    {r}
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {step === STEP.experience && (
          <section className="space-y-8">
            <div>
              <label htmlFor="onboarding-years" className="block text-lg font-semibold text-primary">
                How many years of experience do you have?
              </label>
              <div
                className={cn(
                  "mt-3 flex h-11 items-stretch overflow-hidden rounded-lg border bg-card transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
                  yearsInvalid ? "border-destructive" : "border-input"
                )}
              >
                <input
                  id="onboarding-years"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0"
                  value={years}
                  disabled={busy}
                  aria-invalid={yearsInvalid}
                  aria-describedby={yearsInvalid ? "onboarding-years-error" : undefined}
                  onChange={e => {
                    const next = e.target.value.replace(/[^\d]/g, "").slice(0, 2)
                    setYears(next)
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter") handleNext()
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault()
                      const n = (yearsValue ?? 0) + (e.key === "ArrowUp" ? 1 : -1)
                      setYears(String(Math.min(MAX_YEARS_OF_EXPERIENCE, Math.max(0, n))))
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent px-3.5 text-base outline-none placeholder:text-muted-foreground md:text-sm"
                />
                <div className="flex w-9 flex-col border-l border-border">
                  <button
                    type="button"
                    aria-label="Increase years of experience"
                    disabled={busy || (yearsValue ?? 0) >= MAX_YEARS_OF_EXPERIENCE}
                    onClick={() => setYears(String(Math.min(MAX_YEARS_OF_EXPERIENCE, (yearsValue ?? 0) + (years === "" ? 0 : 1))))}
                    className="flex flex-1 cursor-pointer items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Decrease years of experience"
                    disabled={busy || (yearsValue ?? 0) <= 0}
                    onClick={() => setYears(String(Math.max(0, (yearsValue ?? 0) - 1)))}
                    className="flex flex-1 cursor-pointer items-center justify-center border-t border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Minus className="size-3.5" />
                  </button>
                </div>
              </div>
              {yearsInvalid && (
                <p id="onboarding-years-error" className="mt-1.5 text-xs text-destructive">
                  Enter a number between 0 and {MAX_YEARS_OF_EXPERIENCE}.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="onboarding-company" className="block text-lg font-semibold text-primary">
                Any company you are aiming at?{" "}
                <span className="text-sm font-normal text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="onboarding-company"
                placeholder="e.g. Google"
                maxLength={200}
                value={company}
                disabled={busy}
                onChange={e => setCompany(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleNext()}
                className="mt-3 h-11 bg-card px-3.5 text-base md:text-sm"
              />
            </div>
          </section>
        )}

        {step === STEP.timeline && (
          <section className="space-y-8">
            <div>
              <h2 id="onboarding-timeline" className="flex items-center gap-2 text-lg font-semibold text-primary">
                <CalendarDays className="size-5" /> When is your interview?
              </h2>
              <div role="radiogroup" aria-labelledby="onboarding-timeline" className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {INTERVIEW_TIMELINE_OPTIONS.map(o => (
                  <SelectCard key={o.value} selected={timeline === o.value} disabled={busy} onSelect={() => setTimeline(o.value)} className="h-11">
                    {o.label}
                  </SelectCard>
                ))}
              </div>
            </div>
            <div>
              <h2 id="onboarding-availability" className="flex items-center gap-2 text-lg font-semibold text-primary">
                <Clock className="size-5" /> How much time can you give it each week?
              </h2>
              <div role="radiogroup" aria-labelledby="onboarding-availability" className="mt-3 grid gap-2.5 sm:grid-cols-3">
                {WEEKLY_AVAILABILITY_OPTIONS.map(o => (
                  <SelectCard key={o.value} selected={availability === o.value} disabled={busy} onSelect={() => setAvailability(o.value)}>
                    <span className="flex flex-col">
                      <span className="font-medium">{o.label}</span>
                      <span className="mt-0.5 text-xs text-muted-foreground">{o.hint}</span>
                    </span>
                  </SelectCard>
                ))}
              </div>
            </div>
          </section>
        )}

        {step === STEP.resume && (
          <ResumeStep
            resume={resume}
            uploading={uploading}
            disabled={busy}
            onFile={uploadResume}
            onRemove={removeResume}
          />
        )}

        {step === STEP.referral && (
          <section>
            {isHiring && (
              <div className="mb-8 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Thanks! We&apos;ve noted that you&apos;re hiring.</p>
                <p className="mt-1">
                  Candidate screening tools aren&apos;t available in {PRODUCT_NAME} yet. In the meantime you can explore
                  the interview practice experience your candidates would see.
                </p>
              </div>
            )}
            <h2 id="onboarding-referral" className="text-lg font-semibold text-primary">How did you hear about us?</h2>
            <div role="radiogroup" aria-labelledby="onboarding-referral" className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {REFERRAL_OPTIONS.map(o => (
                <SelectCard key={o.value} selected={referral === o.value} disabled={busy} onSelect={() => setReferral(o.value)} className="gap-2.5">
                  <ReferralIcon name={o.value} />
                  <span className="truncate">{o.label}</span>
                </SelectCard>
              ))}
            </div>
          </section>
        )}
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}

      {/* Back | Skip | Next/Finish, laid out as in the reference */}
      <div className="mt-10 grid grid-cols-3 items-center">
        <div>
          <Button variant="ghost" size="lg" onClick={goBack} disabled={busy || uploading} className="px-2 text-muted-foreground">
            <ChevronLeft /> Back
          </Button>
        </div>
        <div className="text-center">
          <button
            type="button"
            onClick={handleSkip}
            disabled={busy || uploading}
            className="cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {skipLabel}
          </button>
        </div>
        <div className="flex justify-end">
          <Button size="lg" onClick={handleNext} disabled={busy || !canAdvance[step]} className="h-10 min-w-24 px-5">
            {busy && !finishing ? (
              <LoaderCircle className="animate-spin" />
            ) : isLast ? (
              "Finish"
            ) : (
              <>
                Next <ChevronRight />
              </>
            )}
          </Button>
        </div>
      </div>

      {finishing && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/85 backdrop-blur-[2px]"
        >
          <LoaderCircle className="size-10 animate-spin text-primary" />
          <p className="px-6 text-center text-lg font-semibold text-foreground">Personalizing {PRODUCT_NAME} for you!</p>
        </div>
      )}
    </div>
  )
}

function ResumeStep({
  resume,
  uploading,
  disabled,
  onFile,
  onRemove,
}: {
  resume: LinkedResume | null
  uploading: boolean
  disabled: boolean
  onFile: (file: File) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const locked = uploading || disabled

  const pick = (files: FileList | null) => {
    const file = files?.[0]
    if (file) onFile(file)
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-primary">
        Add your resume <span className="text-sm font-normal text-muted-foreground">(optional)</span>
      </h2>

      {resume && !uploading ? (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{resume.fileName}</p>
            <p className="text-xs text-muted-foreground">Saved to your resume library</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Remove resume" onClick={onRemove} disabled={locked}>
            <X />
          </Button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={locked ? -1 : 0}
          aria-disabled={locked}
          aria-label="Upload your resume"
          onClick={() => !locked && inputRef.current?.click()}
          onKeyDown={e => {
            if (!locked && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
          onDragOver={e => {
            e.preventDefault()
            if (!locked) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault()
            setDragging(false)
            if (!locked) pick(e.dataTransfer.files)
          }}
          className={cn(
            "mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            dragging ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50",
            locked && "cursor-wait"
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            {uploading ? <LoaderCircle className="size-6 animate-spin" /> : <CloudUpload className="size-6" />}
          </span>
          <p className="mt-4 text-sm font-medium text-foreground">
            {uploading ? "Uploading your resume…" : "Drop your resume here, or click to choose"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">PDF, up to 10 MB</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={e => pick(e.target.files)}
          />
        </div>
      )}
    </section>
  )
}
