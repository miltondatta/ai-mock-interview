"use client"

import React, { useCallback, useEffect, useState } from "react"
import { useClerk, useReverification, useSession, useUser } from "@clerk/nextjs"
import {
  Settings as SettingsIcon,
  Mail,
  KeyRound,
  ShieldCheck,
  MonitorSmartphone,
  LogOut,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Smartphone,
  Monitor,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getClerkErrorMessage } from "./clerkError"

type ClerkUser = NonNullable<ReturnType<typeof useUser>["user"]>
type ClerkSessionWithActivities = Awaited<ReturnType<ClerkUser["getSessions"]>>[number]

const DELETE_CONFIRMATION_TEXT = "DELETE"
const PASSWORD_MIN_LENGTH = 8

function formatDateTime(date: Date | null | undefined) {
  if (!date) return "—"
  return new Date(date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

interface SectionProps {
  icon: React.ElementType
  iconClassName: string
  title: string
  description: string
  children: React.ReactNode
}

function Section({ icon: Icon, iconClassName, title, description, children }: SectionProps) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <div className="flex gap-3">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}>
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground sm:text-right">{children}</span>
    </div>
  )
}

function SignInDetails({ user }: { user: ClerkUser }) {
  const { openUserProfile } = useClerk()

  return (
    <Section
      icon={Mail}
      iconClassName="bg-primary/10 text-primary"
      title="Sign-in details"
      description="How you sign in to your account."
    >
      <div className="divide-y divide-border">
        <DetailRow label="Primary email">{user.primaryEmailAddress?.emailAddress ?? "—"}</DetailRow>
        <DetailRow label="Connected accounts">
          {user.externalAccounts.length > 0 ? (
            <span className="flex flex-wrap gap-1.5 sm:justify-end">
              {user.externalAccounts.map((account) => (
                <Badge key={account.id} variant="secondary">
                  {account.providerTitle()}
                  {account.emailAddress ? ` · ${account.emailAddress}` : ""}
                </Badge>
              ))}
            </span>
          ) : (
            "None"
          )}
        </DetailRow>
        <DetailRow label="Two-step verification">
          {user.twoFactorEnabled ? (
            <span className="inline-flex items-center gap-1 text-success">
              <ShieldCheck className="size-4" /> Enabled
            </span>
          ) : (
            "Not enabled"
          )}
        </DetailRow>
        <DetailRow label="Member since">{formatDateTime(user.createdAt)}</DetailRow>
        <DetailRow label="Last sign-in">{formatDateTime(user.lastSignInAt)}</DetailRow>
      </div>
      <div className="mt-3 flex justify-end">
        {/* Adding/verifying emails, connecting social accounts and setting up
            two-step verification all need Clerk's own verification flows. */}
        <Button type="button" variant="outline" onClick={() => openUserProfile()}>
          <ExternalLink />
          Manage security
        </Button>
      </div>
    </Section>
  )
}

