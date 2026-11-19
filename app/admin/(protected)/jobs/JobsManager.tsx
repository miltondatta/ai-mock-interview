"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatJobLocation, formatSalary } from "@/utils/jobs/format";
import { formatDate } from "../../_lib/format";

// Admin CRUD for job openings, modelled on PlansManager.

type WorkMode = "onsite" | "remote" | "hybrid";
type SalaryPeriod = "hour" | "month" | "year";

interface Job {
  _id: string;
  title: string;
  company: string;
  location?: string;
  workMode?: WorkMode;
  employmentType?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: SalaryPeriod;
  description?: string;
  requiredSkills: string[];
  minYearsExperience?: number;
  maxYearsExperience?: number;
  educationRequirement?: string;
  requiredCertifications?: string[];
  source?: string;
  applyUrl: string;
  active: boolean;
  postedAt: number;
}

type Draft = {
  id?: string;
  title: string;
  company: string;
  location: string;
  workMode: "" | WorkMode;
  employmentType: string;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  salaryPeriod: SalaryPeriod;
  description: string;
  requiredSkills: string;
  minYearsExperience: string;
  maxYearsExperience: string;
  educationRequirement: string;
  requiredCertifications: string;
  source: string;
  applyUrl: string;
  active: boolean;
};

const emptyDraft = (): Draft => ({
  title: "",
  company: "",
  location: "",
  workMode: "",
  employmentType: "Full-time",
  salaryMin: "",
  salaryMax: "",
  salaryCurrency: "USD",
  salaryPeriod: "year",
  description: "",
  requiredSkills: "",
  minYearsExperience: "",
  maxYearsExperience: "",
  educationRequirement: "",
  requiredCertifications: "",
  source: "",
  applyUrl: "",
  active: true,
});

const numStr = (n: number | undefined) => (n === undefined ? "" : String(n));

