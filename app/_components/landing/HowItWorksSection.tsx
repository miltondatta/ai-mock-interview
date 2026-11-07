import Link from "next/link";
import { howItWorksSteps } from "./data";

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="bg-stone-50 py-20 sm:py-28 scroll-mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center rounded-full border border-orange-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-orange-700">
            How It Works
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">
            Four Simple Steps to Interview Success
          </h2>
        </div>

        <div className="relative mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          <div
            aria-hidden
            className="absolute left-0 right-0 top-12 hidden h-px bg-gradient-to-r from-transparent via-orange-300 to-transparent lg:block"
          />
          {howItWorksSteps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.number} className="relative flex flex-col items-center text-center">
                <div className="relative flex size-20 items-center justify-center rounded-2xl border border-stone-200 bg-white shadow-sm">
                  <Icon className="size-8 text-orange-600" strokeWidth={1.75} />
                  <span className="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white shadow-sm">
                    {step.number.replace("0", "")}
                  </span>
                </div>
                <h3 className="mt-5 text-base font-semibold text-stone-900">{step.title}</h3>
                <p className="mt-2 max-w-[15rem] text-sm leading-relaxed text-stone-600">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/how-it-works"
            className="text-sm font-semibold text-orange-700 underline-offset-4 hover:underline"
          >
            Read the full walkthrough →
          </Link>
        </div>
      </div>
    </section>
  );
}
