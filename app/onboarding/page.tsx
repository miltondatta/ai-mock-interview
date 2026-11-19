"use client"

import React, { useContext, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "convex/react"
import { LoaderCircle } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { UserDetailContext } from "@/context/UserDetailContext"
import { OnboardingWizard } from "./_components/OnboardingWizard"
import { PRODUCT_NAME } from "./constants"

// Onboarding wizard (M2). It sits outside the (routes) group, so it shows
// full-screen without the app sidebar. proxy.ts already requires a Clerk
// session here. Answers are saved step by step through
// convex/ProfessionalProfile.ts, so an unfinished onboarding reopens where
// the user left off.
export default function OnboardingPage() {
  const router = useRouter()
  const { userDetail } = useContext(UserDetailContext)
  const profile = useQuery(
    api.ProfessionalProfile.GetMyProfile,
    userDetail?._id ? { userId: userDetail._id } : "skip"
  )
  // Decided once, on first load. Users who had already finished onboarding go
  // to the dashboard. Everyone else keeps the wizard mounted even after
  // Finish marks onboarding complete, so the "Personalizing..." screen stays
  // up until the wizard navigates away itself.
  const [phase, setPhase] = useState<"loading" | "wizard" | "redirect">("loading")
  if (phase === "loading" && userDetail?._id && profile !== undefined) {
    setPhase(profile?.onboardingStatus === "completed" ? "redirect" : "wizard")
  }

  useEffect(() => {
    if (phase === "redirect") router.replace("/dashboard")
  }, [phase, router])

  const loading = phase !== "wizard" || !userDetail?._id

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center gap-2.5 px-5 py-4 sm:px-8">
        <img src="/logo.svg" alt="" width={28} height={28} className="rounded-lg" />
        <span className="text-base font-bold text-foreground">{PRODUCT_NAME}</span>
        {/* M5: set-up is optional. Every answer is saved step by step, so
            leaving keeps the progress, and the dashboard offers to continue. */}
        <Link href="/dashboard" className="ml-auto text-sm text-muted-foreground hover:text-foreground">
          Skip for now
        </Link>
      </header>
      <main className="flex flex-1 justify-center px-4 pt-8 pb-16 sm:px-6 sm:pt-16">
        {loading ? (
          <div className="flex items-center text-sm text-muted-foreground">
            <LoaderCircle className="mr-2 size-4 animate-spin" /> Loading…
          </div>
        ) : (
          // The wizard reads `profile` only to set its initial state. Later
          // reactive updates (from its own saves) don't reset it.
          <OnboardingWizard userId={userDetail._id} profile={profile ?? null} />
        )}
      </main>
    </div>
  )
}
