"use client"

import React, { useContext, useEffect, useState } from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { useSession } from "@clerk/nextjs"
import { ArrowRight, BriefcaseBusiness } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { UserDetailContext } from "@/context/UserDetailContext"
import { Button } from "@/components/ui/button"
import { dismissProfileSetupPrompt, isProfileSetupPromptDismissed } from "@/utils/profileSetupPrompt"

// Dashboard profile completion invitation. It replaces the onboarding set-up
// card rather than adding a second one, so the dashboard only ever has one
// invitation.
//   - profile complete -> nothing. It disappears once the profile is completed.
//   - "Maybe Later"    -> hidden for the rest of this sign-in only (see
//     utils/profileSetupPrompt). Signing out and back in - including after a
//     session timeout - gets a new Clerk session id, so the invitation shows
//     again next time if the profile is still incomplete.
export default function ProfileSetupPrompt() {
  const { userDetail } = useContext(UserDetailContext)
  const { session } = useSession()
  const status = useQuery(
    api.ProfessionalProfile.GetOnboardingStatus,
    userDetail?._id ? { userId: userDetail._id } : "skip"
  )
  const [dismissed, setDismissed] = useState(false)

  // Re-checked whenever the session id changes (sign-in/out), so a new
  // session never inherits the previous one's dismissal.
  useEffect(() => {
    setDismissed(isProfileSetupPromptDismissed(session?.id))
  }, [session?.id])

  if (!status || status.isProfileComplete || dismissed) return null

  const onMaybeLater = () => {
    dismissProfileSetupPrompt(session?.id)
    setDismissed(true)
  }

  const started = status.profileCompletionPercent > 0

  // The M2 wizard's quick questions are still offered as an optional
  // shortcut, but only until they've been answered.
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
        </div>
        <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Button variant="ghost" size="lg" onClick={onMaybeLater} className="h-10 px-4 text-muted-foreground">
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
