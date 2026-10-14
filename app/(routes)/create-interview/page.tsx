"use client"

import React, { useContext, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import axios from "axios"
import { useMutation, useQuery } from "convex/react"
import { ArrowLeft, Loader2 } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import FormStep from "./FormStep"
import ReviewStep from "./ReviewStep"
import { CreateInterviewFormData, LanguageSelection } from "./types"
import {
  DEFAULT_INTERVIEW_LANGUAGE,
  DEFAULT_FEEDBACK_LANGUAGE,
  DEFAULT_PRACTICE_COACH_LANGUAGE,
} from "../settings/languages"

interface CreateInterviewWizardProps {
  userId: Id<"UserTable">
  initialLanguages: LanguageSelection
}

function CreateInterviewWizard({ userId, initialLanguages }: CreateInterviewWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState<"form" | "review">("form")
  const [file, setFile] = useState<File | null>(null)
  const [formData, setFormData] = useState<CreateInterviewFormData>({
    jobTitle: "",
    companyName: "",
    jobDescription: "",
    mode: "technical",
    level: "basic",
    qno: "2",
  })
  const [languages, setLanguages] = useState<LanguageSelection>(initialLanguages)
  const [loading, setLoading] = useState(false)
  const [interviewId, setInterviewId] = useState<string | null>(null)
  const [formNotice, setFormNotice] = useState<{ type: "resume-missing" | "description-missing"; message: string } | null>(null)

  const saveInterviewQuestion = useMutation(api.Interview.SaveInterviewQuestions)

  const onHandleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const onLanguageChange = (field: keyof LanguageSelection, value: string) => {
    setLanguages((prev) => ({ ...prev, [field]: value }))
  }

  const isQnoValid = /^[1-9][0-9]*$/.test(String(formData.qno ?? ""))
  const canProceed = !!formData.jobTitle.trim() && (!!file || !!formData.jobDescription.trim()) && isQnoValid

  const onNext = () => {
    if (!canProceed) return

    // Resume present but no job description - nudge toward adding both for
    // more relevant questions, but let the candidate proceed with just the resume.
    if (file && !formData.jobDescription.trim()) {
      setFormNotice({
        type: "description-missing",
        message:
          "You haven't added a Job Description. Providing both your Resume and the Job Description helps us generate more relevant interview questions.",
      })
      return
    }

    // Job description present but no resume - same nudge, the other way around.
    if (!file && formData.jobDescription.trim()) {
      setFormNotice({
        type: "resume-missing",
        message:
          "You haven't uploaded a Resume. Providing both your Resume and the Job Description helps us generate more relevant interview questions.",
      })
      return
    }

    setStep("review")
  }

  const onSubmit = async () => {
    setLoading(true)
    const formData_ = new FormData()
    if (file) formData_.append("file", file)
    formData_.append("jobTitle", formData.jobTitle ?? "")
    formData_.append("companyName", formData.companyName ?? "")
    formData_.append("jobDescription", formData.jobDescription ?? "")
    formData_.append("mode", formData.mode || "technical")
    formData_.append("level", formData.level || "basic")
    formData_.append("qno", String(formData.qno || "3"))
    formData_.append("lang", languages.interviewLanguage || DEFAULT_INTERVIEW_LANGUAGE)

    try {
      const res = await axios.post("/api/generate-interview-questions", formData_)

      const resp = await saveInterviewQuestion({
        questions: res.data?.questions,
        resumeUrl: res.data?.resumeUrl ?? undefined,
        resumeFileName: res.data?.resumeFileName ?? undefined,
        jobTitle: formData.jobTitle || undefined,
        jobDescription: formData.jobDescription || undefined,
        mode: formData.mode || undefined,
        level: formData.level || undefined,
        qno: Number(formData.qno) || undefined,
        uid: userId,
      })
      setInterviewId(resp)
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 429) {
        alert(e.response.data?.result)
      } else {
        console.log(e)
      }
    } finally {
      setLoading(false)
    }
  }

  const onStartInterview = () => {
    if (!interviewId) return
    router.push(`/interview/${interviewId}/start`)
  }

  const onCancel = () => router.push("/dashboard")

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-8 md:px-10 md:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {step === "form" ? "Create a new interview" : "Review & Start Interview"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === "form"
              ? "Upload your resume and add the job description to generate interview questions."
              : "Please review your choices before generating the interview questions."}
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/dashboard" />}>
          <ArrowLeft />
          Back to Dashboard
        </Button>
      </div>

      <div className="mt-8">
        {step === "form" ? (
          <FormStep
            formData={formData}
            onHandleInputChange={onHandleInputChange}
            file={file}
            onFileSelected={setFile}
            languages={languages}
            onLanguageChange={onLanguageChange}
            canProceed={canProceed}
            onNext={onNext}
            onCancel={onCancel}
          />
        ) : (
          <ReviewStep
            formData={formData}
            file={file}
            languages={languages}
            loading={loading}
            interviewId={interviewId}
            onEditJobInformation={() => setStep("form")}
            onEditInterviewSettings={() => setStep("form")}
            onEditLanguageSettings={() => setStep("form")}
            onCancel={onCancel}
            onBack={() => setStep("form")}
            onGenerate={onSubmit}
            onStartInterview={onStartInterview}
          />
        )}
      </div>

      <Dialog
        open={!!formNotice}
        onOpenChange={(open) => {
          if (!open) setFormNotice(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {formNotice?.type === "resume-missing" ? "Add your resume for better questions" : "Add a job description for better questions"}
            </DialogTitle>
            <DialogDescription>{formNotice?.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormNotice(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setFormNotice(null)
                setStep("review")
              }}
            >
              Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreateInterviewPage() {
  const { userDetail } = useContext(UserDetailContext)
  const settings = useQuery(
    api.UserSettings.GetUserSettings,
    userDetail?._id ? { userId: userDetail._id } : "skip"
  )

  if (!userDetail?._id || settings === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
      </div>
    )
  }

  return (
    <CreateInterviewWizard
      userId={userDetail._id}
      initialLanguages={{
        interviewLanguage: settings?.interviewLanguage ?? DEFAULT_INTERVIEW_LANGUAGE,
        feedbackLanguage: settings?.feedbackLanguage ?? DEFAULT_FEEDBACK_LANGUAGE,
        practiceCoachLanguage: settings?.practiceCoachLanguage ?? DEFAULT_PRACTICE_COACH_LANGUAGE,
      }}
    />
  )
}

export default CreateInterviewPage
