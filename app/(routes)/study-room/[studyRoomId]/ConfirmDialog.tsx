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

// Own copy for the AI Study Room module (deliberately not imported from
// Study Planner - the two modules must stay independent). Same generic
// confirm-before-destroying treatment: archive/unarchive and delete a room
// both go through this.
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
