import { CircleQuestionMark, Sparkles, Users } from "lucide-react"
import type { ReferralIcon as ReferralIconName } from "../constants"

// lucide-react 1.x doesn't include brand logos, so each source gets a small,
// brand-coloured mark. These are recognisable stand-ins, not official logos.
export function ReferralIcon({ name }: { name: ReferralIconName }) {
  const box = "flex size-5 shrink-0 items-center justify-center"
  switch (name) {
    case "chatgpt":
      return (
        <span className={box} aria-hidden>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 3.5v6.2M12 14.3v6.2M4.6 7.75l5.4 3.1M14 13.15l5.4 3.1M4.6 16.25l5.4-3.1M14 10.85l5.4-3.1" />
          </svg>
        </span>
      )
    case "perplexity":
      return (
        <span className={box} aria-hidden>
          <Sparkles className="size-5 text-[#20808D]" />
        </span>
      )
    case "google":
      return (
        <span className={`${box} text-[15px] font-bold leading-none`} aria-hidden>
          <span className="bg-[conic-gradient(#EA4335_0_25%,#FBBC05_0_50%,#34A853_0_75%,#4285F4_0)] bg-clip-text text-transparent">G</span>
        </span>
      )
    case "linkedin":
      return (
        <span className={`${box} rounded-[4px] bg-[#0A66C2] text-[10px] font-bold text-white`} aria-hidden>in</span>
      )
    case "instagram":
      return (
        <span className={box} aria-hidden>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="#E1306C" strokeWidth={2}>
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="0.6" fill="#E1306C" />
          </svg>
        </span>
      )
    case "youtube":
      return (
        <span className={box} aria-hidden>
          <svg viewBox="0 0 24 24" className="size-5">
            <rect x="1.5" y="5" width="21" height="14" rx="4" fill="#FF0000" />
            <path d="M10 9l5 3-5 3z" fill="#fff" />
          </svg>
        </span>
      )
    case "x":
      return (
        <span className={box} aria-hidden>
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 4l16 16M20 4L4 20" />
          </svg>
        </span>
      )
    case "facebook":
      return (
        <span className={`${box} rounded-full bg-[#1877F2] text-[13px] font-bold text-white`} aria-hidden>f</span>
      )
    case "reddit":
      return (
        <span className={box} aria-hidden>
          <svg viewBox="0 0 24 24" className="size-5">
            <circle cx="12" cy="12" r="10" fill="#FF4500" />
            <ellipse cx="12" cy="13.5" rx="5.5" ry="3.8" fill="#fff" />
            <circle cx="10" cy="13" r="0.9" fill="#FF4500" />
            <circle cx="14" cy="13" r="0.9" fill="#FF4500" />
          </svg>
        </span>
      )
    case "tiktok":
      return (
        <span className={box} aria-hidden>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <path d="M13 4v11a3.5 3.5 0 1 1-3.5-3.5" />
            <path d="M13 4c.5 2.5 2.5 4.2 5 4.2" />
          </svg>
        </span>
      )
    case "friend":
      return (
        <span className={box} aria-hidden>
          <Users className="size-5 text-muted-foreground" />
        </span>
      )
    case "other":
      return (
        <span className={box} aria-hidden>
          <CircleQuestionMark className="size-5 text-muted-foreground" />
        </span>
      )
  }
}
