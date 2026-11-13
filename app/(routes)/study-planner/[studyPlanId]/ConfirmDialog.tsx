"use client"

import React from "react"
import { Loader2Icon, Trash2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
}

// Generic confirmation dialog reused for every destructive Study Plan
// Details action (delete plan/phase/task/milestone) so each one gets the
// same clear "here's exactly what will be removed" treatment instead of a
// silent delete.
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  destructive = true,
  busy = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent>
        <DialogHeader>
          <div className={`flex size-10 items-center justify-center rounded-full ${destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
            <AlertTriangle className="size-5" />
          </div>
          <DialogTitle className="mt-2">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose disabled={busy} render={(props) => <Button {...props} variant="outline" />}>
            Cancel
          </DialogClose>
          <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2Icon className="animate-spin" /> : destructive ? <Trash2 /> : null}
            {busy ? "Working..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ConfirmDialog
