import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

// AI Study Room Code Editor - M3. Executes learner/Tutor code in an
// isolated public sandbox (Piston, https://github.com/engineer-man/piston) -
// never on this Next.js server itself, and no credentials are involved on
// either side (Piston's public instance needs no API key), so none are ever
// exposed to the browser. Piston's own container-per-run model is what
// provides the isolation and resource limits here; this route only adds a
// request timeout and a payload-size cap on top of that.
//
// The public instance's base URL can be overridden with PISTON_API_URL if
// the user later points this at a self-hosted Piston/Judge0-compatible
// instance instead - optional, defaults to the public one.

const PISTON_BASE_URL = process.env.PISTON_API_URL?.replace(/\/$/, "") || "https://emkc.org/api/v2/piston";
const MAX_CONTENT_LENGTH = 20_000;
const EXECUTE_TIMEOUT_MS = 12_000;
const RUNTIMES_CACHE_TTL_MS = 10 * 60 * 1000;

// Piston's language list changes version strings over time, so the
// available version for a requested language is resolved dynamically
// instead of being hardcoded - cached in memory for a few minutes per
// server process to avoid an extra round trip on every run.
let runtimesCache: { fetchedAt: number; runtimes: { language: string; version: string; aliases: string[] }[] } | null = null;

async function getRuntimes() {
  if (runtimesCache && Date.now() - runtimesCache.fetchedAt < RUNTIMES_CACHE_TTL_MS) {
    return runtimesCache.runtimes;
  }
  const res = await fetch(`${PISTON_BASE_URL}/runtimes`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Failed to load execution runtimes (${res.status}).`);
  const runtimes = (await res.json()) as { language: string; version: string; aliases: string[] }[];
  runtimesCache = { fetchedAt: Date.now(), runtimes };
  return runtimes;
}

async function resolveVersion(language: string) {
  const runtimes = await getRuntimes();
  const match = runtimes.find(
    (r) => r.language === language || r.aliases?.includes(language)
  );
  return match?.version ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const language = typeof body?.language === "string" ? body.language.trim() : "";
    const content = typeof body?.content === "string" ? body.content : "";
    const stdin = typeof body?.stdin === "string" ? body.stdin : "";

    if (!language) {
      return NextResponse.json({ error: "A language is required." }, { status: 400 });
    }
    if (content.length === 0) {
      return NextResponse.json({ error: "There is no code to run." }, { status: 400 });
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json({ error: "Code is too long to execute." }, { status: 400 });
    }

    const version = await resolveVersion(language);
    if (!version) {
      return NextResponse.json({ error: `"${language}" isn't a supported execution language.` }, { status: 400 });
    }

    const execRes = await fetch(`${PISTON_BASE_URL}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language,
        version,
        files: [{ content }],
        stdin,
        run_timeout: EXECUTE_TIMEOUT_MS,
        compile_timeout: EXECUTE_TIMEOUT_MS,
      }),
      signal: AbortSignal.timeout(EXECUTE_TIMEOUT_MS + 5000),
    });

    if (!execRes.ok) {
      const text = await execRes.text().catch(() => "");
      console.error("Piston execute failed:", execRes.status, text);
      return NextResponse.json({ error: "The execution sandbox failed to run this code." }, { status: 502 });
    }

    const data = await execRes.json();
    const run = data.run ?? {};
    const compile = data.compile ?? null;

    return NextResponse.json({
      stdout: run.stdout ?? "",
      stderr: run.stderr ?? "",
      exitCode: typeof run.code === "number" ? run.code : null,
      signal: run.signal ?? null,
      compile: compile ? { stdout: compile.stdout ?? "", stderr: compile.stderr ?? "" } : null,
      version,
    });
  } catch (e) {
    console.error("Study Room code run error:", e);
    return NextResponse.json({ error: "Unable to run this code right now. Please try again." }, { status: 500 });
  }
}
