import { NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/session";
import {
  secretsDelete,
  secretsGet,
  secretsList,
  secretsUpsert,
  supabaseConfigured,
} from "@/lib/supabaseAdmin";

const ADMIN_USER_ID = "1487343086198853785";

async function requireOwner() {
  const session = await getSession();
  if (!session?.id) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (String(session.id) !== ADMIN_USER_ID && !isAdmin(session.id)) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { session };
}

export async function GET(req) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  if (!supabaseConfigured()) {
    return NextResponse.json({ configured: false, keys: [], message: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Vercel." });
  }
  const key = new URL(req.url).searchParams.get("key");
  try {
    if (key) {
      const row = await secretsGet(auth.session.id, key);
      if (!row) return NextResponse.json({ key, value: null });
      return NextResponse.json({ key: row.key, value: row.value, updated_at: row.updated_at });
    }
    const rows = await secretsList(auth.session.id);
    // list never returns raw values — only key names
    return NextResponse.json({
      configured: true,
      keys: rows.map((r) => ({ key: r.key, updated_at: r.updated_at })),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const keyName = String(body.key || "").trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(keyName)) {
    return NextResponse.json({ error: "invalid key" }, { status: 400 });
  }
  const value = String(body.value ?? "");
  if (value.length > 100_000) {
    return NextResponse.json({ error: "value too large" }, { status: 400 });
  }
  try {
    await secretsUpsert(auth.session.id, keyName, value);
    return NextResponse.json({ ok: true, key: keyName });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  const keyName = new URL(req.url).searchParams.get("key") || "";
  if (!keyName) return NextResponse.json({ error: "key required" }, { status: 400 });
  try {
    await secretsDelete(auth.session.id, keyName);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
