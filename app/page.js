"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import ConnectionSetup from "@/components/ConnectionSetup";
import ConsoleTab from "@/components/ConsoleTab";
import FileManagerTab from "@/components/FileManagerTab";
import StartupTab from "@/components/StartupTab";
import AiSettings from "@/components/AiSettings";
import { useServerSocket } from "@/hooks/useServerSocket";
import { EMPTY_CONFIG, buildWsUrl, clearConfig, loadConfig, resolveConnection, saveConfig } from "@/lib/connectionConfig";

// Optional build-time fallback. Values saved in the browser always win.
const ENV_WS_URL = process.env.NEXT_PUBLIC_WS_URL || null;

export default function Page() {
  const [tab, setTab] = useState("console");
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(true); // false after the Disconnect button; true again on Save & Connect
  const [nonce, setNonce] = useState(0); // bumped only by an explicit "Save & Connect" (or an accepted magic link): reconnect + forced credential sync

  useEffect(() => {
    let cfg = loadConfig();
    let linked = false;
    try {
      // Magic link from the setup script: https://<panel>/#tunnel=<url>&token=<token>
      // The fragment never leaves the browser (it is not sent to Vercel).
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const t = params.get("tunnel");
      const tok = params.get("token");
      if (t || tok) {
        // Remove the secret from the address bar and history right away.
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        const r = resolveConnection(t || cfg.tunnelUrl, tok || cfg.authToken);
        // Confirm first: a link from someone else would make this panel send your bot credentials to their server.
        if (r.status === "ready" && window.confirm(`Connect this panel to the daemon at ${r.base}?\n\nOnly continue if you generated this link on your own phone.`)) {
          cfg = { ...cfg, tunnelUrl: r.base, authToken: r.token };
          saveConfig(cfg);
          linked = true;
        }
      }
    } catch {}
    setConfig(cfg);
    setLoaded(true);
    if (linked) setNonce((n) => n + 1);
  }, []);

  // The final WebSocket URL: sanitized tunnel host + ?token=<auth token>. Changing the bot or AI credentials
  // does not change it, so it can never tear the socket down. null = stay disconnected.
  const wsUrl = useMemo(() => {
    if (!loaded || !enabled) return null;
    return buildWsUrl(config.tunnelUrl, config.authToken) ?? ENV_WS_URL;
  }, [loaded, enabled, config.tunnelUrl, config.authToken]);

  // The whole saved config goes in by reference; the hook reads the credentials from a ref.
  const server = useServerSocket({ wsUrl, nonce, credentials: config });

  // Save & Connect (connection card): merge so the AI settings are kept.
  const save = (cfg) => {
    const next = { ...config, ...cfg };
    saveConfig(next);
    setConfig(next);
    setEnabled(true);
    setNonce((n) => n + 1);
  };
  // Save & Sync (AI card): store, then push to the phone right away on the open connection (no reconnect).
  // When not connected, the hash differs, so it syncs by itself on the next connection.
  const saveAi = (ai) => {
    const next = { ...config, ...ai };
    saveConfig(next);
    setConfig(next);
    server.syncCredentials(next);
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
        {tab === "startup" && (
          <div className="space-y-8">
            <StartupTab server={server} />
            {loaded && <AiSettings saved={config} connection={server.connection} sync={server.sync} onSave={saveAi} />}
          </div>
        )}
      </main>
    </div>
  );
}
