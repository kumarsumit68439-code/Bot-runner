import { NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/session";
import {
  secretsAll,
  secretsDelete,
  secretsGet,
  secretsList,
  secretsReplaceAll,
  secretsUpsert,
  supabaseConfigured,
} from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const ADMIN_USER_ID = "1487343086198853785";
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

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
    return NextResponse.json({
      configured: false,
      keys: [],
      items: [],
      message: "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Vercel.",
    });
  }
  const params = new URL(req.url).searchParams;
  const key = params.get("key");
  try {
    // ?all=1 -> every variable with its (decrypted) value, for the owner's Environment tab
    if (params.get("all")) {
      const items = await secretsAll(auth.session.id);
      return NextResponse.json({ configured: true, items });
    }
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

/** Replace everything: body { items: [{ key, value }] } makes the stored variables exactly this list. */
export async function POST(req) {
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
  if (!Array.isArray(body?.items)) return NextResponse.json({ error: "items required" }, { status: 400 });
  if (body.items.length > 100) return NextResponse.json({ error: "too many variables (max 100)" }, { status: 400 });

  const seen = new Set();
  const items = [];
  for (const it of body.items) {
    const key = String(it?.key || "").trim();
    if (!KEY_RE.test(key)) return NextResponse.json({ error: "invalid variable name" }, { status: 400 });
    if (seen.has(key)) return NextResponse.json({ error: `duplicate variable: ${key}` }, { status: 400 });
    const value = String(it?.value ?? "");
    if (value.length > 100_000) return NextResponse.json({ error: `value too large: ${key}` }, { status: 400 });
    seen.add(key);
    items.push({ key, value });
  }
  try {
    await secretsReplaceAll(auth.session.id, items);
    return NextResponse.json({ ok: true, count: items.length });
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
  if (!KEY_RE.test(keyName)) {
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
