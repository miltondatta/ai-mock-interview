"use client"

import React from "react"
import { Loader2Icon, Trash2 } from "lucide-react"
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

export interface CollectionToDelete {
  _id: string
  title: string
}

interface DeleteCollectionDialogProps {
  collection: CollectionToDelete | null
  deleting: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

function DeleteCollectionDialog({ collection, deleting, onOpenChange, onConfirm }: DeleteCollectionDialogProps) {
  return (
    <Dialog open={collection !== null} onOpenChange={(open) => { if (!deleting) onOpenChange(open) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this collection?</DialogTitle>
          <DialogDescription>
            {collection ? `"${collection.title}" and all its generated questions and answers` : "This collection"} will be
            permanently deleted. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose disabled={deleting} render={(props) => <Button {...props} variant="outline" />}>
            Cancel
          </DialogClose>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting}>
            {deleting ? <Loader2Icon className="animate-spin" /> : <Trash2 />} Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DeleteCollectionDialog
