import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

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

// Languages are managed from the admin panel (Settings > Languages).
// LANGUAGE_OPTIONS is the fallback while the list loads or before the admin
// has seeded it.
export function useLanguageOptions(): LanguageOption[] {
  const languages = useQuery(api.Languages.ListLanguages);
  return languages && languages.length > 0
    ? languages.map(({ code, label, flag }) => ({ value: code, label, flag }))
    : LANGUAGE_OPTIONS;
}

// Label lookup for already-saved records - falls back to the built-in list so
// a language the admin has since removed still shows its name.
export function findLanguageOption(options: LanguageOption[], value?: string) {
  return (
    options.find((option) => option.value === value) ??
    LANGUAGE_OPTIONS.find((option) => option.value === value)
  );
}

export const DEFAULT_INTERVIEW_LANGUAGE = "en";
export const DEFAULT_FEEDBACK_LANGUAGE = "en";
export const DEFAULT_PRACTICE_COACH_LANGUAGE = "en";
