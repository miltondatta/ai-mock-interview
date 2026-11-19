"use client"

import React from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { BriefcaseBusiness, ChevronRight, LoaderCircle } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { hasProfessionalData } from "@/app/(routes)/profile/_lib/formState"

// Settings > Profile: "Profile Setup" entry point for the Professional Profile
// (/profile). It shows Set Up Profile until any professional details have
// been saved, then Edit Profile. Onboarding answers alone don't count as a
// saved profile.
export default function ProfileSetupCard({ userId }: { userId: Id<"UserTable"> }) {
  const profile = useQuery(api.ProfessionalProfile.GetMyProfile, { userId })
  const hasProfile = profile !== undefined && hasProfessionalData(profile)

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-4 sm:flex-row sm:items-center">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <BriefcaseBusiness className="size-5" />
      </span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">Profile Setup</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {profile === undefined
            ? "Checking your professional profile…"
            : hasProfile
              ? profile?.completion.isComplete
                ? "Your professional profile is complete. Keep it up to date for better-tailored interviews."
                : `Your professional profile is ${profile?.completion.percent ?? 0}% complete.`
              : "Add your experience, skills and projects, or import them from a resume, to tailor your mock interviews."}
        </p>
      </div>
      {profile === undefined ? (
        <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
      ) : (
        <Button
          variant={hasProfile ? "outline" : "default"}
          nativeButton={false}
          /* Set-up and editing share one form, which loads any saved data. */
          render={<Link href="/profile/edit" />}
        >
          {hasProfile ? "Edit Profile" : "Set Up Profile"} <ChevronRight />
        </Button>
      )}
    </div>
  )
}
