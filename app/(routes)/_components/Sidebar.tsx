"use client"

import React, { useContext } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "motion/react"
import { UserButton } from "@clerk/nextjs"
import { LayoutDashboard, Sparkles, CircleHelp, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { UserDetailContext } from "@/context/UserDetailContext"

const MenuOptions = [
  {
    name: "Dashboard",
    path: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Upgrade",
    path: "/upgrade",
    icon: Sparkles,
  },
  {
    name: "How it works?",
    path: "/how-it-works",
    icon: CircleHelp,
  },
]

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {MenuOptions.map((option) => {
        const isActive = pathname?.startsWith(option.path)
        const Icon = option.icon
        return (
          <Link
            key={option.path}
            href={option.path}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Icon className="size-[18px] shrink-0" />
            <span className="truncate">{option.name}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function SidebarUserFooter() {
  const { userDetail } = useContext(UserDetailContext)

  return (
    <div className="flex items-center gap-3 border-t border-sidebar-border px-4 py-4">
      <UserButton
        appearance={{
          elements: { avatarBox: "w-9 h-9" },
        }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-sidebar-foreground">
          {userDetail?.name || "Your account"}
        </p>
        <p className="truncate text-xs text-sidebar-foreground/60">
          {userDetail?.email || ""}
        </p>
      </div>
    </div>
  )
}

function SidebarBrand() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <img src="/logo.svg" alt="" width={30} height={30} className="shrink-0 rounded-lg" />
      <span className="truncate text-base font-bold text-sidebar-foreground">
        AI Mock Interview
      </span>
    </div>
  )
}

interface SidebarProps {
  mobileOpen: boolean
  onClose: () => void
}

function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <SidebarBrand />
        <SidebarNav />
        <SidebarUserFooter />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              onClick={onClose}
            />
            <motion.aside
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.22, ease: "easeOut" }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar lg:hidden"
            >
              <div className="flex items-center justify-between px-5 py-5">
                <div className="flex items-center gap-2.5">
                  <img src="/logo.svg" alt="" width={28} height={28} className="rounded-lg" />
                  <span className="text-base font-bold text-sidebar-foreground">
                    AI Mock Interview
                  </span>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close menu"
                  className="flex size-8 items-center justify-center rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <X className="size-[18px]" />
                </button>
              </div>
              <SidebarNav onNavigate={onClose} />
              <SidebarUserFooter />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

export default Sidebar
