import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getAdminSession, getConvexClient } from "@/lib/adminAuth";

function parsePlan(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return null;
  const features = Array.isArray(body.features)
    ? body.features.map((f) => String(f).trim()).filter(Boolean)
    : [];
  return {
    name,
    description: typeof body.description === "string" ? body.description.trim() : undefined,
    price: Number.isFinite(Number(body.price)) ? Math.max(0, Number(body.price)) : 0,
    currency: typeof body.currency === "string" && body.currency ? body.currency : "USD",
    interval: body.interval === "year" ? "year" : "month",
    features,
    active: body.active !== false,
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
  };
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const plan = body ? parsePlan(body) : null;
  if (!plan) {
    return NextResponse.json({ error: "Plan name is required." }, { status: 400 });
  }

  const id = await getConvexClient().mutation(api.admin.UpsertPlan, {
    token: session.token,
    id: typeof body?.id === "string" ? (body.id as Id<"AdminPlanTable">) : undefined,
    ...plan,
  });

  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.id !== "string") {
    return NextResponse.json({ error: "Plan id is required." }, { status: 400 });
  }

  await getConvexClient().mutation(api.admin.DeletePlan, {
    token: session.token,
    id: body.id as Id<"AdminPlanTable">,
  });

  return NextResponse.json({ ok: true });
}
