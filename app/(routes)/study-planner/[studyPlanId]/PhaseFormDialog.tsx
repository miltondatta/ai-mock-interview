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
import type { PhaseDetail } from "./types"

interface PhaseFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: Id<"UserTable">
  studyPlanId: Id<"studyPlans">
  phase?: PhaseDetail
}

function PhaseFormDialog({ open, onOpenChange, userId, studyPlanId, phase }: PhaseFormDialogProps) {
  const createPhase = useMutation(api.StudyPlanner.CreatePhase)
  const updatePhase = useMutation(api.StudyPlanner.UpdatePhase)
  const isEdit = !!phase

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [objectives, setObjectives] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(phase?.title ?? "")
    setDescription(phase?.description ?? "")
    setStartDate(phase?.startDate ?? "")
    setEndDate(phase?.endDate ?? "")
    setObjectives((phase?.objectives ?? []).join("\n"))
    setError(null)
  }, [open, phase])

  async function handleSave() {
    if (saving) return
    setError(null)
    if (!title.trim()) {
      setError("Please give this phase a title.")
      return
    }
    if (startDate && endDate && endDate < startDate) {
      setError("The phase end date must be on or after its start date.")
      return
    }
    const objectiveList = objectives
      .split("\n")
      .map((o) => o.trim())
      .filter(Boolean)

    setSaving(true)
    try {
      if (isEdit && phase) {
        await updatePhase({
          userId,
          phaseId: phase._id as Id<"studyPlanPhases">,
          title: title.trim(),
          description: description.trim(),
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          objectives: objectiveList,
        })
      } else {
        await createPhase({
          userId,
          studyPlanId,
          title: title.trim(),
          description: description.trim() || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          objectives: objectiveList,
        })
      }
      onOpenChange(false)
    } catch (e) {
      setError("Unable to save this phase right now. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit phase" : "Add phase"}</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto py-1">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">Phase title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Phase 1 - Foundations" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">Start date</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">End date</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">Learning objectives (one per line)</label>
            <Textarea value={objectives} onChange={(e) => setObjectives(e.target.value)} rows={3} className="resize-none" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose disabled={saving} render={(props) => <Button {...props} variant="outline" />}>
            Cancel
          </DialogClose>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2Icon className="animate-spin" />}
            {saving ? "Saving..." : isEdit ? "Save changes" : "Add phase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default PhaseFormDialog
