"use client"

import React, { useEffect, useState } from "react"
import { useMutation } from "convex/react"
import { Check, Copy, Globe, Link as LinkIcon, Lock, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"

interface ShareCollectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: Id<"UserTable">
  collectionId: Id<"questionBankCollections">
  title: string
  isShared: boolean
  shareToken?: string
}

function ShareCollectionDialog({ open, onOpenChange, userId, collectionId, title, isShared, shareToken }: ShareCollectionDialogProps) {
  const setSharing = useMutation(api.QuestionBank.SetCollectionSharing)
  const [shared, setShared] = useState(isShared)
  const [token, setToken] = useState(shareToken)
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setShared(isShared)
    setToken(shareToken)
  }, [isShared, shareToken, open])

  const shareUrl = token && typeof window !== "undefined" ? `${window.location.origin}/question-bank/shared/${token}` : ""

  async function toggleSharing(next: boolean) {
    setPending(true)
    try {
      const result = await setSharing({ userId, collectionId, isShared: next })
      setShared(next)
      setToken(result.shareToken ?? undefined)
    } finally {
      setPending(false)
    }
  }

  async function handleCopy() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      // Clipboard API unavailable - the link remains selectable in the input.
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
            <Share2 className="size-[18px]" />
          </span>
          <div>
            <DialogTitle>Share this collection</DialogTitle>
            <DialogDescription className="mt-0.5 truncate">{title}</DialogDescription>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {shared ? <Globe className="size-4 text-success" /> : <Lock className="size-4 text-muted-foreground" />}
            {shared ? "Anyone signed in with the link can view" : "Only you can view"}
          </div>
          <button
            type="button"
            onClick={() => toggleSharing(!shared)}
            disabled={pending}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${shared ? "bg-success" : "bg-border"}`}
            aria-pressed={shared}
            aria-label="Toggle sharing"
          >
            <span
              className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${shared ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </button>
        </div>

        {shared && (
          <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5">
            <LinkIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
            />
            <Button size="sm" onClick={handleCopy} disabled={!shareUrl}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {shared
            ? "Turning sharing off immediately revokes this link - it stops working for anyone who had it."
            : "Sharing a collection shares its questions and generated answers, not your account data."}
        </p>
      </DialogContent>
    </Dialog>
  )
}

export default ShareCollectionDialog
