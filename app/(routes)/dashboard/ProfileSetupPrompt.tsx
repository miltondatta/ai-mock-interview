"use client"

import React, { useContext, useRef, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery } from "convex/react"
import { ArrowRight, BriefcaseBusiness, LoaderCircle } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { UserDetailContext } from "@/context/UserDetailContext"
import { Button } from "@/components/ui/button"

// How long "Maybe Later" (or "Skip for Now" on /welcome) hides the full
// invitation before it's shown again. It keeps coming back until the profile
// is complete.
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

// Dashboard profile completion invitation (M6). It replaces the M5 set-up
// card rather than adding a second one, so the dashboard only ever has one
// invitation. Everything comes from Convex (GetOnboardingStatus):
//   - profile complete        -> nothing. It disappears once the profile is completed.
//   - snoozed (recent dismissal) -> a one-line link, so set-up stays reachable.
//   - otherwise               -> the full invitation card.
// Dismissal is stored on the server (profilePromptDismissedAt), so it holds
// across refreshes, devices and sign-ins, and it never changes profile or
// onboarding completion. Only the "is the snooze over yet" check uses the
// browser clock. Nothing here redirects (see M5 "Redirect loops").
export default function ProfileSetupPrompt() {
  const { userDetail } = useContext(UserDetailContext)
  const status = useQuery(
    api.ProfessionalProfile.GetOnboardingStatus,
    userDetail?._id ? { userId: userDetail._id } : "skip"
  )
  const dismiss = useMutation(api.ProfessionalProfile.DismissProfilePrompt)
  const [dismissing, setDismissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  // Read once per mount. A dashboard visit after the snooze ends shows the card again.
  const [now] = useState(() => Date.now())

  if (!status || status.isProfileComplete) return null

  const snoozed = status.profilePromptDismissedAt !== null && now - status.profilePromptDismissedAt < SNOOZE_MS
  const started = status.profileCompletionPercent > 0

  if (snoozed) {
    return (
      <Link href="/profile/edit" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80">
        <BriefcaseBusiness className="size-4" />
        {started ? "Finish your profile" : "Complete your profile"} for personalized job recommendations
        <ArrowRight className="size-3.5" />
      </Link>
    )
  }

  const onMaybeLater = async () => {
    if (inFlight.current || !userDetail?._id) return
    inFlight.current = true
    setDismissing(true)
    setError(null)
    try {
      // The reactive query refreshes and swaps the card for the one-line link.
      await dismiss({ userId: userDetail._id })
    } catch (e) {
      console.error("Failed to dismiss profile invitation:", e)
      setError("Couldn't hide this right now. Please try again.")
    } finally {
      inFlight.current = false
      setDismissing(false)
    }
  }

  // The M2 wizard's quick questions are still offered as an optional
  // shortcut, as in M5, but only until they've been answered.
  const wizardLink = status.isOnboardingComplete
    ? null
    : status.status === "in_progress"
      ? { href: "/onboarding", label: "Or continue the quick setup questions" }
      : { href: "/onboarding", label: "Or start with 5 quick questions" }

  return (
    <section
      aria-labelledby="profile-invitation-title"
      className="mt-8 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-card"
    >
      <div className="flex flex-col gap-5 p-5 sm:p-6 md:flex-row md:items-center">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <BriefcaseBusiness className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="profile-invitation-title" className="text-base font-semibold text-foreground sm:text-lg">
            Get personalized job recommendations
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Complete your professional profile to discover job opportunities that match your skills, experience,
            qualifications and career interests.
          </p>
          {started && (
            <div className="mt-3 flex items-center gap-3">
              <div
                className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-primary/15"
                role="progressbar"
                aria-label="Profile completion"
                aria-valuenow={status.profileCompletionPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${status.profileCompletionPercent}%` }} />
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{status.profileCompletionPercent}% complete</span>
            </div>
          )}
          {wizardLink && (
            <Link href={wizardLink.href} className="mt-2 inline-block text-xs font-medium text-primary hover:text-primary/80">
              {wizardLink.label}
            </Link>
          )}
          {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Button variant="ghost" size="lg" disabled={dismissing} onClick={onMaybeLater} className="h-10 px-4 text-muted-foreground">
            {dismissing && <LoaderCircle className="animate-spin" />}
            Maybe Later
          </Button>
          <Button size="lg" nativeButton={false} render={<Link href="/profile/edit" />} className="h-10 px-5">
            Set Up My Profile <ArrowRight />
          </Button>
        </div>
      </div>
    </section>
  )
}
