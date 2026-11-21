import { NextResponse } from "next/server";
import { sessionCookieOptions, signPayload } from "@/lib/session";
import {
  signInWithPassword,
  signUpWithPassword,
  sessionPayloadFromSupabaseUser,
  supabaseAuthConfigured,
  supabaseAuthMissing,
} from "@/lib/supabaseAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function verifyTurnstile(token, ip) {
  const secret = (process.env.TURNSTILE_SECRET_KEY || "").trim();
  if (!secret) return { ok: false, reason: "captcha_missing_keys" };
  if (!token || !String(token).trim()) return { ok: false, reason: "captcha_required" };

  async function once(withIp) {
    const body = new URLSearchParams({
      secret,
      response: String(token).trim(),
    });
    if (withIp && ip) body.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    return r.json().catch(() => ({}));
  }

  try {
    let j = await once(true);
    if (!j?.success && ip) {
      j = await once(false);
    }
    if (!j?.success) {
      const codes = Array.isArray(j?.["error-codes"]) ? j["error-codes"] : [];
      console.error("turnstile email verify failed", codes, j);
      if (codes.some((c) => /hostname|domain|invalid/i.test(String(c)))) {
        return { ok: false, reason: "captcha_hostname" };
      }
      if (codes.includes("timeout-or-duplicate") || codes.includes("invalid-input-response")) {
        return { ok: false, reason: "captcha_expired" };
      }
      return { ok: false, reason: "captcha_failed" };
    }
    return { ok: true };
  } catch (e) {
    console.error("turnstile exception", e);
    return { ok: false, reason: "captcha_failed" };
  }
}

export async function POST(req) {
  if (!supabaseAuthConfigured()) {
    const m = supabaseAuthMissing();
    const parts = [];
    if (m.missingUrl) parts.push("SUPABASE_URL");
    if (m.missingKey) parts.push("SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)");
    return NextResponse.json(
      {
        error: "supabase_not_configured",
        message: `Missing on Vercel (Production): ${parts.join(" + ") || "SUPABASE_URL / key"}. Save env → Redeploy.`,
      },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const mode = body.mode === "signup" ? "signup" : "login";
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const turnstile = String(body.turnstile || "");

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "weak_password", message: "Password must be at least 6 characters." }, { status: 400 });
  }

  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "";
  const captcha = await verifyTurnstile(turnstile, ip);
  if (!captcha.ok) {
    return NextResponse.json({ error: captcha.reason }, { status: 400 });
  }

  try {
    const result =
      mode === "signup"
        ? await signUpWithPassword(email, password)
        : await signInWithPassword(email, password);

    if (result.error) {
      const msg = String(result.error);
      let code = "auth_failed";
      if (/invalid login|invalid credentials|email not confirmed/i.test(msg)) code = "invalid_credentials";
      if (/already registered|already been registered|User already/i.test(msg)) code = "already_registered";
      if (/confirm|verification/i.test(msg)) code = "email_confirm_required";
      return NextResponse.json({ error: code, message: msg }, { status: result.status || 400 });
    }

    if (result.needsConfirm || !result.access_token || !result.user?.id) {
      return NextResponse.json({
        ok: true,
        needsConfirm: true,
        message: "Check your email to confirm the account, then log in.",
      });
    }

    const payload = sessionPayloadFromSupabaseUser(result.user, "email");
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
    console.error("email auth", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
