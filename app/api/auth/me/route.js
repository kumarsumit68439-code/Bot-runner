import { NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    user: {
      id: session.id,
      username: session.username,
      global_name: session.global_name,
      avatar: session.avatar,
      isAdmin: isAdmin(session.id),
    },
  });
}
