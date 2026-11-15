"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import ConnectionSetup from "@/components/ConnectionSetup";
import ConsoleTab from "@/components/ConsoleTab";
import FileManagerTab from "@/components/FileManagerTab";
import StartupTab from "@/components/StartupTab";
import { useServerSocket } from "@/hooks/useServerSocket";
import { EMPTY_CONFIG, buildWsUrl, clearConfig, loadConfig, saveConfig } from "@/lib/connectionConfig";

// Optional build-time fallback. Values saved in the browser always win.
const ENV_WS_URL = process.env.NEXT_PUBLIC_WS_URL || null;

export default function Page() {
  const [tab, setTab] = useState("console");
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(true); // false after the Disconnect button; true again on Save & Connect
  const [nonce, setNonce] = useState(0); // bumped only by an explicit "Save & Connect": reconnect + forced credential sync

  useEffect(() => {
    setConfig(loadConfig());
    setLoaded(true);
  }, []);

  // The final WebSocket URL: sanitized tunnel host + ?token=<auth token>. Changing the bot token or client ID
  // does not change it, so it can never tear the socket down. null = stay disconnected.
  const wsUrl = useMemo(() => {
    if (!loaded || !enabled) return null;
    return buildWsUrl(config.tunnelUrl, config.authToken) ?? ENV_WS_URL;
  }, [loaded, enabled, config.tunnelUrl, config.authToken]);

  // Bot credentials go in by reference; the hook reads them from a ref when the socket is accepted.
  const server = useServerSocket({
    wsUrl,
    nonce,
    credentials: { botToken: config.botToken, clientId: config.clientId },
  });

  const save = (cfg) => {
    saveConfig(cfg);
    setConfig(cfg);
    setEnabled(true);
    setNonce((n) => n + 1);
  };
  const disconnect = () => setEnabled(false); // wsUrl becomes null: the hook closes the socket and clears its timers
  const clear = () => {
    clearConfig();
    setConfig(EMPTY_CONFIG);
    setEnabled(true);
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar tab={tab} onChange={setTab} connection={server.connection} />
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {loaded && (
          <ConnectionSetup
            saved={config}
            connection={server.connection}
            sync={server.sync}
            gaveUp={server.gaveUp}
            enabled={enabled}
            onSave={save}
            onDisconnect={disconnect}
            onClear={clear}
          />
        )}
        {loaded && enabled && server.connection === "closed" && server.lastError && (
          <p className="-mt-3 mb-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {server.lastError}
          </p>
        )}
        {tab === "console" && <ConsoleTab server={server} />}
        {tab === "files" && <FileManagerTab server={server} />}
        {tab === "startup" && <StartupTab server={server} />}
      </main>
    </div>
  );
}
