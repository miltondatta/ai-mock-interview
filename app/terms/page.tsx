import type { Metadata } from "next";
import Navbar from "../_components/landing/Navbar";
import LandingFooter from "../_components/landing/LandingFooter";
import LegalBody from "../_components/legal/LegalBody";
import { termsSections, EFFECTIVE_DATE_PLACEHOLDER, LAST_UPDATED_PLACEHOLDER } from "../_components/legal/legalData";

export const metadata: Metadata = {
  title: "Terms of Service | AI Mock Interview",
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen w-full bg-white">
      <Navbar />
      <main>
        <section className="border-b border-stone-200 bg-stone-50">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
            <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-orange-700">
              LEGAL
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">Terms of Service</h1>
            <p className="mt-3 max-w-2xl text-base text-stone-600 sm:text-lg">
              Please review the terms and conditions governing your use of AI Mock Interview.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-sm text-stone-500">
              <span>
                Effective Date: <span className="font-medium text-stone-700">{EFFECTIVE_DATE_PLACEHOLDER}</span>
              </span>
              <span>
                Last Updated: <span className="font-medium text-stone-700">{LAST_UPDATED_PLACEHOLDER}</span>
              </span>
            </div>
          </div>
        </section>

        <LegalBody sections={termsSections} />
      </main>
      <LandingFooter />
    </div>
  );
}
