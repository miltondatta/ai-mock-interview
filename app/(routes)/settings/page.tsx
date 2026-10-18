"use client"

import React, { useState } from "react"
import { Search, User, Settings as SettingsIcon, Globe, SlidersHorizontal, Mic, Bell } from "lucide-react"
import { cn } from "@/lib/utils"
import LanguageSettings from "./LanguageSettings"
import ProfileSettings from "./ProfileSettings"
import AccountSettings from "./AccountSettings"
import InterviewPreferences from "./InterviewPreferences"
import ComingSoonPanel from "./ComingSoonPanel"

const SETTINGS_TABS = [
  { id: "profile", name: "Profile", description: "Personal information", icon: User },
  { id: "account", name: "Account", description: "Security and access", icon: SettingsIcon },
  { id: "language", name: "Language", description: "Interview and app language", icon: Globe },
  { id: "interview-preferences", name: "Interview Preferences", description: "Default settings", icon: SlidersHorizontal },
  { id: "voice-audio", name: "Voice & Audio", description: "Microphone and sound", icon: Mic },
  { id: "notifications", name: "Notifications", description: "Email and in-app alerts", icon: Bell },
] as const

type TabId = (typeof SETTINGS_TABS)[number]["id"]

function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("language")

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your account preferences and interview experience.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search settings..."
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <nav className="flex flex-col gap-1 rounded-xl border border-border bg-card p-2">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = tab.id === activeTab
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                  isActive
                    ? "border border-primary/30 bg-primary/10"
                    : "border border-transparent hover:bg-muted"
                )}
              >
                <Icon className={cn("mt-0.5 size-[18px] shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                <span>
                  <span className={cn("block text-sm font-medium", isActive ? "text-primary" : "text-foreground")}>
                    {tab.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">{tab.description}</span>
                </span>
              </button>
            )
          })}
        </nav>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {activeTab === "language" ? (
            <LanguageSettings />
          ) : activeTab === "profile" ? (
            <ProfileSettings />
          ) : activeTab === "account" ? (
            <AccountSettings />
          ) : activeTab === "interview-preferences" ? (
            <InterviewPreferences />
          ) : (
            (() => {
              const tab = SETTINGS_TABS.find((t) => t.id === activeTab)!
              return <ComingSoonPanel icon={tab.icon} title={tab.name} description={tab.description} />
            })()
          )}
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
