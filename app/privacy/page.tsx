import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | AI Mock Interview",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <Link href="/" className="text-sm font-medium text-orange-700 hover:underline">
        ← Back to home
      </Link>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-stone-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-stone-500">Last updated: placeholder</p>

      <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        This is a placeholder page linked from the site footer. It has not been reviewed by legal
        counsel — replace this content with your organization&apos;s actual Privacy Policy before
        launch.
      </div>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-stone-700">
        <p>
          AI Mock Interview (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;the platform&rdquo;) collects
          information you provide directly, such as your account details, uploaded resumes, job
          descriptions, and interview session data, in order to generate personalized interview
          questions, resume match analyses, and feedback.
        </p>
        <p>
          We use third-party services to operate the platform, including Clerk for authentication,
          Convex for data storage, and AI providers for generating interview content and feedback.
          These providers process your data only as needed to deliver the service.
        </p>
        <p>
          You can view, download, or delete your uploaded resumes at any time from the Manage
          Resume page. You can request deletion of your account and associated data by contacting
          us.
        </p>
        <p>
          We do not sell your personal data. Replace this section with your actual data retention,
          sharing, and compliance practices.
        </p>
      </div>
    </div>
  );
}
