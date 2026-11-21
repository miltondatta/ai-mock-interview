import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { getAdminSession, getConvexClient } from "@/lib/adminAuth";
import JobsManager from "./JobsManager";

export const dynamic = "force-dynamic";

// Admin > Jobs (M7): the job openings users see on /jobs and in the
// dashboard's "Jobs for you". Listings only come from here. There's no
// external job feed.
export default async function AdminJobsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { jobs, activeTruncated, inactiveTruncated } = await getConvexClient().query(api.Jobs.AdminListJobs, { token: session.token });
  const active = jobs.filter((j) => j.active).length;
  const hidden = jobs.length - active;

  // "300+" rather than a flat count when a status branch hit AdminListJobs'
  // per-status cap - otherwise these numbers would quietly understate the
  // real total once the table holds more active or hidden jobs than that.
  const summary = [
    { label: "Total jobs", value: `${jobs.length}${activeTruncated || inactiveTruncated ? "+" : ""}` },
    { label: "Active (visible to users)", value: `${active}${activeTruncated ? "+" : ""}` },
    { label: "Hidden", value: `${hidden}${inactiveTruncated ? "+" : ""}` },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">Jobs</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">Job openings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Post the job openings users see on the Jobs page and in &quot;Jobs for you&quot;. Required skills, experience,
          location and education are used to match jobs to each user&apos;s profile.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {summary.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground">{s.label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight">{s.value}</p>
          </div>
        ))}
      </div>

      <JobsManager initialJobs={jobs} />
    </div>
  );
}
