"use client"

import React, { useContext, useRef, useState } from "react"
import { useUser } from "@clerk/nextjs"
import { useMutation, useQuery } from "convex/react"
import { User, Camera, Trash2, Loader2, CheckCircle2, Mail } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Doc, Id } from "@/convex/_generated/dataModel"
import { UserDetailContext } from "@/context/UserDetailContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getClerkErrorMessage } from "./clerkError"

const EXPERIENCE_LEVELS = [
  { value: "", label: "Select your experience level" },
  { value: "student", label: "Student / Fresher" },
  { value: "entry", label: "Entry level (0-2 years)" },
  { value: "mid", label: "Mid level (3-5 years)" },
  { value: "senior", label: "Senior (6-10 years)" },
  { value: "lead", label: "Lead / Manager (10+ years)" },
  { value: "executive", label: "Executive / Director" },
]

const BIO_MAX_LENGTH = 500
const AVATAR_MAX_BYTES = 10 * 1024 * 1024

interface FieldProps {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}

function Field({ label, htmlFor, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

type ClerkUser = NonNullable<ReturnType<typeof useUser>["user"]>

function AvatarSection({ user }: { user: ClerkUser }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset so choosing the same file again still fires onChange.
    e.target.value = ""
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (JPG, PNG, GIF or WEBP).")
      return
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setError("Please choose an image smaller than 10 MB.")
      return
    }
    setError(null)
    setBusy("upload")
    try {
      await user.setProfileImage({ file })
      await user.reload()
    } catch (err) {
      setError(getClerkErrorMessage(err, "Unable to update your photo. Please try again."))
    } finally {
      setBusy(null)
    }
  }

  const onRemove = async () => {
    setError(null)
    setBusy("remove")
    try {
      await user.setProfileImage({ file: null })
      await user.reload()
    } catch (err) {
      setError(getClerkErrorMessage(err, "Unable to remove your photo. Please try again."))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-4 sm:flex-row sm:items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={user.imageUrl}
        alt="Profile photo"
        className="size-20 shrink-0 rounded-full border border-border object-cover"
      />
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">Profile photo</p>
        <p className="mt-0.5 text-sm text-muted-foreground">JPG, PNG, GIF or WEBP. Max 10 MB.</p>
        {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
      </div>
      <div className="flex gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={!!busy}>
          {busy === "upload" ? <Loader2 className="animate-spin" /> : <Camera />}
          {user.hasImage ? "Change" : "Upload"}
        </Button>
        {user.hasImage && (
          <Button type="button" variant="ghost" onClick={onRemove} disabled={!!busy} className="text-muted-foreground">
            {busy === "remove" ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Remove
          </Button>
        )}
      </div>
    </div>
  )
}

interface ProfileSettingsFormProps {
  user: ClerkUser
  userId: Id<"UserTable">
  initial: Doc<"UserProfileTable"> | null
}

// Keyed by the loaded profile doc (or "new") from the parent so state is
// initialized from the query result on mount, instead of via an effect.
function ProfileSettingsForm({ user, userId, initial }: ProfileSettingsFormProps) {
  const saveUserProfile = useMutation(api.UserProfile.SaveUserProfile)

  const [firstName, setFirstName] = useState(user.firstName ?? "")
  const [lastName, setLastName] = useState(user.lastName ?? "")
  const [phone, setPhone] = useState(initial?.phone ?? "")
  const [headline, setHeadline] = useState(initial?.headline ?? "")
  const [location, setLocation] = useState(initial?.location ?? "")
  const [experienceLevel, setExperienceLevel] = useState(initial?.experienceLevel ?? "")
  const [linkedinUrl, setLinkedinUrl] = useState(initial?.linkedinUrl ?? "")
  const [bio, setBio] = useState(initial?.bio ?? "")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const withDirty =
    (setter: (value: string) => void) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setSaved(false)
      setter(e.target.value)
    }

  const handleCancel = () => {
    setSaved(false)
    setError(null)
    setFirstName(user.firstName ?? "")
    setLastName(user.lastName ?? "")
    setPhone(initial?.phone ?? "")
    setHeadline(initial?.headline ?? "")
    setLocation(initial?.location ?? "")
    setExperienceLevel(initial?.experienceLevel ?? "")
    setLinkedinUrl(initial?.linkedinUrl ?? "")
    setBio(initial?.bio ?? "")
  }

  const handleSave = async () => {
    const trimmedFirstName = firstName.trim()
    const trimmedLastName = lastName.trim()
    const trimmedLinkedin = linkedinUrl.trim()
    if (!trimmedFirstName) {
      setError("Please enter your first name.")
      return
    }
    if (trimmedLinkedin && !/^https?:\/\/\S+$/i.test(trimmedLinkedin)) {
      setError("Please enter a full LinkedIn URL, starting with https://")
      return
    }

    setError(null)
    setSaving(true)
    try {
      // Name lives in Clerk - app/Provider.tsx syncs the change into UserTable.
      if (trimmedFirstName !== (user.firstName ?? "") || trimmedLastName !== (user.lastName ?? "")) {
        await user.update({ firstName: trimmedFirstName, lastName: trimmedLastName })
      }
      await saveUserProfile({
        userId,
        phone: phone.trim(),
        headline: headline.trim(),
        location: location.trim(),
        experienceLevel,
        linkedinUrl: trimmedLinkedin,
        bio: bio.trim(),
      })
      setSaved(true)
    } catch (err) {
      setError(getClerkErrorMessage(err, "Unable to save your profile. Please try again."))
    } finally {
      setSaving(false)
    }
  }

  const selectClassName =
    "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-3 border-b border-border p-6">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <User className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Profile</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Your personal information and professional background.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6 p-6">
        <AvatarSection user={user} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="profile-first-name">
            <Input id="profile-first-name" value={firstName} onChange={withDirty(setFirstName)} autoComplete="given-name" />
          </Field>
          <Field label="Last name" htmlFor="profile-last-name">
            <Input id="profile-last-name" value={lastName} onChange={withDirty(setLastName)} autoComplete="family-name" />
          </Field>
          <Field label="Email" htmlFor="profile-email" hint="Change your sign-in email from the Account tab.">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="profile-email"
                value={user.primaryEmailAddress?.emailAddress ?? ""}
                readOnly
                disabled
                className="pl-9"
              />
            </div>
          </Field>
          <Field label="Phone number" htmlFor="profile-phone">
            <Input
              id="profile-phone"
              type="tel"
              value={phone}
              onChange={withDirty(setPhone)}
              placeholder="Ex. +880 1712 345678"
              autoComplete="tel"
            />
          </Field>
          <Field label="Current role / headline" htmlFor="profile-headline">
            <Input
              id="profile-headline"
              value={headline}
              onChange={withDirty(setHeadline)}
              placeholder="Ex. Senior Project Manager"
            />
          </Field>
          <Field label="Location" htmlFor="profile-location">
            <Input
              id="profile-location"
              value={location}
              onChange={withDirty(setLocation)}
              placeholder="Ex. Dhaka, Bangladesh"
              autoComplete="address-level2"
            />
          </Field>
          <Field label="Experience level" htmlFor="profile-experience">
            <select
              id="profile-experience"
              value={experienceLevel}
              onChange={withDirty(setExperienceLevel)}
              className={selectClassName}
            >
              {EXPERIENCE_LEVELS.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="LinkedIn profile" htmlFor="profile-linkedin">
            <Input
              id="profile-linkedin"
              type="url"
              value={linkedinUrl}
              onChange={withDirty(setLinkedinUrl)}
              placeholder="https://www.linkedin.com/in/your-name"
            />
          </Field>
        </div>

        <Field label="Short bio" htmlFor="profile-bio" hint={`${bio.length}/${BIO_MAX_LENGTH} characters`}>
          <Textarea
            id="profile-bio"
            value={bio}
            onChange={withDirty(setBio)}
            maxLength={BIO_MAX_LENGTH}
            rows={4}
            placeholder="A few lines about your background and the roles you're preparing for."
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border p-6">
        {error && <p className="mr-auto text-sm text-destructive">{error}</p>}
        {!error && saved && (
          <p className="mr-auto flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="size-4" /> Profile saved.
          </p>
        )}
        <Button type="button" variant="outline" onClick={handleCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}

function ProfileSettings() {
  const { user, isLoaded } = useUser()
  const { userDetail } = useContext(UserDetailContext)
  const profile = useQuery(
    api.UserProfile.GetUserProfile,
    userDetail?._id ? { userId: userDetail._id } : "skip"
  )

  if (!isLoaded || !user || !userDetail?._id || profile === undefined) {
    return (
      <div className="flex items-center justify-center p-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading profile…
      </div>
    )
  }

  return (
    <ProfileSettingsForm
      key={profile?._id ?? "new"}
      user={user}
      userId={userDetail._id}
      initial={profile}
    />
  )
}

export default ProfileSettings
