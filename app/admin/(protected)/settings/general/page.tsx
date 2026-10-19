import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { getAdminSession, getConvexClient } from "@/lib/adminAuth";
import GeneralSettingsForm from "../GeneralSettingsForm";

export const dynamic = "force-dynamic";

export default async function AdminGeneralSettingsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const settings = await getConvexClient().query(api.admin.GetSettings, {
    token: session.token,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">Settings</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">General Settings</h2>
      </div>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h3 className="text-sm font-semibold">General</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Application-wide preferences.
        </p>
        <div className="mt-5">
          <GeneralSettingsForm settings={settings} />
        </div>
      </section>
    </div>
  );
}
