import { NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/session";
import {
  secretsGet,
  secretsUpsert,
  supabaseConfigured,
} from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/** Fixed owner id so every user reads the same host config. */
const SHARED_OWNER = "__panel_shared_host__";
const ADMIN_USER_ID = "1487343086198853785";

const KEYS = {
  mode: "HOST_MODE",
  tunnel: "TUNNEL_URL",
  token: "AUTH_TOKEN",
};

function isOwner(session) {
  if (!session?.id) return false;
  const id = String(session.id);
  return id === ADMIN_USER_ID || isAdmin(id) || id === `spotify:${ADMIN_USER_ID}`;
}

async function readShared() {
  if (!supabaseConfigured()) {
    return { configured: false, hostMode: "cloudflare", tunnelUrl: "", authToken: "" };
  }
  const [mode, tunnel, token] = await Promise.all([
    secretsGet(SHARED_OWNER, KEYS.mode),
    secretsGet(SHARED_OWNER, KEYS.tunnel),
    secretsGet(SHARED_OWNER, KEYS.token),
  ]);
  const hostMode = mode?.value === "railway" ? "railway" : "cloudflare";
  const tunnelUrl = String(tunnel?.value || "").trim();
  const authToken = String(token?.value || "").trim();
  return {
    configured: Boolean(tunnelUrl && authToken),
    hostMode,
    tunnelUrl,
    authToken,
  };
}

/** Any logged-in user: get shared daemon host (for WS). UI must not display the URL to non-admins. */
export async function GET() {
  const session = await getSession();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const data = await readShared();
    const admin = isOwner(session);
    // Non-admins still need real values to connect; client hides them in the UI.
    return NextResponse.json({
      ...data,
      isAdmin: admin,
      // Explicit flag for UI: never show raw tunnel to non-admin
      showUrl: admin,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** Admin only: set shared Termux/Cloudflare or Railway tunnel for everyone. */
export async function PUT(req) {
  const session = await getSession();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isOwner(session)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!supabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Vercel." },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const hostMode = body.hostMode === "railway" ? "railway" : "cloudflare";
  const tunnelUrl = String(body.tunnelUrl || "").trim();
  const authToken = String(body.authToken || "").trim();

  if (!tunnelUrl || !authToken) {
    return NextResponse.json({ error: "tunnelUrl and authToken are required" }, { status: 400 });
  }
  if (tunnelUrl.length > 2000 || authToken.length > 500) {
    return NextResponse.json({ error: "value too long" }, { status: 400 });
  }

  try {
    await secretsUpsert(SHARED_OWNER, KEYS.mode, hostMode);
    await secretsUpsert(SHARED_OWNER, KEYS.tunnel, tunnelUrl);
    await secretsUpsert(SHARED_OWNER, KEYS.token, authToken);
    return NextResponse.json({
      ok: true,
      configured: true,
      hostMode,
      // echo masked only
      tunnelHost: (() => {
        try {
          const u = new URL(tunnelUrl.includes("://") ? tunnelUrl : `wss://${tunnelUrl}`);
          return u.host;
        } catch {
          return "(set)";
        }
      })(),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
