"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Cpu, HardDrive, MemoryStick, Send, CircuitBoard } from "lucide-react";
import StatusBadge from "./StatusBadge";
import PowerControls from "./PowerControls";
import StatCard from "./StatCard";
import Terminal from "./Terminal";

function formatUptime(total) {
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`, `${s}s`].filter(Boolean).join(" ");
}

const BANNERS = {
  unconfigured: 'Not connected yet. Open "Connection & Bot Setup" above, enter your tunnel URL and Auth Token, then press Save & Connect.',
  connecting: "Connecting to the daemon...",
  closed: 'Cannot reach the daemon. Check that PM2 and the Cloudflare tunnel are running and that the URL and token in "Connection & Bot Setup" are current.',
};

const RESOURCE_DEFAULTS = {
  storageLimit: "512 GB",
  ramAllocation: "512 MB",
  cpuCores: "1 vCPU",
  gpuAccel: "None (CPU Only)",
};

export default function ConsoleTab({ server }) {
  const { status, connection, stats, send, on, getBuffer } = server;
  const [cmd, setCmd] = useState("");
  const [pending, setPending] = useState(false);
  const [resources, setResources] = useState(RESOURCE_DEFAULTS);
  const history = useRef([]);
  const cursor = useRef(-1);
  const loadedRes = useRef(false);
  const serverRef = useRef(server);
  serverRef.current = server;

  const live = connection === "open";
  const canType = live && status === "online";

  const loadResources = useCallback(async () => {
    const s = serverRef.current;
    if (!s?.request) return;
    try {
      const r = await s.request({ type: "startup:get" }, "startup:settings", 8000);
      const st = r.settings || {};
      setResources({
        storageLimit: st.storageLimit || RESOURCE_DEFAULTS.storageLimit,
        ramAllocation: st.ramAllocation || RESOURCE_DEFAULTS.ramAllocation,
        cpuCores: st.cpuCores || RESOURCE_DEFAULTS.cpuCores,
        gpuAccel: st.gpuAccel || RESOURCE_DEFAULTS.gpuAccel,
      });
    } catch {
      /* keep defaults */
    }
  }, []);

  useEffect(() => {
    if (connection !== "open") {
      loadedRes.current = false;
      return;
    }
    if (loadedRes.current) return;
    loadedRes.current = true;
    loadResources();
  }, [connection, loadResources]);

  useEffect(() => {
    setPending(false);
  }, [status]);
  const power = (action) => {
    if (!send({ type: "power", action })) return;
    setPending(true);
    setTimeout(() => setPending(false), 8000);
  };

  const submit = (e) => {
    e.preventDefault();
    const value = cmd.trim();
    if (!value || !canType) return;
    send({ type: "command", data: value });
    history.current.unshift(value);
    cursor.current = -1;
    setCmd("");
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      cursor.current = Math.min(cursor.current + 1, history.current.length - 1);
      setCmd(history.current[cursor.current] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      cursor.current = Math.max(cursor.current - 1, -1);
      setCmd(cursor.current < 0 ? "" : history.current[cursor.current]);
    }
  };

  const ramPct = stats.ramLimit ? (stats.ram / stats.ramLimit) * 100 : 0;
  const gpuActive = resources.gpuAccel && !/^none/i.test(resources.gpuAccel);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-white">Console</h1>
          <StatusBadge status={status} />
        </div>
        <PowerControls status={status} disabled={!live || pending} onAction={power} />
      </div>

      {!live && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {BANNERS[connection] ?? BANNERS.closed}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard icon={Cpu} label="CPU" value={`${stats.cpu.toFixed(1)}%`} sub={resources.cpuCores} percent={stats.cpu} />
        <StatCard
          icon={MemoryStick}
          label="Memory"
          value={`${stats.ram} MB`}
          sub={`of ${stats.ramLimit} MB · plan ${resources.ramAllocation}`}
          percent={ramPct}
        />
        <StatCard icon={HardDrive} label="Storage" value={resources.storageLimit} sub="Plan limit" percent={12} />
        <StatCard
          icon={CircuitBoard}
          label="GPU"
          value={gpuActive ? "Ready" : "CPU only"}
          sub={resources.gpuAccel}
          percent={gpuActive ? 40 : 0}
        />
        <StatCard icon={Clock} label="Uptime" value={status === "online" ? formatUptime(stats.uptime) : "-"} />
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-[#07090d]">
        <div className="h-[420px]">
          <Terminal getBuffer={getBuffer} on={on} />
        </div>
        <form onSubmit={submit} className="flex items-center gap-2 border-t border-line bg-panel px-3 py-2">
          <span className="font-mono text-sm text-brand">$</span>
          <input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!canType}
            spellCheck={false}
            autoComplete="off"
            placeholder={canType ? "Type a command and press Enter" : "Bot must be online to send commands"}
            className="flex-1 bg-transparent py-1.5 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!canType || !cmd.trim()}
            className="rounded-md bg-brand p-2 text-white transition hover:bg-brand/80 disabled:opacity-40"
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>
  );
}
