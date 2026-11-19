"use client"

import React, { useContext, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { useMutation, useQuery } from "convex/react"
import { ArrowRight, LoaderCircle, Sparkles } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { UserDetailContext } from "@/context/UserDetailContext"
import { Button } from "@/components/ui/button"
import { PRODUCT_NAME } from "@/app/onboarding/constants"

// Post-signup landing (M5). Clerk's <SignUp> is pointed here with
// forceRedirectUrl, and that's the only change to the auth flow. Profile
// set-up is optional:
//   - Continue to Profile Setup opens the M2 wizard (/onboarding), which
//     resumes partial progress.
//   - Skip for Now records the choice (DismissProfilePrompt) and goes to the
//     dashboard, without touching onboarding or profile completion.
// Anyone who has already finished onboarding goes straight to the
// dashboard. /dashboard never redirects back here, so there's no loop.
export default function WelcomePage() {
  const router = useRouter()
  const { user } = useUser()
  const { userDetail } = useContext(UserDetailContext)
  const status = useQuery(
    api.ProfessionalProfile.GetOnboardingStatus,
    userDetail?._id ? { userId: userDetail._id } : "skip"
  )
  const dismiss = useMutation(api.ProfessionalProfile.DismissProfilePrompt)
  const [leaving, setLeaving] = useState<"continue" | "skip" | null>(null)
  const inFlight = useRef(false)

  // Decided once, on first load, so the screen doesn't flip while the user is on it.
  const [phase, setPhase] = useState<"loading" | "offer" | "redirect">("loading")
  if (phase === "loading" && status !== undefined) {
    setPhase(status.isOnboardingComplete || status.isProfileComplete ? "redirect" : "offer")
  }
  useEffect(() => {
    if (phase === "redirect") router.replace("/dashboard")
  }, [phase, router])

  const onContinue = () => {
    if (inFlight.current) return
    inFlight.current = true
    setLeaving("continue")
    router.push("/onboarding")
  }

  const onSkip = async () => {
    if (inFlight.current || !userDetail?._id) return
    inFlight.current = true
    setLeaving("skip")
    try {
      await dismiss({ userId: userDetail._id })
    } catch (e) {
      // Saving the skip only affects how the dashboard prompt looks, so
      // dashboard access is never blocked on it.
      console.error("Failed to record profile set-up skip:", e)
    }
    router.replace("/dashboard")
  }

  const firstName = user?.firstName?.trim()
  const resuming = status?.status === "in_progress"

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center gap-2.5 px-5 py-4 sm:px-8">
        <img src="/logo.svg" alt="" width={28} height={28} className="rounded-lg" />
        <span className="text-base font-bold text-foreground">{PRODUCT_NAME}</span>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        {phase !== "offer" ? (
          <div className="flex items-center text-sm text-muted-foreground">
            <LoaderCircle className="mr-2 size-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-10">
            <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-6" />
            </span>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-foreground">
              Welcome to {PRODUCT_NAME}{firstName ? `, ${firstName}` : ""}!
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {resuming
                ? "You're partway through setting up your profile. Pick up where you left off. It only takes a minute."
                : "Answer a few quick questions about your target role and timeline so we can tailor your mock interviews and prep plan. It's optional and takes about a minute."}
            </p>
            <div className="mt-8 flex flex-col gap-2.5">
              <Button size="lg" className="h-11 text-sm" disabled={leaving !== null} onClick={onContinue}>
                {leaving === "continue" ? <LoaderCircle className="animate-spin" /> : null}
                {resuming ? "Continue Profile Setup" : "Continue to Profile Setup"}
                {leaving !== "continue" && <ArrowRight />}
              </Button>
              <Button size="lg" variant="ghost" className="h-11 text-sm text-muted-foreground" disabled={leaving !== null} onClick={onSkip}>
                {leaving === "skip" ? <LoaderCircle className="animate-spin" /> : null}
                Skip for Now
              </Button>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              You can set up your profile any time from the dashboard, My Profile or Settings.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
