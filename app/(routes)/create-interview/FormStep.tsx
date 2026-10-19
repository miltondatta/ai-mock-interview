"use client"

import React from "react"
import { ArrowRight, Briefcase, FileText, Globe, Mic, SlidersHorizontal, UploadCloud } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import ResumeUpload from "../_components/ResumeUpload"
import InterviewOptions from "../_components/InterviewOptions"
import LanguageSelectRow from "./LanguageSelectRow"
import { CreateInterviewFormData, LanguageSelection } from "./types"

const JOB_DESCRIPTION_MAX_LENGTH = 5000

interface FormStepProps {
  formData: CreateInterviewFormData
  onHandleInputChange: (field: string, value: string) => void
  file: File | null
  onFileSelected: (file: File) => void
  onFileRemoved: () => void
  languages: LanguageSelection
  onLanguageChange: (field: keyof LanguageSelection, value: string) => void
  canProceed: boolean
  onNext: () => void
  onCancel: () => void
}

function FormStep({
  formData,
  onHandleInputChange,
  file,
  onFileSelected,
  onFileRemoved,
  languages,
  onLanguageChange,
  canProceed,
  onNext,
  onCancel,
}: FormStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Job Information */}
        <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Briefcase className="size-5" />
            </div>
            <div>
              <h2 className="font-bold text-foreground">Job Information</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">Tell us about the job you are preparing for.</p>
            </div>
          </div>

          <div className="mt-6">
            <label className="text-sm font-medium text-foreground">
              Job Title <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="Ex. Senior Accountant"
              className="mt-2"
              value={formData.jobTitle}
              onChange={(e) => onHandleInputChange("jobTitle", e.target.value)}
            />
          </div>

          <div className="mt-5">
            <label className="text-sm font-medium text-foreground">Company Name (Optional)</label>
            <Input
              placeholder="e.g. ABC Corporation"
              className="mt-2"
              value={formData.companyName}
              onChange={(e) => onHandleInputChange("companyName", e.target.value)}
            />
          </div>

          <div className="mt-6">
            <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <UploadCloud className="size-4 text-primary" />
              Resume Upload
            </label>
            <div className="mt-2">
              <ResumeUpload setFiles={onFileSelected} file={file} onRemove={onFileRemoved} />
            </div>
          </div>

          <div className="mt-6">
            <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <FileText className="size-4 text-primary" />
              Job Description
            </label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Paste the job description to get more relevant questions.
            </p>
            <div className="relative mt-2">
              <Textarea
                placeholder="Paste the job description here..."
                className="h-[200px]"
                maxLength={JOB_DESCRIPTION_MAX_LENGTH}
                value={formData.jobDescription}
                onChange={(e) => onHandleInputChange("jobDescription", e.target.value)}
              />
              <span className="pointer-events-none absolute bottom-2.5 right-3 text-xs text-muted-foreground">
                {formData.jobDescription.length}/{JOB_DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
          </div>
        </div>

        {/* Interview Preference + Language Settings */}
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <SlidersHorizontal className="size-5" />
              </div>
              <div>
                <h2 className="font-bold text-foreground">Interview Preference</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Choose your interview type and question settings.</p>
              </div>
            </div>

            <InterviewOptions
              mode={formData.mode}
              level={formData.level}
              qno={formData.qno}
              onHandleInputChange={onHandleInputChange}
            />
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Globe className="size-5" />
              </div>
              <div>
                <h2 className="font-bold text-foreground">Language Settings</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Choose your preferred languages for the interview experience.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <LanguageSelectRow
                icon={Mic}
                iconClassName="bg-primary/10 text-primary"
                title="Interview Language"
                description="Language used by the AI interviewer to ask questions during the live interview."
                value={languages.interviewLanguage}
                onChange={(value) => onLanguageChange("interviewLanguage", value)}
              />
              <LanguageSelectRow
                icon={FileText}
                iconClassName="bg-success/10 text-success"
                title="Feedback Language"
                description="Language used for interview evaluation, score explanation and improvement suggestions."
                value={languages.feedbackLanguage}
                onChange={(value) => onLanguageChange("feedbackLanguage", value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-5">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={onNext} disabled={!canProceed}>
          Next: Review Summary
          <ArrowRight />
        </Button>
      </div>
    </div>
  )
}

export default FormStep
