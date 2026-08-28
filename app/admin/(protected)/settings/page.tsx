import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { getAdminSession, getConvexClient } from "@/lib/adminAuth";
import ChangePasswordForm from "./ChangePasswordForm";
import GeneralSettingsForm from "./GeneralSettingsForm";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const settings = await getConvexClient().query(api.admin.GetSettings, {
    token: session.token,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">Settings</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">Settings</h2>
      </div>

      <div className="flex flex-col gap-8">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-sm font-semibold">Admin account</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Username <span className="font-medium text-foreground">{session.username}</span>.
            {session.mustChangePassword
              ? " You're still using the temporary password — set a new one below."
              : " Update your password below."}
          </p>
          <div className="mt-5">
            <ChangePasswordForm />
          </div>
        </section>

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
    </div>
  );
}
