export interface LanguageOption {
  value: string;
  label: string;
  flag: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "bn", label: "Bangla (বাংলা)", flag: "🇧🇩" },
  { value: "hi", label: "Hindi (हिन्दी)", flag: "🇮🇳" },
  { value: "es", label: "Spanish (Español)", flag: "🇪🇸" },
  { value: "fr", label: "French (Français)", flag: "🇫🇷" },
  { value: "de", label: "German (Deutsch)", flag: "🇩🇪" },
  { value: "ar", label: "Arabic (العربية)", flag: "🇸🇦" },
  { value: "zh", label: "Chinese (中文)", flag: "🇨🇳" },
];

export const DEFAULT_INTERVIEW_LANGUAGE = "en";
export const DEFAULT_FEEDBACK_LANGUAGE = "en";
export const DEFAULT_PRACTICE_COACH_LANGUAGE = "en";
