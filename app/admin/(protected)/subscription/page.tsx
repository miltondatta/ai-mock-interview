import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { getAdminSession, getConvexClient } from "@/lib/adminAuth";
import { formatMoney } from "../../_lib/format";
import PlansManager from "./PlansManager";

export const dynamic = "force-dynamic";

export default async function AdminSubscriptionPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const convex = getConvexClient();
  let plans = await convex.query(api.admin.ListPlans, { token: session.token });
  // First visit seeds the starter Free / Pro / Premium tiers.
  if (plans.length === 0) {
    await convex.mutation(api.admin.SeedDefaultPlans, { token: session.token });
    plans = await convex.query(api.admin.ListPlans, { token: session.token });
  }

  const activePlans = plans.filter((p) => p.active);
  const monthly = activePlans.reduce(
    (sum, p) => sum + (p.interval === "year" ? p.price / 12 : p.price),
    0
  );

  const summary = [
    { label: "Total plans", value: String(plans.length) },
    { label: "Active plans", value: String(activePlans.length) },
    {
      label: "Combined monthly price",
      value: formatMoney(Math.round(monthly * 100) / 100),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">Subscription</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">Plans</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the subscription tiers shown to customers.
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

      <PlansManager initialPlans={plans} />
    </div>
  );
}
