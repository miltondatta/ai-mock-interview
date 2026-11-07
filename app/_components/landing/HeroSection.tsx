"use client";

import Link from "next/link";
import { Sparkles, Mic, PhoneOff, Video, PlayCircle, Bot, Radio } from "lucide-react";
import { Show, SignUpButton } from "@clerk/nextjs";

const WAVE_BARS = [6, 14, 9, 18, 11, 16, 7, 13, 10, 15, 8];

export default function HeroSection() {
  return (
    <section id="home" className="relative overflow-hidden bg-white scroll-mt-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[32rem] w-[64rem] -translate-x-1/2 rounded-full bg-orange-100/60 blur-3xl"
      />
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:px-8 lg:py-24">
        {/* Left column */}
        <div className="flex flex-col items-start text-left">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3.5 py-1.5 text-xs font-semibold text-orange-700">
            <Sparkles className="size-3.5" />
            AI-Powered Interview Preparation Platform
          </span>

          <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight text-stone-900 sm:text-5xl lg:text-[3.4rem]">
            Practice Smarter.
            <br />
            Interview Better.
            <br />
            <span className="bg-gradient-to-r from-orange-600 to-amber-500 bg-clip-text text-transparent">
              Land Your Dream Job.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-stone-600 sm:text-lg">
            Prepare for your next career opportunity with AI-powered mock interviews,
            personalized resume analysis, real-time voice conversations, and actionable
            feedback.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Show when="signed-out">
              <SignUpButton mode="modal">
                <button
                  type="button"
                  className="rounded-xl bg-orange-600 px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-orange-600/20 transition-colors hover:bg-orange-700"
                >
                  Get Started Free
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link
                href="/dashboard"
                className="rounded-xl bg-orange-600 px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-orange-600/20 transition-colors hover:bg-orange-700"
              >
                Go to Dashboard
              </Link>
            </Show>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-6 py-3.5 text-sm font-semibold text-stone-800 transition-colors hover:bg-stone-50"
            >
              <PlayCircle className="size-4.5 text-orange-600" />
              See How It Works
            </a>
          </div>

          <p className="mt-7 text-sm text-stone-500">
            Helping job seekers prepare with confidence.
          </p>
        </div>

        {/* Right column: interview interface preview (illustrative UI, not a live session) */}
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div
            aria-hidden
            className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-orange-200/50 via-amber-100/40 to-transparent blur-2xl"
          />

          <div className="overflow-hidden rounded-3xl border border-stone-200 bg-stone-900 shadow-2xl shadow-stone-900/20">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                <Bot className="size-3.5" />
                AI Interviewer
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                </span>
                Live
              </span>
            </div>

            <div className="relative flex h-56 items-center justify-center bg-gradient-to-br from-stone-800 to-stone-900 sm:h-64">
              <div className="flex size-28 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 shadow-lg shadow-orange-900/40 sm:size-32">
                <Bot className="size-14 text-white sm:size-16" strokeWidth={1.5} />
              </div>
              <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
                <Radio className="size-3" />
                Question 3 of 12
              </span>
            </div>

            <div className="space-y-3 border-t border-white/10 px-4 py-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-white/50">
                Current Question
              </p>
              <p className="text-sm font-medium leading-relaxed text-white">
                Tell me about a challenging project you worked on and how you solved it.
              </p>

              <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5">
                <div className="flex items-end gap-0.5">
                  {WAVE_BARS.map((h, i) => (
                    <span
                      key={i}
                      className="w-0.5 animate-pulse rounded-full bg-orange-400"
                      style={{ height: `${h}px`, animationDelay: `${i * 80}ms` }}
                    />
                  ))}
                </div>
                <span className="text-xs text-white/60">Listening for your answer…</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 border-t border-white/10 px-4 py-4">
              <span className="flex size-11 items-center justify-center rounded-full bg-white/10 text-white">
                <Mic className="size-5" />
              </span>
              <span className="flex size-12 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30">
                <PhoneOff className="size-5" />
              </span>
              <span className="flex size-11 items-center justify-center rounded-full bg-white/10 text-white">
                <Video className="size-5" />
              </span>
            </div>
          </div>

          <div className="absolute -bottom-6 -left-4 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-xl sm:-left-8">
            <div className="relative flex size-12 shrink-0 items-center justify-center">
              <svg viewBox="0 0 36 36" className="size-12 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f5f5f4" strokeWidth="4" />
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke="#EA580C"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray="97.4"
                  strokeDashoffset="17.5"
                />
              </svg>
              <span className="absolute text-[11px] font-bold text-stone-900">82%</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-900">Overall Score</p>
              <p className="text-[11px] text-stone-500">Good performance</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
