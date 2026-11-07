import Link from "next/link";

const PRODUCT_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Interview Modes", href: "#modes" },
  { label: "Pricing", href: "/upgrade" },
  { label: "Get Started", href: "/dashboard" },
];

const RESOURCE_LINKS = [
  { label: "How It Works", href: "/how-it-works" },
  { label: "FAQ", href: "#faq" },
  { label: "Help / Support", href: "#contact" },
];

const COMPANY_LINKS = [
  { label: "About Us", href: "#about" },
  { label: "Contact", href: "#contact" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
];

// lucide-react no longer ships brand/logo icons (Twitter, LinkedIn, YouTube,
// Instagram), and there are no real social links configured for this app yet,
// so these render as plain text-badge placeholders per the design brief
// ("visual placeholders if links are unavailable").
const SOCIALS = [
  { initials: "X", label: "Twitter / X" },
  { initials: "in", label: "LinkedIn" },
  { initials: "yt", label: "YouTube" },
  { initials: "ig", label: "Instagram" },
];

function FooterLink({ label, href }: { label: string; href: string }) {
  const isAnchor = href.startsWith("#");
  if (isAnchor) {
    return (
      <a href={href} className="text-sm text-white/50 transition-colors hover:text-white">
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className="text-sm text-white/50 transition-colors hover:text-white">
      {label}
    </Link>
  );
}

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.label}>
            <FooterLink {...link} />
          </li>
        ))}
        {title === "Resources" && (
          <li>
            <span className="inline-flex cursor-not-allowed items-center gap-1.5 text-sm text-white/30">
              Blog
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/50">
                Soon
              </span>
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}

export default function LandingFooter() {
  return (
    <footer className="bg-stone-900">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <div className="lg:col-span-1">
            <a href="#home" className="flex items-center gap-2.5">
              <img src="/logo.svg" alt="AI Mock Interview logo" className="h-8 w-8" />
              <span className="text-base font-bold text-white">AI Mock Interview</span>
            </a>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/50">
              AI-powered interview preparation to help you practice, improve and land your dream job.
            </p>
            <div className="mt-5 flex items-center gap-2">
              {SOCIALS.map((social) => (
                <a
                  key={social.label}
                  href="#"
                  aria-label={social.label}
                  className="flex size-9 items-center justify-center rounded-lg bg-white/5 text-[11px] font-semibold text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                >
                  {social.initials}
                </a>
              ))}
            </div>
          </div>

          <FooterColumn title="Product" links={PRODUCT_LINKS} />
          <FooterColumn title="Resources" links={RESOURCE_LINKS} />
          <FooterColumn title="Company" links={COMPANY_LINKS} />
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-sm text-white/40">© {new Date().getFullYear()} AI Mock Interview. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-sm text-white/40 transition-colors hover:text-white">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-sm text-white/40 transition-colors hover:text-white">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
