import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | AI Mock Interview",
};

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <Link href="/" className="text-sm font-medium text-orange-700 hover:underline">
        ← Back to home
      </Link>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-stone-900">Terms of Service</h1>
      <p className="mt-2 text-sm text-stone-500">Last updated: placeholder</p>

      <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        This is a placeholder page linked from the site footer. It has not been reviewed by legal
        counsel — replace this content with your organization&apos;s actual Terms of Service before
        launch.
      </div>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-stone-700">
        <p>
          By creating an account and using AI Mock Interview, you agree to use the platform for
          lawful interview preparation purposes only, and not to misuse the service, attempt to
          circumvent its security, or interfere with other users&apos; accounts.
        </p>
        <p>
          Subscription plans, interview limits, and billing terms are presented on the Upgrade page
          at the time of purchase and are managed through our payment provider. Replace this section
          with your actual billing, refund, and cancellation policy.
        </p>
        <p>
          AI-generated interview questions and feedback are provided for practice purposes and do
          not guarantee interview or job offer outcomes.
        </p>
        <p>
          We may suspend or terminate accounts that violate these terms. Replace this section with
          your actual liability, dispute resolution, and governing law terms.
        </p>
      </div>
    </div>
  );
}
