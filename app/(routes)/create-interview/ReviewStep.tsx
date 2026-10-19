"use client"

import React from "react"
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  FileText,
  Globe,
  Lightbulb,
  Loader2,
  Pencil,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useInterviewModes } from "../_components/InterviewOptions"
import { findLanguageOption, LanguageOption, useLanguageOptions } from "../settings/languages"
import { CreateInterviewFormData, LanguageSelection } from "./types"

function getLanguageLabel(options: LanguageOption[], value: string) {
  const option = findLanguageOption(options, value)
  return option ? `${option.flag} ${option.label}` : value
}

function SectionCard({
  icon: Icon,
  title,
  onEdit,
  children,
}: {
  icon: React.ElementType
  title: string
  onEdit: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4.5" />
          </div>
          <h2 className="font-bold text-foreground">{title}</h2>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="text-primary" />
          Edit
        </Button>
      </div>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  )
}

interface ReviewStepProps {
  formData: CreateInterviewFormData
  file: File | null
  languages: LanguageSelection
  loading: boolean
  interviewId: string | null
  onEditJobInformation: () => void
  onEditInterviewSettings: () => void
  onEditLanguageSettings: () => void
  onCancel: () => void
  onBack: () => void
  onGenerate: () => void
  onStartInterview: () => void
}

function ReviewStep({
  formData,
  file,
  languages,
  loading,
  interviewId,
  onEditJobInformation,
  onEditInterviewSettings,
  onEditLanguageSettings,
  onCancel,
  onBack,
  onGenerate,
  onStartInterview,
}: ReviewStepProps) {
  const interviewModes = useInterviewModes()
  const languageOptions = useLanguageOptions()
  const modeLabel = interviewModes.find((option) => option.value === formData.mode)?.label ?? formData.mode

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5">
        <SectionCard icon={Briefcase} title="Job Information" onEdit={onEditJobInformation}>
          <Row label="Job Title" value={formData.jobTitle || "Not specified"} />
          <Row label="Company Name" value={formData.companyName || "Not specified"} />
          {file && (
            <div>
              <span className="text-sm text-muted-foreground">Resume</span>
              <div className="mt-1.5 flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="size-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
                <CheckCircle2 className="size-4 shrink-0 text-success" />
              </div>
            </div>
          )}
          {formData.jobDescription && (
            <div>
              <span className="text-sm text-muted-foreground">Job Description</span>
              <div className="mt-1.5 max-h-28 overflow-y-auto rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                {formData.jobDescription}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard icon={SlidersHorizontal} title="Interview Settings" onEdit={onEditInterviewSettings}>
          <Row label="Interview Mode" value={modeLabel} />
          <Row label="Interview Level" value={<span className="capitalize">{formData.level}</span>} />
          <Row label="No. of Questions" value={formData.qno} />
        </SectionCard>

        <SectionCard icon={Globe} title="Language Settings" onEdit={onEditLanguageSettings}>
          <Row label="Interview Language" value={getLanguageLabel(languageOptions, languages.interviewLanguage)} />
          <Row label="Feedback Language" value={getLanguageLabel(languageOptions, languages.feedbackLanguage)} />
        </SectionCard>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <Lightbulb className="size-5 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">
          Your interview questions will be generated based on the above settings. You can go back and edit any
          section if needed.
        </p>
      </div>

      {interviewId && (
        <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3.5 py-2.5 text-sm font-medium text-success">
          <CheckCircle2 className="size-4" />
          Questions are ready — start the interview whenever you&apos;re set.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <p className="text-sm font-medium text-primary">
          {loading ? "Generating the Questions. Please wait ..." : null}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" variant="outline" onClick={onBack} disabled={loading}>
            <ArrowLeft />
            Back
          </Button>
          {interviewId ? (
            <Button type="button" onClick={onStartInterview}>
              Start Interview
              <ArrowRight />
            </Button>
          ) : (
            <Button type="button" onClick={onGenerate} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {loading ? "Generating…" : "Generate Questions"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ReviewStep
