"use client"

import React, { useState } from "react"
import Sidebar from "./Sidebar"
import AppHeader from "./AppHeader"

function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <AppHeader onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}

export default AppShell
