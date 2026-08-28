import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import {
  ADMIN_USERNAME,
  getAdminSession,
  getConvexClient,
  hashPassword,
  verifyPassword,
} from "@/lib/adminAuth";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const convex = getConvexClient();
  const credentials = await convex.query(api.admin.GetAdminCredentials, {
    username: ADMIN_USERNAME,
  });
  if (!credentials) {
    return NextResponse.json({ error: "Admin account not found." }, { status: 400 });
  }
  if (!verifyPassword(currentPassword, credentials.passwordSalt, credentials.passwordHash)) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  const next = hashPassword(newPassword);
  await convex.mutation(api.admin.UpdateAdminPassword, {
    token: session.token,
    passwordHash: next.hash,
    passwordSalt: next.salt,
  });

  return NextResponse.json({ ok: true });
}
