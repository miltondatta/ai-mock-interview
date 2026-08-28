import crypto from "node:crypto";
import { cookies } from "next/headers";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

// Shared server-side helpers for the /admin panel login. Passwords are hashed
// with PBKDF2-SHA256; Convex only ever sees the salt + digest.

export const ADMIN_COOKIE = "admin_session";
export const ADMIN_USERNAME = "admin";
// Temporary password seeded on the very first login attempt. The admin is asked
// to replace it from Settings straight after signing in.
export const ADMIN_TEMP_PASSWORD = "ChangeMe!2026";

const PBKDF2_ITERATIONS = 100_000;
const KEY_LEN = 32;

export function hashPassword(password: string, salt?: string) {
  const useSalt = salt ?? crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, useSalt, PBKDF2_ITERATIONS, KEY_LEN, "sha256")
    .toString("hex");
  return { salt: useSalt, hash };
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function getConvexClient() {
  return new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
}

// Reads the session cookie and confirms it against Convex. Returns null when
// there is no valid session. Used by the protected layout and every admin page.
export async function getAdminSession() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const session = await getConvexClient().query(api.admin.VerifySession, { token });
  if (!session) return null;
  return { token, ...session };
}
