"use client";

import { useEffect, useState } from "react";

export default function SupabaseCallbackPage() {
  const [status, setStatus] = useState("Finishing sign-in…");

  useEffect(() => {
    async function run() {
      try {
        const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
        const search = typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : "";
        const fromHash = new URLSearchParams(hash);
        const fromQuery = new URLSearchParams(search);

        const accessToken =
          fromHash.get("access_token") ||
          fromQuery.get("access_token") ||
          "";
        const error =
          fromHash.get("error_description") ||
          fromHash.get("error") ||
          fromQuery.get("error_description") ||
          fromQuery.get("error");

        if (error) {
          setStatus("Sign-in failed.");
          window.location.replace(`/?auth_error=${encodeURIComponent("access_denied")}`);
          return;
        }

        if (!accessToken) {
          const code = fromQuery.get("code");
          if (code) {
            setStatus("OAuth code flow needs client config.");
            window.location.replace(`/?auth_error=${encodeURIComponent("token_exchange")}`);
            return;
          }
          setStatus("Missing token.");
          window.location.replace(`/?auth_error=${encodeURIComponent("missing_code")}`);
          return;
        }

        const r = await fetch("/api/auth/supabase-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ access_token: accessToken }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) {
          window.location.replace(`/?auth_error=${encodeURIComponent(j.error || "server")}`);
          return;
        }
        window.location.replace("/");
      } catch {
        window.location.replace(`/?auth_error=${encodeURIComponent("server")}`);
      }
    }
    run();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#05070a] p-4 text-sm text-zinc-400">
      {status}
    </div>
  );
}