function toDraft(job: Job): Draft {
  return {
    id: job._id,
    title: job.title,
    company: job.company,
    location: job.location ?? "",
    workMode: job.workMode ?? "",
    employmentType: job.employmentType ?? "",
    salaryMin: numStr(job.salaryMin),
    salaryMax: numStr(job.salaryMax),
    salaryCurrency: job.salaryCurrency ?? "USD",
    salaryPeriod: job.salaryPeriod ?? "year",
    description: job.description ?? "",
    requiredSkills: job.requiredSkills.join(", "),
    minYearsExperience: numStr(job.minYearsExperience),
    maxYearsExperience: numStr(job.maxYearsExperience),
    educationRequirement: job.educationRequirement ?? "",
    requiredCertifications: (job.requiredCertifications ?? []).join(", "),
    source: job.source ?? "",
    applyUrl: job.applyUrl,
    active: job.active,
  };
}

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default function JobsManager({ initialJobs }: { initialJobs: Job[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || saving) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          workMode: draft.workMode || undefined,
          requiredSkills: draft.requiredSkills.split(",").map((s) => s.trim()).filter(Boolean),
          requiredCertifications: draft.requiredCertifications.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not save the job.");
        return;
      }
      setDraft(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this job? Users will no longer see it. This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const res = await fetch("/api/admin/jobs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) router.refresh();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h3 className="text-sm font-semibold">Job openings</h3>
        {!draft && (
          <Button size="sm" onClick={() => { setError(null); setDraft(emptyDraft()); }}>
            <Plus /> Add job
          </Button>
        )}
      </div>

      {draft && (
        <form onSubmit={save} className="flex flex-col gap-4 border-b border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{draft.id ? "Edit job" : "New job"}</p>
            <button type="button" onClick={() => setDraft(null)} className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Cancel">
              <X className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Job title *">
              <Input value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={200} required />
            </Field>
            <Field label="Company *">
              <Input value={draft.company} onChange={(e) => set("company", e.target.value)} maxLength={200} required />
            </Field>
            <Field label="Location">
              <Input value={draft.location} onChange={(e) => set("location", e.target.value)} maxLength={200} placeholder="e.g. Berlin, Germany" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Work mode">
                <select value={draft.workMode} onChange={(e) => set("workMode", e.target.value as Draft["workMode"])} className={selectClass}>
                  <option value="">Not specified</option>
                  <option value="onsite">On-site</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="remote">Remote</option>
                </select>
              </Field>
              <Field label="Employment type">
                <Input value={draft.employmentType} onChange={(e) => set("employmentType", e.target.value)} maxLength={50} placeholder="Full-time" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Salary from">
                <Input type="number" min="0" step="any" value={draft.salaryMin} onChange={(e) => set("salaryMin", e.target.value)} />
              </Field>
              <Field label="Salary to">
                <Input type="number" min="0" step="any" value={draft.salaryMax} onChange={(e) => set("salaryMax", e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Currency">
                <Input value={draft.salaryCurrency} onChange={(e) => set("salaryCurrency", e.target.value.toUpperCase())} maxLength={3} />
              </Field>
              <Field label="Salary per">
                <select value={draft.salaryPeriod} onChange={(e) => set("salaryPeriod", e.target.value as SalaryPeriod)} className={selectClass}>
                  <option value="hour">Hour</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
              </Field>
            </div>
            <Field label="Required skills (comma-separated)">
              <Input value={draft.requiredSkills} onChange={(e) => set("requiredSkills", e.target.value)} placeholder="React, TypeScript, Node.js" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Min. years experience">
                <Input type="number" min="0" max="60" value={draft.minYearsExperience} onChange={(e) => set("minYearsExperience", e.target.value)} />
              </Field>
              <Field label="Max. years experience">
                <Input type="number" min="0" max="60" value={draft.maxYearsExperience} onChange={(e) => set("maxYearsExperience", e.target.value)} />
              </Field>
            </div>
            <Field label="Education requirement">
              <Input value={draft.educationRequirement} onChange={(e) => set("educationRequirement", e.target.value)} maxLength={200} placeholder="e.g. Bachelor's in Computer Science" />
            </Field>
            <Field label="Required certifications (comma-separated)">
              <Input value={draft.requiredCertifications} onChange={(e) => set("requiredCertifications", e.target.value)} placeholder="e.g. PMP, AWS Solutions Architect" />
            </Field>
            <Field label="Application link *">
              <Input type="url" value={draft.applyUrl} onChange={(e) => set("applyUrl", e.target.value)} placeholder="https://…" required />
            </Field>
            <Field label="Source">
              <Input value={draft.source} onChange={(e) => set("source", e.target.value)} maxLength={100} placeholder="e.g. Company website, LinkedIn" />
            </Field>
          </div>

          <Field label="Description">
            <textarea
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              rows={4}
              maxLength={10000}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} className="size-4 rounded border-input accent-primary" />
            Active (visible to users)
          </label>

          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {saving ? "Saving…" : "Save job"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </form>
      )}

      <ul className="divide-y divide-border">
        {initialJobs.length === 0 && !draft && (
          <li className="p-10 text-center text-sm text-muted-foreground">
            No jobs yet. Add one to start showing &quot;Jobs for you&quot; to users.
          </li>
        )}
        {initialJobs.map((job) => {
          const salary = formatSalary(job);
          const location = formatJobLocation(job);
          return (
            <li key={job._id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{job.title}</p>
                  <Badge variant={job.active ? "success" : "secondary"}>{job.active ? "Active" : "Hidden"}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {[job.company, location, salary, job.source].filter(Boolean).join(" · ")}
                </p>
                {job.requiredSkills.length > 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">Skills: {job.requiredSkills.join(", ")}</p>
                )}
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  Posted {formatDate(job.postedAt)} ·
                  <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:text-foreground">
                    Application link <ExternalLink className="size-3" />
                  </a>
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => { setError(null); setDraft(toDraft(job)); }}>
                  <Pencil /> Edit
                </Button>
                <Button size="sm" variant="destructive" onClick={() => remove(job._id)} disabled={deletingId === job._id}>
                  {deletingId === job._id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  Delete
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
