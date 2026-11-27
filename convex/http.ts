import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { syncHimalayas } from "./himalayasSync";
import { syncJobicy } from "./jobicy";

// Secure synchronization gateway for n8n (J7). This is the ONLY way an
// external caller (the "AI Mock Interview - External Job Synchronization"
// n8n workflow) can trigger a provider sync - there is no other public,
// unauthenticated entry point. It is a narrow gateway only: every line of
// actual fetch/normalize/persist/dedupe/rate-limit logic still lives in
// convex/jobSyncRunner.ts and convex/jobSyncShared.ts, reached through the
// exact same convex/himalayasSync.ts:syncHimalayas / convex/jobicy.ts:syncJobicy
// functions the admin panel's own manual-trigger buttons already call -
// nothing is duplicated here (J7 Phase 2's explicit instruction).
//
// Auth model: a single shared secret, set as a CONVEX (not Next.js)
// environment variable - see JOB_SEARCH_IMPLEMENTATION_PROGRESS.md for how
// to set it. n8n sends it as `Authorization: Bearer <secret>`. This is
// deliberately the smallest viable mechanism for a machine-to-machine
// caller with no human session: the existing admin-session-cookie flow
// (convex/admin.ts's requireSession/VerifySession) is for *interactive*
// admin panel use and isn't a fit for an unattended scheduler, so this adds
// a second, narrower authentication path rather than stretching that one.
//
// Ordinary application users cannot reach this at all - it is served from
// the Convex HTTP Actions domain (`<deployment>.convex.site`, already known
// to this app as NEXT_PUBLIC_CONVEX_SITE_URL), not from the Next.js app, is
// never linked from any page, and requires the secret on every call.

const http = httpRouter();

// Constant-time-ish string comparison so a timing side-channel doesn't leak
// how many leading characters of the secret were guessed correctly. This is
// a best-effort hardening measure (plain JS, no crypto dependency needed in
// Convex's HTTP action runtime), not a formal cryptographic guarantee -
// documented honestly rather than overstated.
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const SUPPORTED_PROVIDERS = ["himalayas", "jobicy"] as const;
type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

// Shared by both routes below. Returns an error Response to send as-is when
// auth fails, or null when the request is authenticated and may proceed.
// The secret itself is never logged, echoed back, or included in any error
// response - every branch returns a fixed, generic message.
function checkAuth(request: Request): Response | null {
  const configuredSecret = process.env.JOB_SYNC_SHARED_SECRET;
  if (!configuredSecret) {
    // Fails closed: an unconfigured secret means the endpoint refuses every
    // request rather than accepting one with no real check.
    console.error("[jobs] JOB_SYNC_SHARED_SECRET is not configured - refusing all requests.");
    return jsonResponse(503, { error: "Sync endpoint is not configured." });
  }
  const authHeader = request.headers.get("Authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  if (!provided || !secretsMatch(provided, configuredSecret)) {
    return jsonResponse(401, { error: "Unauthorized." });
  }
  return null;
}

http.route({
  path: "/jobs/sync",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authError = checkAuth(request);
    if (authError) return authError;

    // --- Provider validation ---------------------------------------------------------
    const body = await request.json().catch(() => null);
    const providerRaw = body && typeof body === "object" ? (body as Record<string, unknown>).provider : undefined;
    if (typeof providerRaw !== "string" || !SUPPORTED_PROVIDERS.includes(providerRaw as SupportedProvider)) {
      return jsonResponse(400, { error: `Unsupported or missing "provider". Use one of: ${SUPPORTED_PROVIDERS.join(", ")}.` });
    }
    const provider = providerRaw as SupportedProvider;

    // --- Automatic-sync toggle (P0) ---------------------------------------------------
    // This route is n8n's only entry point (never a human's) - every call
    // here is, by definition, "automatic" synchronization, so this is
    // exactly where Job Matching Configuration's automaticJobSyncEnabled
    // must be enforced (the admin panel's own manual sync buttons and the
    // candidate-facing "Check for New Jobs" button call syncHimalayas/
    // syncJobicy directly and are untouched by this check - see
    // JOB_PERSISTENCE_FILTERING_INVESTIGATION_REPORT.md and
    // convex/jobMatchingConfig.ts). Responds 200 with ok: true (not an
    // error status) so n8n's own "OK?" nodes (which gate solely on
    // $json.ok === true) treat a deliberately-disabled sync as a normal,
    // non-retried completion rather than a failure.
    const config = await ctx.runQuery(internal.jobMatchingConfig.GetEffectiveConfig, {});
    if (!config.automaticJobSyncEnabled) {
      return jsonResponse(200, {
        provider,
        ok: true,
        status: "skipped",
        reason: "Automatic job synchronization is disabled in Job Matching Configuration.",
        jobsFetched: 0,
        jobsInserted: 0,
        jobsUpdated: 0,
        jobsExpired: 0,
        skipped: 0,
        runId: null,
      });
    }

    // --- Invoke the existing, unduplicated sync entry point --------------------------
    try {
      const result = provider === "himalayas" ? await syncHimalayas(ctx) : await syncJobicy(ctx);
      // status "success"/"partial" -> 200 (both are normal, non-error
      // completions - see JOB_SEARCH_IMPLEMENTATION_PROGRESS.md on why
      // "partial" is expected/common for Himalayas and is not a failure).
      // status "failed" -> 502, so n8n's native per-node retry (configured
      // to retry on 5xx) engages automatically without the workflow having
      // to parse the response body to decide whether to retry.
      const httpStatus = result.status === "failed" ? 502 : 200;
      return jsonResponse(httpStatus, { provider, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error during synchronization.";
      // beginSyncRun's own rejections (already running / rate-limit cooldown
      // not yet elapsed) are recognized by their distinctive wording (see
      // convex/jobSyncShared.ts's beginSyncRun) and mapped to 429, so the
      // workflow's retry settings (retry on 5xx only) correctly do NOT
      // retry a rejection that cannot succeed within the retry window, per
      // J7 Phase 4's explicit instruction.
      const isRejection = message.includes("already running") || message.includes("can only be synced once every");
      return jsonResponse(isRejection ? 429 : 500, { provider, ok: false, status: "failed", error: message });
    }
  }),
});

// Read-only lookup of a provider's most recent sync run (J7 Phase 6: a
// failure notification should say "whether the other provider completed
// successfully"). Same auth as /jobs/sync - this is not a second,
// less-protected endpoint. Reads only; never triggers a sync or touches any
// job data. Returns the existing jobSyncRuns row as-is (no second audit
// system), or `run: null` if that provider has never been synced yet.
http.route({
  path: "/jobs/status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const authError = checkAuth(request);
    if (authError) return authError;

    const url = new URL(request.url);
    const providerRaw = url.searchParams.get("provider");
    if (!providerRaw || !SUPPORTED_PROVIDERS.includes(providerRaw as SupportedProvider)) {
      return jsonResponse(400, { error: `Unsupported or missing "provider". Use one of: ${SUPPORTED_PROVIDERS.join(", ")}.` });
    }

    const run = await ctx.runQuery(internal.jobSyncShared.getLatestSyncRun, { provider: providerRaw });
    return jsonResponse(200, { provider: providerRaw, run });
  }),
});

export default http;
