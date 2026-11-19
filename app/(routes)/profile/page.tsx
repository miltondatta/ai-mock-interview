"use client"

import React, { useContext } from "react"
import Link from "next/link"
import { useUser } from "@clerk/nextjs"
import { useQuery } from "convex/react"
import {
  Award,
  BriefcaseBusiness,
  ExternalLink,
  FileText,
  FolderOpen,
  GraduationCap,
  LoaderCircle,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Sparkles,
  UserRound,
} from "lucide-react"
import { api } from "@/convex/_generated/api"
import { UserDetailContext } from "@/context/UserDetailContext"
import { Button } from "@/components/ui/button"
import { hasProfessionalData, type LoadedProfile } from "./_lib/formState"

// Professional Profile view (M4). Read-only and built from GetMyProfile.
// Sections with no data are hidden, and a user with no professional details
// sees an empty state that leads to set-up. Edit opens the M3 form at
// /profile/edit, pre-filled with everything shown here.

type Profile = NonNullable<LoadedProfile>

const MISSING_LABELS: Record<string, string> = {
  headline: "a headline",
  professionalSummary: "a summary",
  location: "your location",
  skills: "at least one skill",
  experienceOrEducation: "work experience or education",
}

// Stored URLs are already validated as http(s) by the backend. The scheme is
// stripped for display.
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "")
}

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border px-5 py-6 sm:px-8">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="size-4 text-muted-foreground" /> {title}
      </h2>
      {children}
    </section>
  )
}

function ExternalLinkChip({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary/40 hover:text-primary"
    >
      <span className="font-medium">{label}</span>
      <span className="truncate text-muted-foreground">{displayUrl(url)}</span>
      <ExternalLink className="size-3 shrink-0" />
    </a>
  )
}

function EditButton({ label = "Edit" }: { label?: string }) {
  return (
    <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/profile/edit" />} className="shrink-0 border-primary/40 bg-card text-primary">
      <Pencil /> {label}
    </Button>
  )
}

export default function ProfileViewPage() {
  const { user, isLoaded } = useUser()
  const { userDetail } = useContext(UserDetailContext)
  const profile = useQuery(
    api.ProfessionalProfile.GetMyProfile,
    userDetail?._id ? { userId: userDetail._id } : "skip"
  )

  const email = user?.primaryEmailAddress?.emailAddress ?? ""
  const fullName = user?.fullName?.trim() || email.split("@")[0] || "Your profile"
  const hasData = hasProfessionalData(profile ?? null)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 md:py-12">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {!isLoaded || !user || !userDetail?._id || profile === undefined ? (
          <div className="flex items-center justify-center p-16 text-sm text-muted-foreground">
            <LoaderCircle className="mr-2 size-4 animate-spin" /> Loading profile…
          </div>
        ) : (
          <>
            {/* Header: identity from Clerk, headline from the profile */}
            <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-5 py-6 sm:px-8">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={user.imageUrl} alt="" className="size-14 shrink-0 rounded-full border border-border object-cover" />
                  <div className="min-w-0">
                    <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">{fullName}</h1>
                    {profile?.headline && <p className="mt-0.5 text-sm font-medium text-primary">{profile.headline}</p>}
                  </div>
                </div>
                {hasData && <EditButton />}
              </div>
              <ContactRow email={email} profile={profile ?? null} />
            </div>

            {hasData && profile ? <ProfileSections profile={profile} /> : <EmptyState />}
          </>
        )}
      </div>
    </div>
  )
}

function ContactRow({ email, profile }: { email: string; profile: LoadedProfile }) {
  const items = [
    { icon: Mail, text: email },
    { icon: MapPin, text: profile?.location },
    { icon: Phone, text: profile?.phone },
  ].filter(i => i.text)
  const links = [
    { label: "LinkedIn", url: profile?.linkedinUrl },
    { label: "GitHub", url: profile?.githubUrl },
    { label: "Website", url: profile?.websiteUrl },
  ].filter((l): l is { label: string; url: string } => !!l.url)

  return (
    <>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
        {items.map(({ icon: Icon, text }) => (
          <li key={text} className="flex min-w-0 items-center gap-1.5">
            <Icon className="size-4 shrink-0" /> <span className="truncate">{text}</span>
          </li>
        ))}
      </ul>
      {links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {links.map(l => <ExternalLinkChip key={l.label} label={l.label} url={l.url} />)}
        </div>
      )}
    </>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center border-t border-border px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <UserRound className="size-6" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-foreground">Set up your professional profile</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Add your experience, skills and projects, or import them from a resume, to tailor your mock interviews.
      </p>
      <Button size="lg" nativeButton={false} render={<Link href="/profile/edit" />} className="mt-5 h-10 px-5">
        Set Up Profile
      </Button>
    </div>
  )
}

