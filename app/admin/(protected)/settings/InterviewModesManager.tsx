"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface InterviewMode {
  _id: string;
  value: string;
  label: string;
}

export default function InterviewModesManager({ modes }: { modes: InterviewMode[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    setError(null);
    setAdding(true);
    try {
      const res = await fetch("/api/admin/interview-modes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not add interview mode.");
        return;
      }
      setLabel("");
      router.refresh();
    } finally {
      setAdding(false);
    }
  };

  const onRemove = async (id: string) => {
    if (!confirm("Remove this interview mode? It will no longer be offered on Create Interview.")) return;
    setError(null);
    setRemovingId(id);
    try {
      const res = await fetch("/api/admin/interview-modes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not remove interview mode.");
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
        <p className="text-sm font-medium">Interview Modes ({modes.length})</p>
        {modes.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No interview modes yet.</p>
        ) : (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {modes.map((mode) => (
              <span
                key={mode._id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 py-1 pl-3 pr-1 text-sm font-medium"
              >
                {mode.label}
                <button
                  type="button"
                  onClick={() => onRemove(mode._id)}
                  disabled={removingId === mode._id}
                  aria-label={`Remove ${mode.label}`}
                  className="flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  {removingId === mode._id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <X className="size-3.5" />
                  )}
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={onAdd} className="flex flex-col gap-1.5">
        <label htmlFor="newInterviewMode" className="text-sm font-medium">
          Add a new interview mode
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="newInterviewMode"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setError(null);
            }}
            placeholder="e.g. Sales Interview"
            className="sm:max-w-sm"
          />
          <Button type="submit" disabled={adding || !label.trim()} className="w-fit">
            {adding ? <Loader2 className="animate-spin" /> : <Plus />}
            {adding ? "Adding…" : "Add mode"}
          </Button>
        </div>
      </form>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
