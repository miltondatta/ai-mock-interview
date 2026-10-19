import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { getAdminSession, getConvexClient } from "@/lib/adminAuth";
import InterviewModesManager from "../InterviewModesManager";

export const dynamic = "force-dynamic";

export default async function AdminInterviewModesPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const convex = getConvexClient();
  // First visit seeds the interview modes the app shipped with.
  let interviewModes = await convex.query(api.InterviewModes.ListInterviewModes, {});
  if (interviewModes.length === 0) {
    await convex.mutation(api.admin.SeedDefaultInterviewModes, { token: session.token });
    interviewModes = await convex.query(api.InterviewModes.ListInterviewModes, {});
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">Settings</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">Interview Modes</h2>
      </div>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h3 className="text-sm font-semibold">Interview Preferences</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Interview Modes offered on Create Interview and in users&apos; Interview Preferences.
        </p>
        <div className="mt-5">
          <InterviewModesManager modes={interviewModes} />
        </div>
      </section>
    </div>
  );
}