function PasswordSection({ user }: { user: ClerkUser }) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [signOutOthers, setSignOutOthers] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Clerk may ask the user to re-confirm their identity before a sensitive
  // change - useReverification shows that prompt and retries automatically.
  const updatePassword = useReverification((params: Parameters<ClerkUser["updatePassword"]>[0]) =>
    user.updatePassword(params)
  )

  const hasPassword = user.passwordEnabled

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaved(false)
    if (hasPassword && !currentPassword) {
      setError("Please enter your current password.")
      return
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setError(`Your new password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError("The new passwords don't match.")
      return
    }

    setError(null)
    setSaving(true)
    try {
      await updatePassword({
        ...(hasPassword ? { currentPassword } : {}),
        newPassword,
        signOutOfOtherSessions: signOutOthers,
      })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setSaved(true)
    } catch (err) {
      setError(getClerkErrorMessage(err, "Unable to update your password. Please try again."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section
      icon={KeyRound}
      iconClassName="bg-success/10 text-success"
      title={hasPassword ? "Change password" : "Set a password"}
      description={
        hasPassword
          ? "Use a strong password you don't use anywhere else."
          : "You currently sign in without a password. Add one to also sign in with your email and password."
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {hasPassword && (
          <Input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={signOutOthers}
            onChange={(e) => setSignOutOthers(e.target.checked)}
            className="size-4 accent-primary"
          />
          Sign out of all other devices
        </label>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {error && <p className="mr-auto text-sm text-destructive">{error}</p>}
          {!error && saved && (
            <p className="mr-auto flex items-center gap-1.5 text-sm text-success">
              <CheckCircle2 className="size-4" /> Password updated.
            </p>
          )}
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {saving ? "Updating…" : hasPassword ? "Update password" : "Set password"}
          </Button>
        </div>
      </form>
    </Section>
  )
}

function ActiveSessions({ user }: { user: ClerkUser }) {
  const { session: currentSession } = useSession()
  const [sessions, setSessions] = useState<ClerkSessionWithActivities[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const revokeSession = useReverification((session: ClerkSessionWithActivities) => session.revoke())

  const loadSessions = useCallback(async () => {
    try {
      const result = await user.getSessions()
      setSessions(result.filter((s) => s.status === "active"))
    } catch (err) {
      setError(getClerkErrorMessage(err, "Unable to load your active devices."))
      setSessions([])
    }
  }, [user])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const onRevoke = async (session: ClerkSessionWithActivities) => {
    setError(null)
    setRevokingId(session.id)
    try {
      await revokeSession(session)
      await loadSessions()
    } catch (err) {
      setError(getClerkErrorMessage(err, "Unable to sign out that device. Please try again."))
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <Section
      icon={MonitorSmartphone}
      iconClassName="bg-violet-500/10 text-violet-500"
      title="Active devices"
      description="Devices currently signed in to your account."
    >
      {sessions === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading devices…
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {sessions.map((session) => {
            const activity = session.latestActivity
            const isCurrent = session.id === currentSession?.id
            const DeviceIcon = activity?.isMobile ? Smartphone : Monitor
            const deviceName = [activity?.browserName, activity?.deviceType].filter(Boolean).join(" on ") || "Unknown device"
            const place = [activity?.city, activity?.country].filter(Boolean).join(", ")
            return (
              <div key={session.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-3">
                  <DeviceIcon className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                      {deviceName}
                      {isCurrent && <Badge variant="secondary">This device</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[place, activity?.ipAddress, `Last active ${formatDateTime(session.lastActiveAt)}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                {!isCurrent && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onRevoke(session)}
                    disabled={revokingId === session.id}
                    className="shrink-0"
                  >
                    {revokingId === session.id && <Loader2 className="animate-spin" />}
                    Sign out
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </Section>
  )
}

function SignOutSection() {
  const { signOut } = useClerk()
  const [signingOut, setSigningOut] = useState(false)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <LogOut className="size-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Sign out</p>
          <p className="mt-0.5 text-sm text-muted-foreground">Sign out of your account on this device.</p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={signingOut}
        onClick={async () => {
          setSigningOut(true)
          await signOut({ redirectUrl: "/" })
        }}
        className="shrink-0"
      >
        {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
        Sign out
      </Button>
    </div>
  )
}

function DeleteAccountSection({ user }: { user: ClerkUser }) {
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const deleteUser = useReverification(() => user.delete())

  const onOpenChange = (next: boolean) => {
    if (deleting) return
    setOpen(next)
    if (!next) {
      setConfirmation("")
      setError(null)
    }
  }

  const onConfirmDelete = async () => {
    setError(null)
    setDeleting(true)
    try {
      await deleteUser()
      window.location.assign("/")
    } catch (err) {
      setError(getClerkErrorMessage(err, "Unable to delete your account. Please try again."))
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Delete account</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {user.deleteSelfEnabled
                ? "Permanently delete your account and sign-in. This cannot be undone."
                : "Account deletion is turned off. Please contact support to delete your account."}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="destructive"
          disabled={!user.deleteSelfEnabled}
          onClick={() => onOpenChange(true)}
          className="shrink-0"
        >
          Delete account
        </Button>
      </div>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This permanently deletes your account and you will be signed out everywhere. This action cannot be
              undone. Type <span className="font-semibold text-foreground">{DELETE_CONFIRMATION_TEXT}</span> to
              confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={DELETE_CONFIRMATION_TEXT}
            aria-label={`Type ${DELETE_CONFIRMATION_TEXT} to confirm`}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmDelete}
              disabled={deleting || confirmation !== DELETE_CONFIRMATION_TEXT}
            >
              {deleting && <Loader2 className="animate-spin" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AccountSettings() {
  const { user, isLoaded } = useUser()

  if (!isLoaded || !user) {
    return (
      <div className="flex items-center justify-center p-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading account…
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-3 border-b border-border p-6">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <SettingsIcon className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Account</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Manage your sign-in, security and access.</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-6">
        <SignInDetails user={user} />
        <PasswordSection user={user} />
        <ActiveSessions user={user} />
        <SignOutSection />
        <DeleteAccountSection user={user} />
      </div>
    </div>
  )
}

export default AccountSettings
