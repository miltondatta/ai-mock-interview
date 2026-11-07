"use client";

import { useState } from "react";
import { Mail, Building2, Clock, Send, MessageCircle } from "lucide-react";

const SUBJECT_OPTIONS = [
  "General Inquiry",
  "Technical Support",
  "Subscription / Billing",
  "Corporate / Enterprise Inquiry",
  "Partnership",
  "Other",
];

// No contact API exists in this codebase yet. Submitting opens the visitor's own
// mail client with the message pre-filled, instead of faking a server submission
// that doesn't exist. Wire this to a real /api/contact endpoint in a future pass.
const SUPPORT_EMAIL = "support@aimockinterview.com";

export default function ContactSection() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(SUBJECT_OPTIONS[0]);
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = `From: ${fullName} (${email})\n\n${message}`;
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      `[AI Mock Interview] ${subject}`
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  };

  return (
    <section id="contact" className="bg-stone-50 py-20 sm:py-28 scroll-mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <span className="inline-flex items-center rounded-full border border-orange-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-orange-700">
              Contact
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">
              Let&apos;s Get in Touch
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-stone-600">
              Have questions, need assistance, or interested in bringing AI-powered interview
              preparation to your organization? We&apos;d love to hear from you.
            </p>

            <div className="mt-8 space-y-5">
              <div className="flex items-start gap-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                  <Mail className="size-4.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-stone-900">Email Us</p>
                  <p className="text-sm text-stone-600">{SUPPORT_EMAIL}</p>
                </div>
              </div>
              <div className="flex items-start gap-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                  <Building2 className="size-4.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-stone-900">Corporate Inquiries</p>
                  <p className="text-sm text-stone-600">Use the form and select &ldquo;Corporate / Enterprise Inquiry&rdquo;</p>
                </div>
              </div>
              <div className="flex items-start gap-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                  <Clock className="size-4.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-stone-900">Support Availability</p>
                  <p className="text-sm text-stone-600">Monday – Friday, 9am – 6pm</p>
                </div>
              </div>
            </div>

            <div className="mt-10 hidden rounded-2xl border border-stone-200 bg-white p-6 sm:flex sm:items-center sm:gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-white">
                <MessageCircle className="size-6" />
              </span>
              <p className="text-sm text-stone-600">
                Submitting opens your email app with this message pre-filled, ready to send.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="full-name" className="text-sm font-medium text-stone-700">
                  Full Name <span className="text-orange-600">*</span>
                </label>
                <input
                  id="full-name"
                  name="full-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jordan Lee"
                  className="mt-1.5 w-full rounded-lg border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
              <div>
                <label htmlFor="email" className="text-sm font-medium text-stone-700">
                  Email Address <span className="text-orange-600">*</span>
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1.5 w-full rounded-lg border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
              <div>
                <label htmlFor="subject" className="text-sm font-medium text-stone-700">
                  Subject
                </label>
                <select
                  id="subject"
                  name="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                >
                  {SUBJECT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="message" className="text-sm font-medium text-stone-700">
                  Message <span className="text-orange-600">*</span>
                </label>
                <textarea
                  id="message"
                  name="message"
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="How can we help?"
                  className="mt-1.5 w-full resize-none rounded-lg border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-orange-700"
              >
                <Send className="size-4" />
                Submit Message
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
