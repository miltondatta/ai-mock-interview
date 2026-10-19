"use client"

import React, { useContext, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Globe, Mic, FileText, BookOpen, Info, Loader2, CheckCircle2 } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Doc, Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import { Button } from "@/components/ui/button"
import {
  useLanguageOptions,
  DEFAULT_INTERVIEW_LANGUAGE,
  DEFAULT_FEEDBACK_LANGUAGE,
  DEFAULT_PRACTICE_COACH_LANGUAGE,
} from "./languages"

interface LanguageRowProps {
  icon: React.ElementType
  iconClassName: string
  title: string
  description: string
  value: string
  onChange: (value: string) => void
  helperText: string
}

function LanguageRow({ icon: Icon, iconClassName, title, description, value, onChange, helperText }: LanguageRowProps) {
  const languageOptions = useLanguageOptions()
  const isAvailable = languageOptions.some((option) => option.value === value)
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}>
          <Icon className="size-5" />
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            {title}
            <Info className="size-3.5 text-muted-foreground" />
          </p>
          <p className="mt-0.5 max-w-md text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="sm:w-64 sm:shrink-0">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {/* A saved language the admin has since removed isn't listed. */}
          {!isAvailable && (
            <option value={value} disabled hidden>
              Select a language…
            </option>
          )}
          {languageOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.flag} {option.label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-muted-foreground">{helperText}</p>
      </div>
    </div>
  )
}

interface LanguageSettingsFormProps {
  userId: Id<"UserTable">
  initial: Doc<"UserSettingsTable"> | null
}

// Keyed by the loaded settings doc (or "new") from the parent so state is
// initialized from the query result on mount, instead of via an effect.
function LanguageSettingsForm({ userId, initial }: LanguageSettingsFormProps) {
  const saveUserSettings = useMutation(api.UserSettings.SaveUserSettings)

  const [interviewLanguage, setInterviewLanguage] = useState(initial?.interviewLanguage ?? DEFAULT_INTERVIEW_LANGUAGE)
  const [feedbackLanguage, setFeedbackLanguage] = useState(initial?.feedbackLanguage ?? DEFAULT_FEEDBACK_LANGUAGE)
  const [practiceCoachLanguage, setPracticeCoachLanguage] = useState(initial?.practiceCoachLanguage ?? DEFAULT_PRACTICE_COACH_LANGUAGE)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const withDirty = (setter: (value: string) => void) => (value: string) => {
    setSaved(false)
    setter(value)
  }

  const handleReset = () => {
    setSaved(false)
    setInterviewLanguage(DEFAULT_INTERVIEW_LANGUAGE)
    setFeedbackLanguage(DEFAULT_FEEDBACK_LANGUAGE)
    setPracticeCoachLanguage(DEFAULT_PRACTICE_COACH_LANGUAGE)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveUserSettings({
        userId,
        interviewLanguage,
        feedbackLanguage,
        practiceCoachLanguage,
      })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-3 border-b border-border p-6">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Globe className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Language Settings</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Choose your preferred languages for interview, feedback and practice coach.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-6">
        <LanguageRow
          icon={Mic}
          iconClassName="bg-primary/10 text-primary"
          title="Interview Language"
          description="Language used by the AI interviewer to ask questions during the live interview."
          value={interviewLanguage}
          onChange={withDirty(setInterviewLanguage)}
          helperText="Choose the language you want to practice the interview in."
        />
        <LanguageRow
          icon={FileText}
          iconClassName="bg-success/10 text-success"
          title="Feedback Language"
          description="Language used for your interview evaluation, score explanation and improvement suggestions."
          value={feedbackLanguage}
          onChange={withDirty(setFeedbackLanguage)}
          helperText="Receive your feedback and report in this language."
        />
        <LanguageRow
          icon={BookOpen}
          iconClassName="bg-violet-500/10 text-violet-500"
          title="Practice Coach Language"
          description="Language used by the Practice Coach to generate sample answers, scripts and learning materials."
          value={practiceCoachLanguage}
          onChange={withDirty(setPracticeCoachLanguage)}
          helperText="Used in Practice Coach, sample answers and learning materials."
        />
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border p-6">
        {saved && (
          <p className="mr-auto flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="size-4" /> Settings saved.
          </p>
        )}
        <Button type="button" variant="outline" onClick={handleReset} disabled={saving}>
          Reset to default
        </Button>
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}

function LanguageSettings() {
  const { userDetail } = useContext(UserDetailContext)
  const settings = useQuery(
    api.UserSettings.GetUserSettings,
    userDetail?._id ? { userId: userDetail._id } : "skip"
  )

  if (!userDetail?._id || settings === undefined) {
    return (
      <div className="flex items-center justify-center p-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading settings…
      </div>
    )
  }

  return (
    <LanguageSettingsForm
      key={settings?._id ?? "new"}
      userId={userDetail._id}
      initial={settings}
    />
  )
}

export default LanguageSettings
