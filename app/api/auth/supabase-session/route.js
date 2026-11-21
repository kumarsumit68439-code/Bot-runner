import { NextResponse } from "next/server";
import { sessionCookieOptions, signPayload } from "@/lib/session";
import {
  getUserFromAccessToken,
  sessionPayloadFromSupabaseUser,
  supabaseAuthConfigured,
} from "@/lib/supabaseAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  if (!supabaseAuthConfigured()) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const accessToken = String(body.access_token || "").trim();
  if (!accessToken) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }

  try {
    const user = await getUserFromAccessToken(accessToken);
    if (!user?.id) {
      return NextResponse.json({ error: "user_fetch" }, { status: 401 });
    }

    const provider =
      user.app_metadata?.provider === "google" ||
      (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.includes("google"))
        ? "google"
        : "email";

    const payload = sessionPayloadFromSupabaseUser(user, provider);
    const signed = signPayload(payload);
    const opts = sessionCookieOptions(signed);
    const res = NextResponse.json({ ok: true, user: { id: payload.id, username: payload.username } });
    res.cookies.set(opts.name, opts.value, {
      httpOnly: opts.httpOnly,
      secure: opts.secure,
      sameSite: opts.sameSite,
      path: opts.path,
      maxAge: opts.maxAge,
    });
    return res;
  } catch (e) {
    console.error("supabase-session", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
