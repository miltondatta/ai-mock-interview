import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Users as UsersIcon,
  ClipboardList,
  CheckCircle2,
  TrendingUp,
  CreditCard,
  UserPlus,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { getAdminSession, getConvexClient } from "@/lib/adminAuth";
import { Badge } from "@/components/ui/badge";
import { formatDate, relativeTime } from "../_lib/format";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  completed: "Completed",
  in_progress: "In progress",
  draft: "Draft",
};

export default async function AdminDashboardPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const stats = await getConvexClient().query(api.admin.GetDashboardStats, {
    token: session.token,
  });

  const cards = [
    {
      label: "Total users",
      value: stats.totalUsers,
      icon: UsersIcon,
      hint: `${stats.newUsersLast7Days} new this week`,
    },
    {
      label: "Total interviews",
      value: stats.totalInterviews,
      icon: ClipboardList,
      hint: `${stats.interviewsLast7Days} this week`,
    },
    {
      label: "Completed",
      value: stats.completedInterviews,
      icon: CheckCircle2,
      hint: `${stats.draftInterviews} not completed`,
    },
    {
      label: "Active plans",
      value: stats.activePlans,
      icon: CreditCard,
      hint: "Subscription tiers",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">Overview</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">Dashboard</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">{card.label}</span>
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-[18px]" />
                </span>
              </div>
              <p className="mt-3 text-3xl font-bold tracking-tight">{card.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <UserPlus className="size-4 text-primary" /> Recent users
            </h3>
            <Link
              href="/admin/users"
              className="text-xs font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          {stats.recentUsers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No users yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {stats.recentUsers.map((u) => (
                <li key={u._id} className="flex items-center gap-3 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {u.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.imageUrl} alt="" className="size-full object-cover" />
                    ) : (
                      (u.name || u.email || "?").charAt(0).toUpperCase()
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{u.name || "Unnamed user"}</p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(u.joinedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="size-4 text-primary" /> Recent interviews
            </h3>
          </div>
          {stats.recentInterviews.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No interviews yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {stats.recentInterviews.map((i) => (
                <li key={i._id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.jobTitle}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {i.userName}
                      {i.level ? ` · ${i.level}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={i.status === "completed" ? "success" : "secondary"}>
                      {STATUS_LABELS[i.status] ?? i.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(i.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
