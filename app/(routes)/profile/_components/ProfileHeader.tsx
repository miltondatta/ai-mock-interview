"use client"

import React, { useState } from "react"
import { useUser } from "@clerk/nextjs"
import { Check, LoaderCircle, Pencil, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getClerkErrorMessage } from "@/app/(routes)/settings/clerkError"

type ClerkUser = NonNullable<ReturnType<typeof useUser>["user"]>

// Name and email come from Clerk, the identity source of truth. Edit changes
// the name in place through Clerk. Email changes need verification, so they
// stay in Settings > Account.
export function ProfileHeader({ user }: { user: ClerkUser }) {
  const [editing, setEditing] = useState(false)
  const [firstName, setFirstName] = useState(user.firstName ?? "")
  const [lastName, setLastName] = useState(user.lastName ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const email = user.primaryEmailAddress?.emailAddress ?? ""
  const fullName = user.fullName?.trim() || email.split("@")[0] || "Your profile"

  const startEdit = () => {
    setFirstName(user.firstName ?? "")
    setLastName(user.lastName ?? "")
    setError(null)
    setEditing(true)
  }

  const save = async () => {
    if (saving) return
    if (!firstName.trim()) {
      setError("First name is required.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await user.update({ firstName: firstName.trim(), lastName: lastName.trim() })
      // app/Provider.tsx copies the Clerk name into UserTable whenever the
      // user object changes.
      await user.reload()
      setEditing(false)
    } catch (e) {
      setError(getClerkErrorMessage(e, "Unable to update your name. Please try again."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-b border-border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-5 py-6 sm:px-8">
      {editing ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={e => {
            e.preventDefault()
            save()
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-first-name" className="text-xs font-medium text-muted-foreground">First name</label>
              <Input id="profile-first-name" value={firstName} maxLength={100} disabled={saving} onChange={e => setFirstName(e.target.value)} className="h-10 bg-card" autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-last-name" className="text-xs font-medium text-muted-foreground">Last name</label>
              <Input id="profile-last-name" value={lastName} maxLength={100} disabled={saving} onChange={e => setLastName(e.target.value)} className="h-10 bg-card" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{email}</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="lg" disabled={saving}>
              {saving ? <LoaderCircle className="animate-spin" /> : <Check />} Save name
            </Button>
            <Button type="button" size="lg" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>
              <X /> Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">{fullName}</h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{email}</p>
          </div>
          <Button variant="outline" size="sm" onClick={startEdit} className="shrink-0 border-primary/40 text-primary">
            <Pencil /> Edit
          </Button>
        </div>
      )}
    </div>
  )
}
