import { NextResponse } from "next/server";

/** Public site key only — secret never leaves the server. */
export async function GET() {
  const siteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
    process.env.TURNSTILE_SITE_KEY ||
    "";
  const secretSet = Boolean(process.env.TURNSTILE_SECRET_KEY);

  return NextResponse.json({
    siteKey,
    configured: Boolean(siteKey && secretSet),
    // hints for the panel owner only (no secrets)
    missing: {
      siteKey: !siteKey,
      secretKey: !secretSet,
    },
  });
}
