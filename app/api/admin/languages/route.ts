import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getAdminSession, getConvexClient } from "@/lib/adminAuth";
import { ELEVENLABS_LANGUAGES } from "@/app/admin/_lib/elevenlabsLanguages";
import { hasBuiltInGreeting, isValidGreetingTemplate } from "@/utils/elevenlabsContext";
import { translateGreeting, TranslatedGreeting } from "@/utils/translateGreeting";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  // Only languages ElevenLabs supports can be added.
  const language = ELEVENLABS_LANGUAGES.find((l) => l.code === body?.code);
  if (!language) {
    return NextResponse.json({ error: "Unsupported language." }, { status: 400 });
  }

  const convex = getConvexClient();
  const existing = await convex.query(api.admin.ListLanguages, { token: session.token });
  if (existing.some((l) => l.code === language.code)) {
    return NextResponse.json({ error: "Language is already added." }, { status: 409 });
  }

  // Languages with a hand-written greeting don't need one translated. For the
  // rest, a failed translation still adds the language - the interview greets
  // in English until the admin re-translates or enters the greeting.
  let translated: TranslatedGreeting | null = null;
  let warning: string | undefined;
  if (!hasBuiltInGreeting(language.code)) {
    try {
      translated = await translateGreeting(language.label);
    } catch (e) {
      console.error("Greeting translation failed:", e);
      warning = "Language added, but the interview greeting couldn't be translated automatically. Re-translate or enter it below.";
    }
  }

  try {
    const id = await convex.mutation(api.admin.AddLanguage, {
      token: session.token,
      ...language,
      ...(translated ?? {}),
    });
    return NextResponse.json({ ok: true, id, warning });
  } catch {
    return NextResponse.json({ error: "Language is already added." }, { status: 409 });
  }
}

// Saves an edited interview greeting, or re-translates it with Gemini when
// `retranslate` is true.
export async function PATCH(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.id !== "string") {
    return NextResponse.json({ error: "Language id is required." }, { status: 400 });
  }

  const convex = getConvexClient();
  const languages = await convex.query(api.admin.ListLanguages, { token: session.token });
  const language = languages.find((l) => l._id === body.id);
  if (!language) {
    return NextResponse.json({ error: "Language not found." }, { status: 404 });
  }
  if (hasBuiltInGreeting(language.code)) {
    return NextResponse.json({ error: "This language uses a built-in greeting." }, { status: 400 });
  }

  let greeting: TranslatedGreeting;
  if (body.retranslate === true) {
    try {
      greeting = await translateGreeting(language.label);
    } catch (e) {
      console.error("Greeting translation failed:", e);
      return NextResponse.json(
        { error: "Couldn't translate the greeting. Check GEMINI_API_KEY and try again, or enter it manually." },
        { status: 502 }
      );
    }
  } else {
    const text = typeof body.greeting === "string" ? body.greeting.trim() : "";
    const roleFallback = typeof body.roleFallback === "string" ? body.roleFallback.trim() : "";
    if (!isValidGreetingTemplate(text)) {
      return NextResponse.json(
        { error: "The greeting must include both {name} and {role}." },
        { status: 400 }
      );
    }
    if (!roleFallback) {
      return NextResponse.json({ error: "The role fallback is required." }, { status: 400 });
    }
    greeting = { greeting: text, roleFallback };
  }

  await convex.mutation(api.admin.UpdateLanguageGreeting, {
    token: session.token,
    id: language._id,
    ...greeting,
  });
  return NextResponse.json({ ok: true, ...greeting });
}

export async function DELETE(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.id !== "string") {
    return NextResponse.json({ error: "Language id is required." }, { status: 400 });
  }

  try {
    await getConvexClient().mutation(api.admin.RemoveLanguage, {
      token: session.token,
      id: body.id as Id<"AdminLanguageTable">,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "English is the default language and can't be removed." }, { status: 400 });
  }
}
