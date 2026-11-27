"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Job Matching Configuration (P0) form. Modelled directly on
// GeneralSettingsForm.tsx (same POST-to-API-route-then-router.refresh()
// pattern, same error/success banner styling) so this page matches the rest
// of Admin > Settings rather than introducing a new convention.

type SortOrder = "score_desc" | "newest_first";

interface Config {
  minimumMatchScore: number;
  requireIsMatch: boolean;
  maxRecommendationsPerCandidate: 60 | 70 | 75;
  recommendationSortOrder: SortOrder;
  reevaluateAfterProfileUpdate: boolean;
  automaticJobSyncEnabled: boolean;
}

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-auto";

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 py-1 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
      />
      <span>
        <span className="font-medium text-foreground">{label}</span>
        <span className="block text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border py-5 first:pt-0 last:border-0 last:pb-0">
      <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h4>
      {children}
    </div>
  );
}

export default function JobMatchingConfigForm({ config }: { config: Config }) {
  const router = useRouter();
  const [form, setForm] = useState<Config>(config);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/job-matching-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not save the configuration.");
        return;
      }
      setDone(true);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col">
      <Section title="Job Matching Eligibility">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="minimumMatchScore" className="text-sm font-medium">
            Minimum Job Match Score — <span className="font-mono tabular-nums">{form.minimumMatchScore}</span>
          </label>
          <input
            id="minimumMatchScore"
            type="range"
            min={0}
            max={100}
            step={1}
            value={form.minimumMatchScore}
            onChange={(e) => setForm({ ...form, minimumMatchScore: Number(e.target.value) })}
            className="accent-primary"
          />
          <p className="text-sm text-muted-foreground">Only jobs meeting or exceeding this score qualify for candidate recommendations.</p>
        </div>

        <Toggle
          label="Require Existing Relevance Validation (isMatch)"
          description="When enabled, a job must satisfy both the minimum score and the existing isMatch condition. When disabled, the minimum score alone determines eligibility."
          checked={form.requireIsMatch}
          onChange={(requireIsMatch) => setForm({ ...form, requireIsMatch })}
        />
      </Section>

      <Section title="Recommendation Limits and Sorting">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="maxRecommendationsPerCandidate" className="text-sm font-medium">
            Maximum Recommendations Per Candidate
          </label>
          <select
            id="maxRecommendationsPerCandidate"
            value={form.maxRecommendationsPerCandidate}
            onChange={(e) =>
              setForm({ ...form, maxRecommendationsPerCandidate: Number(e.target.value) as 60 | 70 | 75 })
            }
            className={selectClass}
          >
            <option value={60}>60</option>
            <option value={70}>70</option>
            <option value={75}>75</option>
          </select>
          <p className="text-sm text-muted-foreground">Applies independently per candidate, never globally. Never padded with lower-scoring jobs to fill the limit.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="recommendationSortOrder" className="text-sm font-medium">
            Recommendation Sorting
          </label>
          <select
            id="recommendationSortOrder"
            value={form.recommendationSortOrder}
            onChange={(e) => setForm({ ...form, recommendationSortOrder: e.target.value as SortOrder })}
            className={selectClass}
          >
            <option value="score_desc">Highest Match Score First</option>
            <option value="newest_first">Newest Jobs First</option>
          </select>
        </div>
      </Section>

      <Section title="Profile Update Behavior">
        <Toggle
          label="Re-evaluate Jobs After Relevant Profile Updates"
          description="When enabled, changes to relevant candidate profile information trigger the appropriate job re-evaluation process, reusing stored jobs and existing synchronization mechanisms rather than duplicate requests."
          checked={form.reevaluateAfterProfileUpdate}
          onChange={(reevaluateAfterProfileUpdate) => setForm({ ...form, reevaluateAfterProfileUpdate })}
        />
      </Section>

      <Section title="Automatic Job Synchronization">
        <Toggle
          label="Enable Automatic External Job Synchronization"
          description="When disabled, scheduled and automatic synchronization requests (including n8n) will not initiate provider synchronization. The manual sync actions remain available."
          checked={form.automaticJobSyncEnabled}
          onChange={(automaticJobSyncEnabled) => setForm({ ...form, automaticJobSyncEnabled })}
        />
      </Section>

      {error && <p className="mt-5 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {done && (
        <p className="mt-5 flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="size-4" /> Configuration saved.
        </p>
      )}

      <Button type="submit" disabled={loading} className="mt-5 w-fit">
        {loading && <Loader2 className="animate-spin" />}
        {loading ? "Saving…" : "Save configuration"}
      </Button>
    </form>
  );
}
