"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X, LayoutDashboard } from "lucide-react";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

const NAV_LINKS = [
  { label: "Home", href: "/#home" },
  { label: "Features", href: "/#features" },
  { label: "Interview Modes", href: "/#modes" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Pricing", href: "/#pricing" },
  { label: "About", href: "/#about" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? "border-b border-stone-200 bg-white/90 backdrop-blur-md shadow-sm"
          : "border-b border-transparent bg-white/60 backdrop-blur-sm"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/#home" className="flex shrink-0 items-center gap-2.5">
          <img src="/logo.svg" alt="AI Mock Interview logo" className="h-9 w-9" />
          <span className="text-base font-bold tracking-tight text-stone-900 sm:text-lg">
            AI Mock Interview
          </span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2.5 lg:flex">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-100"
              >
                Log In
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button
                type="button"
                className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-700"
              >
                Get Started Free
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-700"
            >
              <LayoutDashboard className="size-4" />
              Dashboard
            </Link>
            <UserButton appearance={{ elements: { avatarBox: "w-9 h-9" } }} />
          </Show>
        </div>

        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
          className="inline-flex size-10 items-center justify-center rounded-lg text-stone-700 transition-colors hover:bg-stone-100 lg:hidden"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      {mobileOpen && (
        <div className="border-t border-stone-200 bg-white px-4 pb-5 pt-2 lg:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
              >
                {link.label}
              </a>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 border-t border-stone-200 pt-3">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-center text-sm font-semibold text-stone-700 hover:bg-stone-100"
                >
                  Log In
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg bg-orange-600 px-3 py-2.5 text-center text-sm font-semibold text-white hover:bg-orange-700"
                >
                  Get Started Free
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link
                href="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2.5 text-center text-sm font-semibold text-white hover:bg-orange-700"
              >
                <LayoutDashboard className="size-4" />
                Go to Dashboard
              </Link>
            </Show>
          </div>
        </div>
      )}
    </header>
  );
}
