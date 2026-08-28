import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { api } from "@/convex/_generated/api";
import { ADMIN_COOKIE, getConvexClient } from "@/lib/adminAuth";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;
  if (token) {
    await getConvexClient().mutation(api.admin.DeleteSession, { token });
  }
  cookieStore.delete(ADMIN_COOKIE);
  return NextResponse.json({ ok: true });
}
