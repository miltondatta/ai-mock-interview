"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Settings,
  Menu,
  X,
  LogOut,
  ShieldCheck,
  KeyRound,
  SlidersHorizontal,
  Languages,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";

type MenuItem = {
  name: string;
  path: string;
  icon: React.ElementType;
  children?: { name: string; path: string; icon: React.ElementType }[];
};

const MENU: MenuItem[] = [
  { name: "Dashboard", path: "/admin", icon: LayoutDashboard },
  { name: "Users", path: "/admin/users", icon: Users },
  { name: "Subscription", path: "/admin/subscription", icon: CreditCard },
  {
    name: "Settings",
    path: "/admin/settings",
    icon: Settings,
    children: [
      { name: "Change Password", path: "/admin/settings/change-password", icon: KeyRound },
      { name: "General Settings", path: "/admin/settings/general", icon: SlidersHorizontal },
      { name: "Languages", path: "/admin/settings/language", icon: Languages },
      { name: "Interview Modes", path: "/admin/settings/interview-modes", icon: ListChecks },
    ],
  },
];

function isActive(pathname: string | null, path: string) {
  if (!pathname) return false;
  if (path === "/admin") return pathname === "/admin";
  return pathname === path || pathname.startsWith(path + "/");
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
      {MENU.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.path);
        return (
          <div key={item.path} className="flex flex-col gap-1">
            <Link
              href={item.path}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="size-[18px] shrink-0" />
              <span className="truncate">{item.name}</span>
            </Link>
            {item.children && (
              <div className="ml-5 flex flex-col gap-1 border-l border-sidebar-border pl-3">
                {item.children.map((child) => {
                  const ChildIcon = child.icon;
                  const childActive = isActive(pathname, child.path);
                  return (
                    <Link
                      key={child.path}
                      href={child.path}
                      onClick={onNavigate}
                      aria-current={childActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        childActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <ChildIcon className="size-4 shrink-0" />
                      <span className="truncate">{child.name}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <ShieldCheck className="size-[18px]" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-sidebar-foreground">AI Mock Interview</p>
        <p className="truncate text-xs text-sidebar-foreground/60">Admin panel</p>
      </div>
    </div>
  );
}

function SignOutButton({ full }: { full?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const signOut = async () => {
    setLoading(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      router.replace("/admin/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={signOut}
      disabled={loading}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-50",
        full && "w-full"
      )}
    >
      <LogOut className="size-[18px]" />
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}

interface AdminShellProps {
  username: string;
  mustChangePassword?: boolean;
  children: React.ReactNode;
}

export default function AdminShell({ username, mustChangePassword, children }: AdminShellProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const currentItem = MENU.find((m) => isActive(pathname, m.path));
  const current =
    currentItem?.children?.find((c) => isActive(pathname, c.path))?.name ??
    currentItem?.name ??
    "Admin";

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <Brand />
        <NavLinks />
        <div className="border-t border-sidebar-border px-3 py-3">
          <SignOutButton full />
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-sidebar">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex size-8 items-center justify-center rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent"
              >
                <X className="size-[18px]" />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
            <div className="border-t border-sidebar-border px-3 py-3">
              <SignOutButton full />
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm md:px-6">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="flex size-9 items-center justify-center rounded-lg text-foreground hover:bg-muted lg:hidden"
            >
              <Menu className="size-5" />
            </button>
            <h1 className="text-base font-semibold tracking-tight">{current}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              Signed in as <span className="font-medium text-foreground">{username}</span>
            </span>
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {username.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {mustChangePassword && (
          <div className="border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning-foreground md:px-6">
            You&apos;re still using the temporary password.{" "}
            <Link href="/admin/settings/change-password" className="font-semibold underline underline-offset-2">
              Change it now
            </Link>
            .
          </div>
        )}

        <main className="flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}
