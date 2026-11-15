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
  const [nonce, setNonce] = useState(0); // bumped only by an explicit "Save & Connect": reconnect + forced credential sync

  useEffect(() => {
    setConfig(loadConfig());
    setLoaded(true);
  }, []);

  // Only the tunnel URL and the auth token form the connection URL. Changing the bot token or client ID
  // does not change wsUrl, so it can never tear the socket down.
  const wsUrl = useMemo(
    () => (loaded ? buildWsUrl(config.tunnelUrl, config.authToken) ?? ENV_WS_URL : null),
    [loaded, config.tunnelUrl, config.authToken]
  );

  // Bot credentials go in by reference; the hook reads them from a ref when the socket opens.
  const server = useServerSocket({
    wsUrl,
    nonce,
    credentials: { botToken: config.botToken, clientId: config.clientId },
  });

  const save = (cfg) => {
    saveConfig(cfg);
    setConfig(cfg);
    setNonce((n) => n + 1);
  };
  const clear = () => {
    clearConfig();
    setConfig(EMPTY_CONFIG); // wsUrl becomes null -> the hook disconnects and clears its timers
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
            onSave={save}
            onClear={clear}
          />
        )}
        {loaded && server.connection === "closed" && server.lastError && (
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
