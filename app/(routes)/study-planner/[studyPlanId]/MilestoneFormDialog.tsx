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
import type { MilestoneDetail, MilestoneStatus } from "./types"

interface MilestoneFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: Id<"UserTable">
  studyPlanId: Id<"studyPlans">
  milestone?: MilestoneDetail
}

function MilestoneFormDialog({ open, onOpenChange, userId, studyPlanId, milestone }: MilestoneFormDialogProps) {
  const createMilestone = useMutation(api.StudyPlanner.CreateMilestone)
  const updateMilestone = useMutation(api.StudyPlanner.UpdateMilestone)
  const isEdit = !!milestone

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [targetDate, setTargetDate] = useState("")
  const [completionCriteria, setCompletionCriteria] = useState("")
  const [status, setStatus] = useState<MilestoneStatus>("pending")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(milestone?.title ?? "")
    setDescription(milestone?.description ?? "")
    setTargetDate(milestone?.targetDate ?? "")
    setCompletionCriteria(milestone?.completionCriteria ?? "")
    setStatus(milestone?.status ?? "pending")
    setError(null)
  }, [open, milestone])

  async function handleSave() {
    if (saving) return
    setError(null)
    if (!title.trim()) {
      setError("Please give this milestone a title.")
      return
    }
    setSaving(true)
    try {
      if (isEdit && milestone) {
        await updateMilestone({
          userId,
          milestoneId: milestone._id as Id<"studyPlanMilestones">,
          title: title.trim(),
          description: description.trim(),
          targetDate: targetDate || undefined,
          completionCriteria: completionCriteria.trim(),
          status,
        })
      } else {
        await createMilestone({
          userId,
          studyPlanId,
          title: title.trim(),
          description: description.trim() || undefined,
          targetDate: targetDate || undefined,
          completionCriteria: completionCriteria.trim() || undefined,
        })
      }
      onOpenChange(false)
    } catch (e) {
      setError("Unable to save this milestone right now. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit milestone" : "Add milestone"}</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto py-1">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">Milestone title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="resize-none" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">Target date</label>
            <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">Completion criteria</label>
            <Input value={completionCriteria} onChange={(e) => setCompletionCriteria(e.target.value)} />
          </div>
          {isEdit && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">Status</label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setStatus("pending")}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity bg-muted text-muted-foreground ${status === "pending" ? "opacity-100 ring-1 ring-current" : "opacity-50"}`}
                >
                  Pending
                </button>
                <button
                  type="button"
                  onClick={() => setStatus("achieved")}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity bg-success/15 text-success ${status === "achieved" ? "opacity-100 ring-1 ring-current" : "opacity-50"}`}
                >
                  Achieved
                </button>
              </div>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose disabled={saving} render={(props) => <Button {...props} variant="outline" />}>
            Cancel
          </DialogClose>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2Icon className="animate-spin" />}
            {saving ? "Saving..." : isEdit ? "Save changes" : "Add milestone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default MilestoneFormDialog
