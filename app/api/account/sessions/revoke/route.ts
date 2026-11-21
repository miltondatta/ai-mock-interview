import { NextResponse } from "next/server";
import { clerkClient, currentUser } from "@clerk/nextjs/server";

// Backend-API session revoke, used only by the "Active devices" section
// (app/(routes)/settings/AccountSettings.tsx) for an account that has no
// password set. Clerk's frontend `session.revoke()` is treated as a
// sensitive action and always routes through Clerk's own password-
// reverification popup - a dead end for a Google-only account, since there
// is no password to enter (see issue/issue08.png). Calling the Backend API
// here instead authenticates with the app's secret key, not the end user's
// own session, so it never triggers that frontend reverification flow.
// Password accounts keep using the frontend flow unchanged - this route
// refuses them, so there's exactly one way a password account's sessions
// ever get revoked.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
  }
  if (user.passwordEnabled) {
    return NextResponse.json({ error: "Not available for this account." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) {
    return NextResponse.json({ error: "A session id is required." }, { status: 400 });
  }

  try {
    const client = await clerkClient();
    // Ownership check - this request is authenticated as `user`, not as
    // whoever the session actually belongs to, so without this a signed-in
    // user could pass an arbitrary sessionId and sign someone else out.
    const session = await client.sessions.getSession(sessionId);
    if (session.userId !== user.id) {
      return NextResponse.json({ error: "You can only sign out your own devices." }, { status: 403 });
    }
    await client.sessions.revokeSession(sessionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Failed to revoke session:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Unable to sign out that device. Please try again." }, { status: 500 });
  }
}
