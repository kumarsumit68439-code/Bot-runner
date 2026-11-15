"use client";

import { useEffect, useRef, useState } from "react";
import { hashCredentials, loadSyncedHash, saveSyncedHash } from "@/lib/connectionConfig";

const CREDENTIALS_FILE = "bot-credentials.json";

/**
 * After each new daemon connection, writes bot-credentials.json on the daemon and restarts the bot.
 * To avoid bouncing the bot on every page load, it only syncs when the credentials changed since the
 * last successful sync, or when the user pressed "Save & Connect" (nonce changed).
 */
export function useCredentialSync(server, config, nonce) {
  const [sync, setSync] = useState({ state: "idle", error: null });
  const latest = useRef({ config, nonce });
  latest.current = { config, nonce };
  const handled = useRef(0);
  const { openCount, request, send } = server;

  useEffect(() => {
    if (!openCount) return;
    const { config: c, nonce: n } = latest.current;
    const force = n !== handled.current;
    handled.current = n;

    if (!c.botToken || !c.clientId) {
      setSync({ state: "idle", error: null });
      return;
    }
    const hash = hashCredentials(c.botToken, c.clientId);
    if (!force && loadSyncedHash() === hash) {
      setSync({ state: "synced", error: null });
      return;
    }

    setSync({ state: "syncing", error: null });
    (async () => {
      try {
        await request(
          {
            type: "files:write",
            name: CREDENTIALS_FILE,
            content: JSON.stringify({ botToken: c.botToken, clientId: c.clientId }, null, 2),
          },
          "files:saved",
          10000
        );
        if (!send({ type: "power", action: "restart" })) throw new Error("Connection lost before the restart command");
        saveSyncedHash(hash);
        setSync({ state: "synced", error: null });
      } catch (e) {
        setSync({ state: "error", error: e.message });
      }
    })();
  }, [openCount, request, send]);

  return sync;
}
