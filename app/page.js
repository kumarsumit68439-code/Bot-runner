"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import ConnectionSetup from "@/components/ConnectionSetup";
import ConsoleTab from "@/components/ConsoleTab";
import FileManagerTab from "@/components/FileManagerTab";
import StartupTab from "@/components/StartupTab";
import AiSettings from "@/components/AiSettings";
import BotModulesTab from "@/components/BotModulesTab";
import EnvTab from "@/components/EnvTab";
import AdminPanel from "@/components/AdminPanel";
import AccountTab from "@/components/AccountTab";
import LoginPage from "@/components/LoginPage";
import { useServerSocket } from "@/hooks/useServerSocket";
import { EMPTY_CONFIG, buildWsUrl, clearConfig, loadConfig, resolveConnection, saveConfig } from "@/lib/connectionConfig";

const ENV_WS_URL = process.env.NEXT_PUBLIC_WS_URL || null;
const ADMIN_USER_ID = "1487343086198853785";

export default function Page() {
  const [tab, setTab] = useState("console");
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [auth, setAuth] = useState({ loading: true, user: null, error: null });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (authError) {
      window.history.replaceState(null, "", window.location.pathname);
      setAuth({ loading: false, user: null, error: authError });
      return;
    }
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error("unauth");
        return r.json();
      })
      .then((j) => setAuth({ loading: false, user: j.user, error: null }))
      .catch(() => setAuth({ loading: false, user: null, error: null }));
  }, []);

  useEffect(() => {
    if (!auth.user) return;
    let cfg = loadConfig();
    let linked = false;
    try {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const t = params.get("tunnel");
      const tok = params.get("token");
      if (t || tok) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        const r = resolveConnection(t || cfg.tunnelUrl, tok || cfg.authToken);
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
  }, [auth.user]);

  // Kick non-owner away from Admin tab
  useEffect(() => {
    if (tab === "admin" && auth.user && String(auth.user.id) !== ADMIN_USER_ID) {
      setTab("console");
    }
  }, [tab, auth.user]);

  const wsUrl = useMemo(() => {
    if (!loaded || !enabled || !auth.user) return null;
    return buildWsUrl(config.tunnelUrl, config.authToken) ?? ENV_WS_URL;
  }, [loaded, enabled, config.tunnelUrl, config.authToken, auth.user]);

  const server = useServerSocket({ wsUrl, nonce, credentials: config });

  const save = (cfg) => {
    const next = { ...config, ...cfg };
    saveConfig(next);
    setConfig(next);
    setEnabled(true);
    setNonce((n) => n + 1);
  };
  const saveAi = (ai) => {
    const next = { ...config, ...ai };
    saveConfig(next);
    setConfig(next);
    server.syncCredentials(next);
  };
  const disconnect = () => setEnabled(false);
  const clear = () => {
    clearConfig();
    setConfig(EMPTY_CONFIG);
    setEnabled(true);
  };

  if (auth.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#05070a] text-sm text-zinc-400">
        Checking login...
      </div>
    );
  }

  if (!auth.user) {
    return <LoginPage error={auth.error} />;
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar tab={tab} onChange={setTab} connection={server.connection} user={auth.user} />
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {loaded && tab !== "admin" && (
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
        {loaded && enabled && server.connection === "closed" && server.lastError && tab !== "admin" && (
          <p className="-mt-3 mb-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {server.lastError}
          </p>
        )}
        {tab === "console" && <ConsoleTab server={server} />}
        {tab === "files" && <FileManagerTab server={server} />}
        {tab === "modules" && loaded && (
          <BotModulesTab
            saved={config}
            connection={server.connection}
            sync={server.sync}
            onSaveAi={saveAi}
            server={server}
          />
        )}
        {tab === "env" && <EnvTab server={server} />}
        {tab === "startup" && (
          <div className="space-y-8">
            <StartupTab server={server} />
            {loaded && <AiSettings saved={config} connection={server.connection} sync={server.sync} onSave={saveAi} />}
          </div>
        )}
        {tab === "account" && loaded && <AccountTab user={auth.user} config={config} />}
        {tab === "admin" && loaded && String(auth.user?.id) === ADMIN_USER_ID && (
          <AdminPanel saved={config} onSave={save} user={auth.user} />
        )}
      </main>
    </div>
  );
}
