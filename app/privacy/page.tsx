import type { Metadata } from "next";
import Navbar from "../_components/landing/Navbar";
import LandingFooter from "../_components/landing/LandingFooter";
import LegalBody from "../_components/legal/LegalBody";
import { privacySections, EFFECTIVE_DATE_PLACEHOLDER, LAST_UPDATED_PLACEHOLDER } from "../_components/legal/legalData";

export const metadata: Metadata = {
  title: "Privacy Policy | AI Mock Interview",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen w-full bg-white">
      <Navbar />
      <main>
        <section className="border-b border-stone-200 bg-stone-50">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
            <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-orange-700">
              LEGAL
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">Privacy Policy</h1>
            <p className="mt-3 max-w-2xl text-base text-stone-600 sm:text-lg">
              Your privacy matters to us. Learn how AI Mock Interview collects, uses, and protects your information.
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

        <LegalBody sections={privacySections} />

        <section className="border-t border-stone-200 bg-stone-50">
          <div className="mx-auto max-w-5xl px-4 py-12 text-center sm:px-6 lg:px-8">
            <h2 className="text-xl font-bold text-stone-900 sm:text-2xl">Have questions about your privacy?</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-stone-600 sm:text-base">
              For privacy-related questions or requests, contact our privacy team.
            </p>
            <a
              href="mailto:[Insert Privacy Contact Email]"
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-700"
            >
              [Insert Privacy Contact Email]
            </a>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
