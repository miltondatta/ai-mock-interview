import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { getAdminSession, getConvexClient } from "@/lib/adminAuth";
import JobMatchingConfigForm from "../JobMatchingConfigForm";
import { formatDateTime } from "../../../_lib/format";

export const dynamic = "force-dynamic";

// Admin > Settings > Job Matching (P0). Lets an admin tune job-matching/
// job-discovery business rules (minimum match score, recommendation cap and
// sort, profile-update re-evaluation, automatic external sync) without a
// code change or redeploy. See JOB_PERSISTENCE_FILTERING_INVESTIGATION_REPORT.md
// for the P1-P7 milestones that will actually consume most of these -
// today, only the automatic-sync toggle has real operational effect
// (convex/http.ts, convex/jobDiscovery.ts:triggerInitialJobSearch); every
// other setting here is stored, validated and audited, ready for those
// later milestones to read through convex/jobMatchingConfig.ts's reusable
// access functions.
export default async function AdminJobMatchingSettingsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const [config, audit] = await Promise.all([
    getConvexClient().query(api.jobMatchingConfig.GetJobMatchingConfig, { token: session.token }),
    getConvexClient().query(api.jobMatchingConfig.GetJobMatchingConfigAudit, { token: session.token }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">Settings</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">Job Matching Configuration</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Business rules for job matching and discovery. Changes apply immediately, with no code change or redeploy.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <JobMatchingConfigForm config={config} />
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h3 className="text-sm font-semibold">Change history</h3>
        <p className="mt-1 text-sm text-muted-foreground">The most recent configuration changes, oldest at the bottom.</p>
        {audit.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No changes have been made yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">When</th>
                  <th className="pb-2 pr-4 font-medium">Admin</th>
                  <th className="pb-2 pr-4 font-medium">Setting</th>
                  <th className="pb-2 pr-4 font-medium">Previous</th>
                  <th className="pb-2 font-medium">New</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((entry) => (
                  <tr key={entry._id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">{formatDateTime(entry.changedAt)}</td>
                    <td className="py-2 pr-4">{entry.adminUsername}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{entry.settingKey}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{JSON.stringify(entry.previousValue)}</td>
                    <td className="py-2 font-medium">{JSON.stringify(entry.newValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
