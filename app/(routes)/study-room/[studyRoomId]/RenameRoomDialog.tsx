"use client"

import React, { useEffect, useState } from "react"
import { useMutation } from "convex/react"
import { Loader2Icon, CircleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

interface RenameRoomDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: Id<"UserTable">
  studyRoomId: Id<"studyRooms">
  currentTitle: string
}

function RenameRoomDialog({ open, onOpenChange, userId, studyRoomId, currentTitle }: RenameRoomDialogProps) {
  const renameStudyRoom = useMutation(api.StudyRoom.RenameStudyRoom)
  const [title, setTitle] = useState(currentTitle)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(currentTitle)
      setError(null)
    }
  }, [open, currentTitle])

  async function handleSave() {
    if (saving) return
    if (!title.trim()) {
      setError("Title cannot be empty.")
      return
    }
    setSaving(true)
    try {
      await renameStudyRoom({ userId, studyRoomId, title: title.trim() })
      onOpenChange(false)
    } catch {
      setError("Unable to rename this room right now. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename Study Room</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Study room title" />
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <CircleAlert className="size-3.5" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <DialogClose disabled={saving} render={(props) => <Button {...props} variant="outline" />}>
            Cancel
          </DialogClose>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2Icon className="animate-spin" /> : null}
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default RenameRoomDialog
