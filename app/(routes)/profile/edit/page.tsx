"use client"

import React, { useContext } from "react"
import Link from "next/link"
import { useUser } from "@clerk/nextjs"
import { useQuery } from "convex/react"
import { ChevronLeft, LoaderCircle } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { UserDetailContext } from "@/context/UserDetailContext"
import { ProfileHeader } from "../_components/ProfileHeader"
import { ProfileForm } from "../_components/ProfileForm"

// Professional Profile set-up and editing (M3 form, reached from the M4 view
// page and from Settings). The form loads every saved section from
// GetMyProfile and saves through ProfessionalProfile.UpdateProfile, which only
// writes professional fields, so onboarding answers and status are never
// touched.
export default function EditProfilePage() {
  const { user, isLoaded } = useUser()
  const { userDetail } = useContext(UserDetailContext)
  const profile = useQuery(
    api.ProfessionalProfile.GetMyProfile,
    userDetail?._id ? { userId: userDetail._id } : "skip"
  )

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 md:py-12">
      <Link href="/profile" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Back to profile
      </Link>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {!isLoaded || !user || !userDetail?._id || profile === undefined ? (
          <div className="flex items-center justify-center p-16 text-sm text-muted-foreground">
            <LoaderCircle className="mr-2 size-4 animate-spin" /> Loading profile…
          </div>
        ) : (
          <>
            <ProfileHeader user={user} />
            {/* The form copies `profile` into its own state once, on mount.
                Later reactive values only refresh the completion summary. */}
            <ProfileForm userId={userDetail._id} profile={profile} />
          </>
        )}
      </div>
    </div>
  )
}
