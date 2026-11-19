import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// Shared by the Professional Profile routes (app/api/profile/*). The Convex
// user is looked up from the signed-in Clerk session on the server and never
// taken from the request, as in app/api/resumes/route.ts.

export const profileConvexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function resolveProfileUserId(): Promise<Id<'UserTable'> | null> {
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress;
    if (!email) return null;
    const convexUser = await profileConvexClient.query(api.users.GetUserByEmail, { email });
    return convexUser?._id ?? null;
}

// Parses a JSON object body and drops any userId the client sent, so the
// server-resolved id is always the one used.
export async function readProfileBody(req: Request): Promise<Record<string, unknown> | null> {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return null;
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const { userId: _ignored, ...rest } = body as Record<string, unknown>;
    return rest;
}

export function profileErrorMessage(e: unknown, fallback: string): string {
    // Convex validation and Error messages come back in the form
    // "[CONVEX M(...)] ... Uncaught Error: <message>". Only <message> is shown.
    const raw = e instanceof Error ? e.message : '';
    const match = raw.match(/Uncaught Error: ([^\n]+)/);
    return match?.[1]?.trim() || fallback;
}
