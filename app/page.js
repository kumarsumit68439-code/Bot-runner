"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import ConnectionSetup from "@/components/ConnectionSetup";
import ConsoleTab from "@/components/ConsoleTab";
import FileManagerTab from "@/components/FileManagerTab";
import StartupTab from "@/components/StartupTab";
import { useServerSocket } from "@/hooks/useServerSocket";
import { useCredentialSync } from "@/hooks/useCredentialSync";
import { EMPTY_CONFIG, buildWsUrl, clearConfig, loadConfig, saveConfig } from "@/lib/connectionConfig";

// Optional build-time fallback. Values saved in the browser always win.
const ENV_WS_URL = process.env.NEXT_PUBLIC_WS_URL || null;

export default function Page() {
  const [tab, setTab] = useState("console");
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [nonce, setNonce] = useState(0); // bumped by "Save & Connect": forces reconnect + credential sync

  useEffect(() => {
    setConfig(loadConfig());
    setLoaded(true);
  }, []);

  const wsUrl = useMemo(
    () => (loaded ? buildWsUrl(config.tunnelUrl, config.authToken) ?? ENV_WS_URL : null),
    [loaded, config.tunnelUrl, config.authToken]
  );

  const server = useServerSocket({ wsUrl, nonce }); // lives here so the terminal buffer survives tab switches
  const sync = useCredentialSync(server, config, nonce);

  const save = (cfg) => {
    saveConfig(cfg);
    setConfig(cfg);
    setNonce((n) => n + 1);
  };
  const clear = () => {
    clearConfig();
    setConfig(EMPTY_CONFIG);
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar tab={tab} onChange={setTab} connection={server.connection} />
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {loaded && (
          <ConnectionSetup
            saved={config}
            connection={server.connection}
            sync={sync}
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
