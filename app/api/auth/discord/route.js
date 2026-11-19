import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/session";

export async function GET(req) {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Set NEXT_PUBLIC_DISCORD_CLIENT_ID (or DISCORD_CLIENT_ID) in Vercel env." },
      { status: 500 }
    );
  }
  const base = appBaseUrl(req);
  const redirectUri = `${base}/api/auth/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "identify",
    redirect_uri: redirectUri,
    prompt: "none",
  });
  const force = new URL(req.url).searchParams.get("force");
  if (force === "1") params.set("prompt", "consent");

  return NextResponse.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
}
