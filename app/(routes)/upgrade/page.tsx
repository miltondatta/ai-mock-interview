"use client"

import React from "react"
import { PricingTable } from "@clerk/nextjs"
import { BarChart3, Check, Crown, FileText, Mail, Sparkles, User, Zap } from "lucide-react"

const TRUST_POINTS = ["No long-term contract", "Cancel anytime", "Secure payment"]

const WHY_UPGRADE = [
  {
    icon: Zap,
    tone: "bg-destructive/10 text-destructive",
    title: "More Interviews",
    description: "Generate 2 AI mock interviews every day.",
  },
  {
    icon: BarChart3,
    tone: "bg-violet-500/10 text-violet-500",
    title: "Advanced Analytics",
    description: "Get deeper insights into your resume and performance.",
  },
  {
    icon: Crown,
    tone: "bg-primary/10 text-primary",
    title: "Full Feature Access",
    description: "Unlock all premium tools and upcoming features.",
  },
  {
    icon: Mail,
    tone: "bg-blue-500/10 text-blue-500",
    title: "Priority Support",
    description: "Get faster responses from our support team.",
  },
] as const

function Upgrade() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/15 p-6 md:p-10">
        <div className="pointer-events-none absolute -top-20 right-[-5%] size-96 rounded-full bg-primary/25 blur-[100px]" />

        {/* Decorative icon cluster */}
        <div className="pointer-events-none absolute right-6 top-1/2 hidden h-56 w-72 -translate-y-1/2 lg:block xl:right-14">
          <DecorationIcon icon={BarChart3} className="absolute top-2 left-0" />
          <DecorationIcon icon={User} className="absolute bottom-6 left-10 size-11" iconClassName="size-4" />
          <DecorationIcon icon={FileText} className="absolute right-0 top-10" />
          <span className="absolute bottom-0 left-1/2 h-20 w-28 -translate-x-1/2 rounded-t-full bg-primary/20" />
          <span className="absolute bottom-16 left-1/2 flex size-16 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/40">
            <Crown className="size-7" />
          </span>
          <Sparkles className="absolute top-6 left-1/2 size-4 -translate-x-8 text-primary" />
          <Sparkles className="absolute top-16 left-1/2 size-3 translate-x-10 text-primary/70" />
        </div>

        <div className="relative max-w-xl">
          <span className="inline-flex items-center rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
            Upgrade Plan
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
            Choose the plan that fits you
          </h1>
          <p className="mt-3 text-sm text-muted-foreground md:text-base">
            Unlock the full power of AI to prepare smarter, match better, and land your dream job.
            Start free or upgrade for unlimited access and advanced features.
          </p>
          <ul className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-foreground/80">
            {TRUST_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-1.5">
                <span className="flex size-4 items-center justify-center rounded-full bg-success text-white">
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Plans */}
      <div className="mt-10">
        <PricingTable
          highlightedPlan="pro"
          appearance={{
            variables: {
              colorPrimary: "var(--primary)",
              colorBackground: "var(--card)",
              colorForeground: "var(--foreground)",
              colorMutedForeground: "var(--muted-foreground)",
              colorInput: "var(--input)",
              colorInputForeground: "var(--foreground)",
              colorNeutral: "var(--muted-foreground)",
              colorDanger: "var(--destructive)",
              colorSuccess: "var(--success)",
              colorWarning: "var(--warning)",
              borderRadius: "var(--radius)",
              fontFamily: "inherit",
            },
            elements: {
              card: "border border-border shadow-none rounded-2xl",
              badge: "rounded-full font-semibold",
              formButtonPrimary: "rounded-lg font-semibold",
            },
          }}
        />
      </div>

      {/* Why upgrade */}
      <div className="mt-10 rounded-2xl border border-border bg-card p-6 shadow-xs md:p-8">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Why Upgrade to Pro?</h2>
            <p className="text-sm text-muted-foreground">Get more value, more features, and better results with Pro.</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {WHY_UPGRADE.map(({ icon: Icon, tone, title, description }) => (
            <div key={title} className="flex items-start gap-3">
              <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DecorationIcon({
  icon: Icon,
  className = "",
  iconClassName = "size-5",
}: {
  icon: React.ElementType
  className?: string
  iconClassName?: string
}) {
  return (
    <span
      className={`flex size-12 items-center justify-center rounded-2xl border border-border bg-card/90 text-primary shadow-md backdrop-blur-sm ${className}`}
    >
      <Icon className={iconClassName} />
    </span>
  )
}

export default Upgrade
