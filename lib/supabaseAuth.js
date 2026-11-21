/**
 * Supabase Auth helpers (fetch-based, no extra npm package).
 * Needs: SUPABASE_URL + (SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY)
 */

export function supabaseAuthConfig() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const anon =
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  return { url, anon };
}

export function supabaseAuthConfigured() {
  const { url, anon } = supabaseAuthConfig();
  return Boolean(url && anon);
}

function authHeaders(anon, accessToken) {
  const h = {
    apikey: anon,
    "Content-Type": "application/json",
  };
  if (accessToken) h.Authorization = `Bearer ${accessToken}`;
  else h.Authorization = `Bearer ${anon}`;
  return h;
}

/** Password sign-in. Returns { user, access_token } or { error, status } */
export async function signInWithPassword(email, password) {
  const { url, anon } = supabaseAuthConfig();
  if (!url || !anon) return { error: "not_configured", status: 500 };
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: authHeaders(anon),
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    return {
      error: j?.error_description || j?.msg || j?.error || "login_failed",
      status: r.status,
      code: j?.error_code || j?.error,
    };
  }
  return { user: j.user, access_token: j.access_token, refresh_token: j.refresh_token };
}

/** Email sign-up. May require email confirmation depending on Supabase settings. */
export async function signUpWithPassword(email, password) {
  const { url, anon } = supabaseAuthConfig();
  if (!url || !anon) return { error: "not_configured", status: 500 };
  const r = await fetch(`${url}/auth/v1/signup`, {
    method: "POST",
    headers: authHeaders(anon),
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    return {
      error: j?.error_description || j?.msg || j?.error || "signup_failed",
      status: r.status,
      code: j?.error_code || j?.error,
    };
  }
  return {
    user: j.user || j,
    access_token: j.access_token || null,
    refresh_token: j.refresh_token || null,
    needsConfirm: !j.access_token,
  };
}

/** Validate access token and return user */
export async function getUserFromAccessToken(accessToken) {
  const { url, anon } = supabaseAuthConfig();
  if (!url || !anon || !accessToken) return null;
  const r = await fetch(`${url}/auth/v1/user`, {
    headers: authHeaders(anon, accessToken),
    cache: "no-store",
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return j || null;
}

export function sessionPayloadFromSupabaseUser(user, provider = "email") {
  const email = user?.email || "";
  const name =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    (email ? email.split("@")[0] : null) ||
    "User";
  const avatar =
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    null;
  return {
    id: `supabase:${user.id}`,
    username: String(name).slice(0, 64),
    global_name: String(name).slice(0, 64),
    avatar: typeof avatar === "string" && avatar.length < 200 ? avatar : null,
    banner: null,
    accent_color: null,
    provider: provider === "google" ? "google" : "email",
    supabase_id: user.id,
    email: email || null,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
}
