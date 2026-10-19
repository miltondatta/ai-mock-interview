import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { getAdminSession, getConvexClient } from "@/lib/adminAuth";
import { hasBuiltInGreeting } from "@/utils/elevenlabsContext";
import LanguagesManager from "../LanguagesManager";

export const dynamic = "force-dynamic";

export default async function AdminLanguageSettingsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const convex = getConvexClient();
  // First visit seeds the languages the app shipped with.
  let languages = await convex.query(api.admin.ListLanguages, { token: session.token });
  if (languages.length === 0) {
    await convex.mutation(api.admin.SeedDefaultLanguages, { token: session.token });
    languages = await convex.query(api.admin.ListLanguages, { token: session.token });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">Settings</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">Languages</h2>
      </div>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h3 className="text-sm font-semibold">Language</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Languages available in the app. Only languages supported by ElevenLabs can be added.
        </p>
        <div className="mt-5">
          <LanguagesManager
            languages={languages.map((l) => ({ ...l, builtInGreeting: hasBuiltInGreeting(l.code) }))}
          />
        </div>
      </section>
    </div>
  );
}
