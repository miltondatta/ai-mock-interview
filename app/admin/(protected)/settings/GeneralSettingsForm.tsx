"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Settings {
  siteName?: string;
  supportEmail?: string;
  announcement?: string;
  allowNewRegistrations?: boolean;
  maintenanceMode?: boolean;
}

export default function GeneralSettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [form, setForm] = useState<Settings>({
    siteName: settings.siteName ?? "",
    supportEmail: settings.supportEmail ?? "",
    announcement: settings.announcement ?? "",
    allowNewRegistrations: settings.allowNewRegistrations ?? true,
    maintenanceMode: settings.maintenanceMode ?? false,
  });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not save settings.");
        return;
      }
      setDone(true);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="siteName" className="text-sm font-medium">
            Site name
          </label>
          <Input
            id="siteName"
            value={form.siteName}
            onChange={(e) => setForm({ ...form, siteName: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="supportEmail" className="text-sm font-medium">
            Support email
          </label>
          <Input
            id="supportEmail"
            type="email"
            value={form.supportEmail}
            onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="announcement" className="text-sm font-medium">
          Announcement banner
        </label>
        <Input
          id="announcement"
          value={form.announcement}
          onChange={(e) => setForm({ ...form, announcement: e.target.value })}
          placeholder="Shown to signed-in users (leave blank to hide)"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!form.allowNewRegistrations}
          onChange={(e) => setForm({ ...form, allowNewRegistrations: e.target.checked })}
          className="size-4 rounded border-input accent-primary"
        />
        Allow new user registrations
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!form.maintenanceMode}
          onChange={(e) => setForm({ ...form, maintenanceMode: e.target.checked })}
          className="size-4 rounded border-input accent-primary"
        />
        Maintenance mode
      </label>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      {done && (
        <p className="flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="size-4" /> Settings saved.
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-fit">
        {loading && <Loader2 className="animate-spin" />}
        {loading ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
