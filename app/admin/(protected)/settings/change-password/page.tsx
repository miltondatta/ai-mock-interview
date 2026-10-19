import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/adminAuth";
import ChangePasswordForm from "../ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function AdminChangePasswordPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">Settings</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">Change Password</h2>
      </div>

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
    </div>
  );
}
