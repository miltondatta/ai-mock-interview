import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { getAdminSession, getConvexClient } from "@/lib/adminAuth";
import UsersTable from "./UsersTable";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const users = await getConvexClient().query(api.admin.ListUsers, {
    token: session.token,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">
          {users.length} {users.length === 1 ? "account" : "accounts"}
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">Users</h2>
      </div>
      <UsersTable users={users} />
    </div>
  );
}
