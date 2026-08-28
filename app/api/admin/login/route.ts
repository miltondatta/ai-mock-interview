import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { api } from "@/convex/_generated/api";
import {
  ADMIN_COOKIE,
  ADMIN_USERNAME,
  ADMIN_TEMP_PASSWORD,
  getConvexClient,
  hashPassword,
  verifyPassword,
  generateSessionToken,
} from "@/lib/adminAuth";

const SESSION_MAX_AGE = 8 * 60 * 60; // seconds

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const invalid = () =>
    NextResponse.json({ error: "Invalid username or password." }, { status: 401 });

  if (!username || !password) return invalid();

  const convex = getConvexClient();

  // Provision the admin account on first use with the temporary password so the
  // very first login can succeed.
  let credentials = await convex.query(api.admin.GetAdminCredentials, { username: ADMIN_USERNAME });
  if (!credentials) {
    const seeded = hashPassword(ADMIN_TEMP_PASSWORD);
    await convex.mutation(api.admin.SeedAdmin, {
      username: ADMIN_USERNAME,
      passwordHash: seeded.hash,
      passwordSalt: seeded.salt,
    });
    credentials = await convex.query(api.admin.GetAdminCredentials, { username: ADMIN_USERNAME });
  }

  if (!credentials || username !== credentials.username) return invalid();
  if (!verifyPassword(password, credentials.passwordSalt, credentials.passwordHash)) {
    return invalid();
  }

  const token = generateSessionToken();
  await convex.mutation(api.admin.CreateSession, { token });

  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return NextResponse.json({ ok: true, mustChangePassword: credentials.mustChangePassword });
}
