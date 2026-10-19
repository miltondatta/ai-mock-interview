"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ELEVENLABS_LANGUAGES } from "../../_lib/elevenlabsLanguages";
import GreetingEditor from "./GreetingEditor";

interface Language {
  _id: string;
  code: string;
  label: string;
  flag: string;
  greeting?: string;
  roleFallback?: string;
  // True for languages whose interview greeting is hand-written in code.
  builtInGreeting: boolean;
}

export default function LanguagesManager({ languages }: { languages: Language[] }) {
  const router = useRouter();
  const addedCodes = new Set(languages.map((l) => l.code));
  const available = ELEVENLABS_LANGUAGES.filter((l) => !addedCodes.has(l.code));

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const customGreetingLanguages = languages.filter((l) => !l.builtInGreeting);
  const [error, setError] = useState<string | null>(null);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    setError(null);
    setDone(null);
    setWarning(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/languages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not add language.");
        return;
      }
      setDone(ELEVENLABS_LANGUAGES.find((l) => l.code === code)?.label ?? code);
      setWarning(data?.warning ?? null);
      setCode("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const onRemove = async (language: Language) => {
    if (!confirm(`Remove ${language.label}? Candidates will no longer be able to select it.`)) return;
    setError(null);
    setDone(null);
    setRemovingId(language._id);
    try {
      const res = await fetch("/api/admin/languages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: language._id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not remove language.");
        return;
      }
      router.refresh();
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm font-medium">Added languages ({languages.length})</p>
        {languages.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No languages added yet.</p>
        ) : (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {languages.map((language) => (
              <span
                key={language._id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-1 pl-3 pr-1 text-sm"
              >
                <span>{language.flag}</span>
                <span className="font-medium">{language.label}</span>
                <span className="text-xs uppercase text-muted-foreground">{language.code}</span>
                {/* English is the default language and can't be removed. */}
                {language.code === "en" ? (
                  <span className="w-1" />
                ) : (
                  <button
                    type="button"
                    onClick={() => onRemove(language)}
                    disabled={removingId === language._id}
                    aria-label={`Remove ${language.label}`}
                    className="flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    {removingId === language._id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <X className="size-3.5" />
                    )}
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={onAdd} className="flex flex-col gap-1.5">
        <label htmlFor="newLanguage" className="text-sm font-medium">
          Add a language supported by ElevenLabs
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            id="newLanguage"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setDone(null);
              setWarning(null);
              setError(null);
            }}
            disabled={available.length === 0}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:max-w-sm"
          >
            <option value="">
              {available.length === 0 ? "All supported languages added" : "Select a language…"}
            </option>
            {available.map((language) => (
              <option key={language.code} value={language.code}>
                {language.flag} {language.label} ({language.code})
              </option>
            ))}
          </select>
          <Button type="submit" disabled={loading || !code} className="w-fit">
            {loading ? <Loader2 className="animate-spin" /> : <Plus />}
            {loading ? "Adding…" : "Add language"}
          </Button>
        </div>
      </form>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      {done && (
        <p className="flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="size-4" /> {done} added.
        </p>
      )}
      {warning && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning-foreground">{warning}</p>
      )}

      {customGreetingLanguages.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-5">
          <div>
            <p className="text-sm font-medium">Interview greetings</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              The interviewer speaks this greeting word for word when the call starts. It&apos;s translated
              automatically with Gemini when a language is added - review or edit it here.
            </p>
          </div>
          {customGreetingLanguages.map((language) => (
            <GreetingEditor key={language._id} language={language} />
          ))}
        </div>
      )}
    </div>
  );
}
