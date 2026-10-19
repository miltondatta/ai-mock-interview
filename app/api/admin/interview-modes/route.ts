import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getAdminSession, getConvexClient } from "@/lib/adminAuth";

// "Sales Interview (B2B)" -> "sales-interview-b2b", matching the existing mode values.
function toModeValue(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  const value = toModeValue(label);
  if (!label || !value) {
    return NextResponse.json({ error: "Interview mode name is required." }, { status: 400 });
  }

  try {
    const id = await getConvexClient().mutation(api.admin.AddInterviewMode, {
      token: session.token,
      value,
      label,
    });
    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json({ error: "This interview mode already exists." }, { status: 409 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.id !== "string") {
    return NextResponse.json({ error: "Interview mode id is required." }, { status: 400 });
  }

  await getConvexClient().mutation(api.admin.RemoveInterviewMode, {
    token: session.token,
    id: body.id as Id<"InterviewModeTable">,
  });

  return NextResponse.json({ ok: true });
}
