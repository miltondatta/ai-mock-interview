"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "../../_lib/format";

interface Plan {
  _id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  interval: string;
  features: string[];
  active: boolean;
  sortOrder: number;
}

type Draft = {
  id?: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  interval: string;
  features: string;
  active: boolean;
  sortOrder: string;
};

const emptyDraft = (sortOrder: number): Draft => ({
  name: "",
  description: "",
  price: "0",
  currency: "USD",
  interval: "month",
  features: "",
  active: true,
  sortOrder: String(sortOrder),
});

function toDraft(plan: Plan): Draft {
  return {
    id: plan._id,
    name: plan.name,
    description: plan.description ?? "",
    price: String(plan.price),
    currency: plan.currency,
    interval: plan.interval,
    features: plan.features.join("\n"),
    active: plan.active,
    sortOrder: String(plan.sortOrder),
  };
}

export default function PlansManager({ initialPlans }: { initialPlans: Plan[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startAdd = () => {
    setError(null);
    setDraft(emptyDraft(initialPlans.length));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id,
          name: draft.name,
          description: draft.description,
          price: Number(draft.price),
          currency: draft.currency,
          interval: draft.interval,
          features: draft.features
            .split("\n")
            .map((f) => f.trim())
            .filter(Boolean),
          active: draft.active,
          sortOrder: Number(draft.sortOrder),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not save the plan.");
        return;
      }
      setDraft(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this plan? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const res = await fetch("/api/admin/plans", {
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
        <h3 className="text-sm font-semibold">Subscription plans</h3>
        {!draft && (
          <Button size="sm" onClick={startAdd}>
            <Plus /> Add plan
          </Button>
        )}
      </div>

      {draft && (
        <form onSubmit={save} className="flex flex-col gap-4 border-b border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{draft.id ? "Edit plan" : "New plan"}</p>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              aria-label="Cancel"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Description">
              <Input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
            <Field label="Price">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                required
              />
            </Field>
            <Field label="Currency">
              <Input
                value={draft.currency}
                onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })}
                maxLength={3}
              />
            </Field>
            <Field label="Billing interval">
              <select
                value={draft.interval}
                onChange={(e) => setDraft({ ...draft, interval: e.target.value })}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </Field>
            <Field label="Sort order">
              <Input
                type="number"
                value={draft.sortOrder}
                onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Features (one per line)">
            <textarea
              value={draft.features}
              onChange={(e) => setDraft({ ...draft, features: e.target.value })}
              rows={4}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              className="size-4 rounded border-input accent-primary"
            />
            Active (visible to customers)
          </label>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {saving ? "Saving…" : "Save plan"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <ul className="divide-y divide-border">
        {initialPlans.length === 0 && !draft && (
          <li className="p-10 text-center text-sm text-muted-foreground">No plans yet.</li>
        )}
        {initialPlans.map((plan) => (
          <li key={plan._id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{plan.name}</p>
                <Badge variant={plan.active ? "success" : "secondary"}>
                  {plan.active ? "Active" : "Hidden"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {formatMoney(plan.price, plan.currency)} / {plan.interval}
                </span>
              </div>
              {plan.description && (
                <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              )}
              {plan.features.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {plan.features.map((f, i) => (
                    <li key={i} className="before:mr-1 before:content-['•']">
                      {f}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setError(null);
                  setDraft(toDraft(plan));
                }}
              >
                <Pencil /> Edit
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => remove(plan._id)}
                disabled={deletingId === plan._id}
              >
                {deletingId === plan._id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Delete
              </Button>
            </div>
          </li>
        ))}
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
