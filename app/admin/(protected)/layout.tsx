import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/adminAuth";
import AdminShell from "../_components/AdminShell";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  return (
    <AdminShell username={session.username} mustChangePassword={session.mustChangePassword}>
      {children}
    </AdminShell>
  );
}
