"use client"

import React, { useContext, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { SlidersHorizontal, Loader2, CheckCircle2 } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Doc, Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import { Button } from "@/components/ui/button"
import InterviewOptions, {
  DEFAULT_INTERVIEW_MODE,
  DEFAULT_INTERVIEW_LEVEL,
  DEFAULT_QUESTION_COUNT,
} from "../_components/InterviewOptions"

interface InterviewPreferencesFormProps {
  userId: Id<"UserTable">
  initial: Doc<"UserSettingsTable"> | null
}

// Keyed by the loaded settings doc (or "new") from the parent so state is
// initialized from the query result on mount, instead of via an effect.
function InterviewPreferencesForm({ userId, initial }: InterviewPreferencesFormProps) {
  const saveInterviewPreferences = useMutation(api.UserSettings.SaveInterviewPreferences)

  const [preferences, setPreferences] = useState({
    mode: initial?.defaultInterviewMode ?? DEFAULT_INTERVIEW_MODE,
    level: initial?.defaultInterviewLevel ?? DEFAULT_INTERVIEW_LEVEL,
    qno: initial?.defaultQuestionCount ?? DEFAULT_QUESTION_COUNT,
  })
  // InterviewOptions keeps its own custom-count input state, so it's
  // remounted on reset to pick the default count back up.
  const [optionsKey, setOptionsKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Same rule Create Interview applies before letting the candidate proceed.
  const isQnoValid = /^[1-9][0-9]*$/.test(preferences.qno)

  const onHandleInputChange = (field: string, value: string) => {
    setSaved(false)
    setPreferences((prev) => ({ ...prev, [field]: value }))
  }

  const handleReset = () => {
    setSaved(false)
    setPreferences({
      mode: DEFAULT_INTERVIEW_MODE,
      level: DEFAULT_INTERVIEW_LEVEL,
      qno: DEFAULT_QUESTION_COUNT,
    })
    setOptionsKey((key) => key + 1)
  }

  const handleSave = async () => {
    if (!isQnoValid) return
    setSaving(true)
    try {
      await saveInterviewPreferences({
        userId,
        defaultInterviewMode: preferences.mode,
        defaultInterviewLevel: preferences.level,
        defaultQuestionCount: preferences.qno,
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
          <SlidersHorizontal className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Interview Preferences</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Default interview type and question settings, pre-selected whenever you create a new interview.
          </p>
        </div>
      </div>

      <div className="p-6">
        <div className="rounded-xl border border-border bg-muted/40 p-4 [&>div]:mt-0">
          <InterviewOptions
            key={optionsKey}
            mode={preferences.mode}
            level={preferences.level}
            qno={preferences.qno}
            onHandleInputChange={onHandleInputChange}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          You can still change any of these for an individual interview on the Create Interview screen.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border p-6">
        {!isQnoValid && (
          <p className="mr-auto text-sm text-destructive">Please enter a valid number of questions.</p>
        )}
        {isQnoValid && saved && (
          <p className="mr-auto flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="size-4" /> Preferences saved.
          </p>
        )}
        <Button type="button" variant="outline" onClick={handleReset} disabled={saving}>
          Reset to default
        </Button>
        <Button type="button" onClick={handleSave} disabled={saving || !isQnoValid}>
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}

function InterviewPreferences() {
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
    <InterviewPreferencesForm
      key={settings?._id ?? "new"}
      userId={userDetail._id}
      initial={settings}
    />
  )
}

export default InterviewPreferences
