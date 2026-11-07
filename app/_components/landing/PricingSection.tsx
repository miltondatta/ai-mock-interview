"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { Show, SignUpButton } from "@clerk/nextjs";
import { pricingPlans } from "./data";

export default function PricingSection() {
  return (
    <section id="pricing" className="bg-stone-50 py-20 sm:py-28 scroll-mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center rounded-full border border-orange-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-orange-700">
            Pricing
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">
            Choose the Right Plan for Your Preparation
          </h2>
          <p className="mt-4 text-sm text-stone-500">
            Prices and limits shown in brackets are placeholders — sign in and visit the Upgrade page for
            your actual plan options and current entitlements.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-3">
          {pricingPlans.map((plan) => {
            const cardClass = plan.highlighted
              ? "border-orange-600 bg-stone-900 shadow-xl shadow-orange-600/10"
              : "border-stone-200 bg-white shadow-sm";
            const buttonClass = plan.highlighted
              ? "bg-orange-600 text-white hover:bg-orange-700"
              : "bg-stone-900 text-white hover:bg-stone-800";

            return (
              <div key={plan.name} className={`relative flex flex-col rounded-2xl border p-7 ${cardClass}`}>
                {plan.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-orange-600 px-3 py-1 text-[11px] font-semibold text-white">
                    Most Popular
                  </span>
                )}
                <h3 className={`text-sm font-semibold ${plan.highlighted ? "text-white" : "text-stone-900"}`}>
                  {plan.name}
                </h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className={`text-3xl font-extrabold ${plan.highlighted ? "text-white" : "text-stone-900"}`}>
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className={plan.highlighted ? "text-sm text-white/50" : "text-sm text-stone-500"}>
                      {plan.period}
                    </span>
                  )}
                </div>
                <p className={`mt-2 text-sm ${plan.highlighted ? "text-white/60" : "text-stone-600"}`}>
                  {plan.description}
                </p>

                <ul className="mt-6 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className={`flex items-start gap-2.5 text-sm ${
                        plan.highlighted ? "text-white/80" : "text-stone-700"
                      }`}
                    >
                      <Check className={`mt-0.5 size-4 shrink-0 ${plan.highlighted ? "text-orange-400" : "text-orange-600"}`} />
                      {feature}
                    </li>
                  ))}
                </ul>

                {plan.action === "signup" && (
                  <>
                    <Show when="signed-out">
                      <SignUpButton mode="modal">
                        <button type="button" className={`mt-8 rounded-xl px-5 py-3 text-center text-sm font-semibold transition-colors ${buttonClass}`}>
                          {plan.cta}
                        </button>
                      </SignUpButton>
                    </Show>
                    <Show when="signed-in">
                      <Link href="/dashboard" className={`mt-8 rounded-xl px-5 py-3 text-center text-sm font-semibold transition-colors ${buttonClass}`}>
                        Go to Dashboard
                      </Link>
                    </Show>
                  </>
                )}

                {plan.action === "upgrade" && (
                  <Link href="/upgrade" className={`mt-8 rounded-xl px-5 py-3 text-center text-sm font-semibold transition-colors ${buttonClass}`}>
                    {plan.cta}
                  </Link>
                )}

                {plan.action === "contact" && (
                  <a href="#contact" className={`mt-8 rounded-xl px-5 py-3 text-center text-sm font-semibold transition-colors ${buttonClass}`}>
                    {plan.cta}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