function ProfileSections({ profile }: { profile: Profile }) {
  const { completion } = profile
  return (
    <>
      {!completion.isComplete && (
        <div className="border-t border-border px-5 py-4 sm:px-8">
          <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">Profile {completion.percent}% complete</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/15" role="progressbar" aria-valuenow={completion.percent} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${completion.percent}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Add {completion.missing.map(m => MISSING_LABELS[m] ?? m).join(", ")} to complete it.
              </p>
            </div>
            <EditButton label="Complete profile" />
          </div>
        </div>
      )}

      {profile.professionalSummary && (
        <Section icon={Sparkles} title="Summary">
          <p className="text-sm leading-relaxed whitespace-pre-line text-foreground">{profile.professionalSummary}</p>
        </Section>
      )}

      {!!profile.workExperience?.length && (
        <Section icon={BriefcaseBusiness} title="Work Experience">
          <ol className="relative flex flex-col gap-6 border-l border-border pl-5">
            {profile.workExperience.map((w, i) => {
              const duration = w.duration || [w.startDate, w.isCurrent ? "Present" : w.endDate].filter(Boolean).join(" – ")
              return (
                <li key={`${w.company}-${i}`} className="relative">
                  <span aria-hidden className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-card bg-primary" />
                  <p className="text-sm font-semibold text-foreground">{w.position}</p>
                  <p className="text-sm text-muted-foreground">
                    {w.company}
                    {duration && <span> · {duration}</span>}
                  </p>
                  {!!w.responsibilities?.length && (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-foreground marker:text-muted-foreground">
                      {w.responsibilities.map((r, j) => <li key={j}>{r}</li>)}
                    </ul>
                  )}
                </li>
              )
            })}
          </ol>
        </Section>
      )}

      {!!profile.education?.length && (
        <Section icon={GraduationCap} title="Education">
          <ul className="flex flex-col gap-4">
            {profile.education.map((e, i) => (
              <li key={`${e.institution}-${i}`} className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{e.institution}</p>
                  {(e.degree || e.fieldOfStudy) && (
                    <p className="text-sm text-muted-foreground">{[e.degree, e.fieldOfStudy].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
                {e.graduationYear && <span className="shrink-0 text-sm text-muted-foreground">{e.graduationYear}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!!profile.skills?.length && (
        <Section icon={Sparkles} title="Skills">
          <ul className="flex flex-wrap gap-1.5">
            {profile.skills.map(s => (
              <li key={s} className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{s}</li>
            ))}
          </ul>
        </Section>
      )}

      {!!profile.certifications?.length && (
        <Section icon={Award} title="Certifications">
          <ul className="flex flex-col gap-2.5">
            {profile.certifications.map((c, i) => (
              <li key={`${c.name}-${i}`} className="flex items-start justify-between gap-4 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{c.name}</p>
                  {c.issuer && <p className="text-muted-foreground">{c.issuer}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                  {c.year && <span>{c.year}</span>}
                  {c.credentialUrl && (
                    <a href={c.credentialUrl} target="_blank" rel="noopener noreferrer" aria-label={`View credential for ${c.name}`} className="hover:text-primary">
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!!profile.projects?.length && (
        <Section icon={FolderOpen} title="Projects">
          <ul className="grid gap-3 sm:grid-cols-2">
            {profile.projects.map((p, i) => (
              <li key={`${p.title}-${i}`} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{p.title}</p>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${p.title}`} className="text-muted-foreground hover:text-primary">
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
                {p.description && <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{p.description}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {profile.resume && (
        <Section icon={FileText} title="Resume">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="size-4" />
              </span>
              <span className="truncate text-sm font-medium text-foreground">{profile.resume.fileName}</span>
            </div>
            <Link href="/manage-resume" className="shrink-0 text-sm text-primary hover:text-primary/80">Manage resumes</Link>
          </div>
        </Section>
      )}
    </>
  )
}
