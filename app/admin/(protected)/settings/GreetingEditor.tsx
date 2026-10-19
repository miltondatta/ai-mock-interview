"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface GreetingEditorProps {
  language: {
    _id: string;
    code: string;
    label: string;
    flag: string;
    greeting?: string;
    roleFallback?: string;
  };
}

// Interview opening greeting for an admin-added language - spoken word for word
// by the interviewer when the call connects. Auto-translated with Gemini when
// the language was added; editable here.
export default function GreetingEditor({ language }: GreetingEditorProps) {
  const router = useRouter();
  const [greeting, setGreeting] = useState(language.greeting ?? "");
  const [roleFallback, setRoleFallback] = useState(language.roleFallback ?? "");
  const [busy, setBusy] = useState<"save" | "translate" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (retranslate: boolean) => {
    setError(null);
    setDone(null);
    setBusy(retranslate ? "translate" : "save");
    try {
      const res = await fetch("/api/admin/languages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          retranslate ? { id: language._id, retranslate: true } : { id: language._id, greeting, roleFallback }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not save the greeting.");
        return;
      }
      setGreeting(data.greeting);
      setRoleFallback(data.roleFallback);
      setDone(retranslate ? "Greeting translated and saved." : "Greeting saved.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <details className="group rounded-xl border border-border bg-muted/30">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm">
        <span>{language.flag}</span>
        <span className="font-medium">{language.label}</span>
        {language.greeting ? (
          <span className="ml-auto rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
            Greeting ready
          </span>
        ) : (
          <span className="ml-auto rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning-foreground">
            Missing - English greeting used
          </span>
        )}
      </summary>

      <div className="flex flex-col gap-3 border-t border-border px-4 py-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`greeting-${language._id}`} className="text-sm font-medium">
            Greeting
          </label>
          <Textarea
            id={`greeting-${language._id}`}
            value={greeting}
            onChange={(e) => {
              setGreeting(e.target.value);
              setDone(null);
            }}
            rows={5}
          />
          <p className="text-xs text-muted-foreground">
            Must contain <code>{"{name}"}</code> (candidate name) and <code>{"{role}"}</code> (job title). Keep
            &quot;Pass&quot; and &quot;Done&quot; in English - the interviewer listens for those words.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`roleFallback-${language._id}`} className="text-sm font-medium">
            Role fallback
          </label>
          <Input
            id={`roleFallback-${language._id}`}
            value={roleFallback}
            onChange={(e) => {
              setRoleFallback(e.target.value);
              setDone(null);
            }}
            className="sm:max-w-sm"
          />
          <p className="text-xs text-muted-foreground">
            Used for <code>{"{role}"}</code> when the interview has no job title (English: &quot;this position&quot;).
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        {done && (
          <p className="flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
            <CheckCircle2 className="size-4" /> {done}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => submit(false)} disabled={!!busy}>
            {busy === "save" && <Loader2 className="animate-spin" />}
            {busy === "save" ? "Saving…" : "Save greeting"}
          </Button>
          <Button type="button" variant="outline" onClick={() => submit(true)} disabled={!!busy}>
            {busy === "translate" ? <Loader2 className="animate-spin" /> : <Languages />}
            {busy === "translate" ? "Translating…" : "Re-translate with Gemini"}
          </Button>
        </div>
      </div>
    </details>
  );
}
