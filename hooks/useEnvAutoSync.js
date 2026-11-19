"use client";

import { useEffect, useRef } from "react";
import { getAppliedHash, hashEnvItems, parseEnv, serializeEnv, setAppliedHash } from "@/lib/envFile";

/**
 * Supabase is the source of truth for the bot's environment variables.
 * Whenever the daemon connects (for example after a Railway redeploy wiped bot/.env), this writes the saved
 * variables back into the daemon's .env and restarts the bot, so the token never has to be typed again.
 *
 * It only writes when something is actually missing from the daemon, or when the saved variables changed since
 * this browser last pushed them. Variables that exist only on the daemon are kept.
 */
export function useEnvAutoSync(server, enabled) {
  const serverRef = useRef(server);
  serverRef.current = server;
  const done = useRef(false);
  const open = server.connection === "open";

  useEffect(() => {
    if (!open) {
      done.current = false;
      return;
    }
    if (!enabled || done.current) return;
    done.current = true;

    (async () => {
      try {
        const r = await fetch("/api/secrets?all=1", { credentials: "include", cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        const items = (j.items || []).filter((i) => i.key && !i.unreadable);
        if (!j.configured || !items.length) return;

        const s = serverRef.current;
        if (!s?.request) return;

        let current = "";
        try {
          const res = await s.request({ type: "files:read", name: ".env" }, "files:content", 8000);
          current = typeof res.content === "string" ? res.content : "";
        } catch {
          /* no .env on the daemon yet */
        }

        const rows = parseEnv(current);
        const have = new Map(rows.map((row) => [row.key, row.value]));
        const hash = hashEnvItems(items);
        const changed = hash !== getAppliedHash();
        const toWrite = items.filter((i) => !have.has(i.key) || (changed && have.get(i.key) !== i.value));
        if (!toWrite.length) {
          setAppliedHash(hash);
          return;
        }

        const byKey = new Map(toWrite.map((i) => [i.key, i.value]));
        const merged = rows.map((row) => (byKey.has(row.key) ? { ...row, value: byKey.get(row.key) } : row));
        for (const i of toWrite) {
          if (!have.has(i.key)) merged.push({ key: i.key, value: i.value });
        }

        await s.request({ type: "files:write", name: ".env", content: serializeEnv(merged) }, "files:saved", 12000);
        s.send({ type: "power:restart" });
        setAppliedHash(hash);
      } catch {
        /* best effort: the Environment tab still works manually */
      }
    })();
  }, [open, enabled]);
}
