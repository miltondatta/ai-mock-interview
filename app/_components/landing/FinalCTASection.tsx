"use client";

import Link from "next/link";
import { Show, SignInButton, SignUpButton } from "@clerk/nextjs";

export default function FinalCTASection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-orange-600 via-orange-600 to-amber-600 py-20 sm:py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-white/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-24 size-80 rounded-full bg-black/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Ready to Ace Your Next Interview?
        </h2>
        <p className="mt-4 text-base text-orange-50 sm:text-lg">
          Start practicing today and build the confidence to succeed in your next interview.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Show when="signed-out">
            <SignUpButton mode="modal">
              <button
                type="button"
                className="rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-orange-700 shadow-md transition-colors hover:bg-orange-50"
              >
                Get Started Free
              </button>
            </SignUpButton>
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded-xl border border-white/40 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Log In
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-orange-700 shadow-md transition-colors hover:bg-orange-50"
            >
              Go to Dashboard
            </Link>
          </Show>
        </div>
      </div>
    </section>
  );
}
