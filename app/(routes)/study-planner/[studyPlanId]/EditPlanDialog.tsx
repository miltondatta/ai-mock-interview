"use client"

import React, { useEffect, useState } from "react"
import { useMutation } from "convex/react"
import { Loader2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { Level, PlanDetail } from "./types"

const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
]

function LevelPicker({ value, onChange }: { value: Level | ""; onChange: (v: Level) => void }) {
  return (
    <div className="flex gap-2">
      {LEVEL_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            value === opt.value ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

interface EditPlanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: Id<"UserTable">
  plan: PlanDetail
}

function EditPlanDialog({ open, onOpenChange, userId, plan }: EditPlanDialogProps) {
  const updateStudyPlan = useMutation(api.StudyPlanner.UpdateStudyPlan)
  const [title, setTitle] = useState(plan.title)
  const [description, setDescription] = useState(plan.description ?? "")
  const [learningGoal, setLearningGoal] = useState(plan.learningGoal ?? "")
  const [currentLevel, setCurrentLevel] = useState<Level | "">(plan.currentLevel ?? "")
  const [targetLevel, setTargetLevel] = useState<Level | "">(plan.targetLevel ?? "")
  const [startDate, setStartDate] = useState(plan.startDate ?? "")
  const [targetEndDate, setTargetEndDate] = useState(plan.targetEndDate ?? "")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Re-sync the form whenever a different (or freshly reloaded) plan opens.
  useEffect(() => {
    if (!open) return
    setTitle(plan.title)
    setDescription(plan.description ?? "")
    setLearningGoal(plan.learningGoal ?? "")
    setCurrentLevel(plan.currentLevel ?? "")
    setTargetLevel(plan.targetLevel ?? "")
    setStartDate(plan.startDate ?? "")
    setTargetEndDate(plan.targetEndDate ?? "")
    setError(null)
  }, [open, plan])

  async function handleSave() {
    if (saving) return
    setError(null)
    if (!title.trim()) {
      setError("Please give your study plan a title.")
      return
    }
    if (startDate && targetEndDate && targetEndDate < startDate) {
      setError("The target completion date must be on or after the start date.")
      return
    }
    setSaving(true)
    try {
      await updateStudyPlan({
        userId,
        studyPlanId: plan._id as Id<"studyPlans">,
        title: title.trim(),
        description: description.trim(),
        learningGoal: learningGoal.trim(),
        currentLevel: currentLevel || undefined,
        targetLevel: targetLevel || undefined,
        startDate: startDate || undefined,
        targetEndDate: targetEndDate || undefined,
      })
      onOpenChange(false)
    } catch (e) {
      setError("Unable to save these changes right now. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit plan details</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto py-1">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">Plan title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="resize-none" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">Learning goal</label>
            <Input value={learningGoal} onChange={(e) => setLearningGoal(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">Current knowledge level</label>
            <LevelPicker value={currentLevel} onChange={setCurrentLevel} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">Target knowledge level</label>
            <LevelPicker value={targetLevel} onChange={setTargetLevel} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">Start date</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">Target completion</label>
              <Input type="date" value={targetEndDate} onChange={(e) => setTargetEndDate(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose disabled={saving} render={(props) => <Button {...props} variant="outline" />}>
            Cancel
          </DialogClose>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2Icon className="animate-spin" />}
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default EditPlanDialog
