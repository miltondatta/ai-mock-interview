import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getAdminSession, getConvexClient } from "@/lib/adminAuth";

const ALLOWED_KEYS = [
  "siteName",
  "supportEmail",
  "announcement",
  "allowNewRegistrations",
  "maintenanceMode",
] as const;

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const settings: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    if (key in body) settings[key] = body[key];
  }

  await getConvexClient().mutation(api.admin.SaveSettings, {
    token: session.token,
    settings,
  });

  return NextResponse.json({ ok: true });
}
