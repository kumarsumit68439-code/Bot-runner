import { NextResponse } from "next/server";
import { appBaseUrl, clearCookieOptions } from "@/lib/session";

export async function GET(req) {
  const base = appBaseUrl(req);
  const res = NextResponse.redirect(`${base}/`);
  res.cookies.set(clearCookieOptions());
  return res;
}

export async function POST(req) {
  return GET(req);
}
