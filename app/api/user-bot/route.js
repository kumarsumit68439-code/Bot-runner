import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  secretsDelete,
  secretsGet,
  secretsUpsert,
  supabaseConfigured,
} from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const KEY_TOKEN = "USER_BOT_TOKEN";
const KEY_CLIENT = "USER_CLIENT_ID";

/** Each logged-in Discord user stores their own bot token + client id (never shared). */
export async function GET() {
  const session = await getSession();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!supabaseConfigured()) {
    return NextResponse.json({ configured: false, botToken: "", clientId: "" });
  }
  try {
    const [t, c] = await Promise.all([
      secretsGet(String(session.id), KEY_TOKEN),
      secretsGet(String(session.id), KEY_CLIENT),
    ]);
    return NextResponse.json({
      configured: true,
      botToken: String(t?.value || ""),
      clientId: String(c?.value || ""),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req) {
  const session = await getSession();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!supabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 }
    );
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const botToken = String(body.botToken ?? "").trim();
  const clientId = String(body.clientId ?? "").trim();
  if (botToken.length > 200 || clientId.length > 40) {
    return NextResponse.json({ error: "value too long" }, { status: 400 });
  }
  try {
    const uid = String(session.id);
    if (botToken) await secretsUpsert(uid, KEY_TOKEN, botToken);
    else await secretsDelete(uid, KEY_TOKEN).catch(() => {});
    if (clientId) await secretsUpsert(uid, KEY_CLIENT, clientId);
    else await secretsDelete(uid, KEY_CLIENT).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
