"use client"

import React from "react"
import Link from "next/link"
import { UserButton } from "@clerk/nextjs"
import { Menu } from "lucide-react"

interface AppHeaderProps {
  onMenuClick: () => void
}

function AppHeader({ onMenuClick }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm lg:hidden">
      <div className="flex items-center gap-2.5">
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          className="flex size-9 items-center justify-center rounded-lg text-foreground hover:bg-muted"
        >
          <Menu className="size-5" />
        </button>
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="" width={26} height={26} className="rounded-md" />
          <span className="text-sm font-bold">AI Mock Interview</span>
        </Link>
      </div>
      <UserButton appearance={{ elements: { avatarBox: "w-8 h-8" } }} />
    </header>
  )
}

export default AppHeader
