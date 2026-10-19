import { redirect } from "next/navigation";

// Settings is split into sub-pages (see the sidebar's Settings sub-menu); the
// bare /admin/settings route lands on the first one.
export default function AdminSettingsPage() {
  redirect("/admin/settings/change-password");
}
