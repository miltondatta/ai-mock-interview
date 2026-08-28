import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/adminAuth";
import AdminLoginForm from "./AdminLoginForm";

export const metadata = {
  title: "Admin Login · AI Mock Interview",
};

export default async function AdminLoginPage() {
  const session = await getAdminSession();
  if (session) {
    redirect("/admin");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <AdminLoginForm />
    </div>
  );
}
