"use client"

import React, { useState } from "react"
import { useMutation } from "convex/react"
import { Button } from "@/components/ui/button"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface RegenerateResult {
  scheduledCount: number
  skippedCompleted: number
  skippedLocked: number
  unscheduledCount: number
  compressed: boolean
}

// Drives convex/StudyPlanner.ts's RedistributeSchedule - the M8 distribution
// engine that spreads a plan's incomplete topics across the days before the
// candidate's interview date (or timeline estimate), respecting their weekly
// availability. Never runs automatically: this dialog is the only way it's
// triggered, per "do not automatically regenerate schedules on every profile
// update."
function RegenerateScheduleDialog({
  open,
  onOpenChange,
  userId,
  studyPlanId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: Id<"UserTable">
  studyPlanId: Id<"studyPlans">
}) {
  const redistribute = useMutation(api.StudyPlanner.RedistributeSchedule)
  const [includeLocked, setIncludeLocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RegenerateResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      const res = await redistribute({ userId, studyPlanId, includeLocked })
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to regenerate the schedule. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  function close(next: boolean) {
    if (busy) return
    onOpenChange(next)
    if (!next) {
      setResult(null)
      setError(null)
      setIncludeLocked(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Schedule updated</DialogTitle>
              <DialogDescription>
                {result.scheduledCount} topic{result.scheduledCount === 1 ? "" : "s"} rescheduled.
                {result.skippedLocked > 0 && ` ${result.skippedLocked} manually-scheduled topic${result.skippedLocked === 1 ? "" : "s"} kept as-is.`}
                {result.skippedCompleted > 0 && ` ${result.skippedCompleted} completed/skipped topic${result.skippedCompleted === 1 ? "" : "s"} left untouched.`}
              </DialogDescription>
            </DialogHeader>
            {result.compressed && (
              <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
                {result.unscheduledCount} topic{result.unscheduledCount === 1 ? "" : "s"} couldn&apos;t fit before the deadline at your current pace, so
                they&apos;re left without a date. Consider increasing your weekly availability, moving the interview date, or finishing some topics first.
              </p>
            )}
            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Regenerate schedule</DialogTitle>
              <DialogDescription>
                Incomplete topics will be rescheduled from today based on your profile&apos;s interview timeline and weekly availability. Completed topics
                are always kept, and anything you manually moved is kept too, unless you check the box below.
              </DialogDescription>
            </DialogHeader>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={includeLocked}
                onChange={(e) => setIncludeLocked(e.target.checked)}
                className="size-4 rounded border-border"
              />
              Also reschedule topics I manually moved
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <DialogClose disabled={busy} render={(props) => <Button {...props} variant="outline" />}>
                Cancel
              </DialogClose>
              <Button onClick={handleConfirm} disabled={busy}>
                {busy ? "Regenerating..." : "Regenerate"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default RegenerateScheduleDialog
