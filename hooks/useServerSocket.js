"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hashCredentials, loadSyncedHash, saveSyncedHash } from "@/lib/connectionConfig";

const MAX_BUFFER = 2000;
// Reconnect backoff. If the connection has never worked with this URL/token we give up after the last delay
// (the daemon rate-limits bad tokens); once it has worked we keep retrying forever (tunnel/phone hiccups).
const RETRY_DELAYS = [2000, 4000, 8000, 15000];
const KEEPALIVE_MS = 25000;
const CREDENTIALS_FILE = "bot-credentials.json";
const IDLE_SYNC = { state: "idle", error: null };

// Close codes the daemon sends when it refuses a connection on purpose. Retrying cannot fix these.
const FATAL_CLOSE = {
  4001: "Wrong Auth Token. Copy AUTH_TOKEN exactly from backend/.env (no quotes or spaces), then press Save & Connect.",
  4003: "Origin not allowed. Add this site's URL to ALLOWED_ORIGINS in backend/.env, or leave it empty.",
  4029: "Too many failed attempts from this network. Wait 10 minutes, then press Save & Connect.",
};

/**
 * One WebSocket to the real bot daemon (backend/server.js), with a lifecycle that cannot loop:
 *
 *  - The connect effect depends ONLY on [wsUrl, nonce]. wsUrl contains the tunnel URL and the auth token;
 *    nonce is bumped by an explicit "Save & Connect" click. Bot credentials, callbacks and timers live in refs,
 *    so editing them or re-rendering never closes the socket.
 *  - There is at most one socket (socketRef) and one reconnect timer (retryRef). Events from a socket that is
 *    no longer socketRef.current are ignored.
 *  - The bot credentials are written (files:write) and the bot restarted (power:restart) from the socket's own
 *    message handler, on the daemon's first message. That message is the daemon's "token accepted" signal
 *    (refused clients are closed with 4001/4003/4029 instead), so it is the real "open and authorized" moment;
 *    onopen alone fires before the daemon has decided.
 *
 * connection: "unconfigured" | "connecting" | "open" | "closed"
 * sync.state: "idle" | "syncing" | "synced" | "error"
 */
export function useServerSocket({ wsUrl = null, nonce = 0, credentials = null } = {}) {
  const [status, setStatus] = useState("offline");
  const [connection, setConnection] = useState("unconfigured");
  const [gaveUp, setGaveUp] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [sync, setSync] = useState(IDLE_SYNC);
  const [stats, setStats] = useState({ cpu: 0, ram: 0, ramLimit: 512, uptime: 0 });

  const listeners = useRef(new Map());
  const buffer = useRef([]);
  const sender = useRef(null);
  const socketRef = useRef(null);
  const retryRef = useRef(null);
  const keepaliveRef = useRef(null);
  const credsRef = useRef(credentials);
  const nonceRef = useRef(nonce);
  const handledNonce = useRef(0);
  const requestRef = useRef(null);
  credsRef.current = credentials;
  nonceRef.current = nonce;

  const dispatch = useCallback((msg) => {
    if (msg.type === "status") setStatus(msg.state);
    if (msg.type === "stats") {
      setStats((s) => ({
        cpu: msg.cpu ?? s.cpu,
        ram: msg.ram ?? s.ram,
        ramLimit: msg.ramLimit ?? s.ramLimit,
        uptime: msg.uptime ?? s.uptime,
      }));
    }
    if (msg.type === "console") {
      buffer.current.push(msg.data);
      if (buffer.current.length > MAX_BUFFER) buffer.current.shift();
    }
    listeners.current.get(msg.type)?.forEach((cb) => cb(msg));
  }, []);

  const send = useCallback((msg) => {
    if (!sender.current) return false;
    sender.current(msg);
    return true;
  }, []);

  const on = useCallback((type, cb) => {
    const set = listeners.current.get(type) ?? new Set();
    set.add(cb);
    listeners.current.set(type, set);
    return () => set.delete(cb);
  }, []);

  const getBuffer = useCallback(() => buffer.current, []);

  /** Send a message and wait for the matching reply type (promise-based). */
  const request = useCallback(
    (msg, replyType, timeoutMs = 8000) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => { off(); reject(new Error("Request timed out")); }, timeoutMs);
        const off = on(replyType, (m) => {
          if (msg.name && m.name && m.name !== msg.name) return;
          clearTimeout(timer);
          off();
          m.error ? reject(new Error(m.error)) : resolve(m);
        });
        if (!send(msg)) {
          clearTimeout(timer);
          off();
          reject(new Error("Not connected to the daemon"));
        }
      }),
    [on, send]
  );
  requestRef.current = request;

  useEffect(() => {
    setGaveUp(false);
    setLastError(null);
    setSync(IDLE_SYNC);
    if (!wsUrl) {
      setConnection("unconfigured");
      setStatus("offline");
      return;
    }

    let stopped = false;
    let failures = 0;
    let everOpened = false;

    const stopKeepalive = () => {
      clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
    };

    // Writes bot-credentials.json and restarts the bot. Runs from the socket handler, never from an effect.
    // Skipped when the credentials are already synced, unless "Save & Connect" was just pressed.
    const runSync = async (ws) => {
      const c = credsRef.current;
      const force = nonceRef.current !== handledNonce.current;
      handledNonce.current = nonceRef.current;
      if (!c || !c.botToken || !c.clientId) return setSync(IDLE_SYNC);
      const hash = hashCredentials(c.botToken, c.clientId);
      if (!force && loadSyncedHash() === hash) return setSync({ state: "synced", error: null });

      setSync({ state: "syncing", error: null });
      try {
        await requestRef.current(
          {
            type: "files:write",
            name: CREDENTIALS_FILE,
            content: JSON.stringify({ botToken: c.botToken, clientId: c.clientId }, null, 2),
          },
          "files:saved",
          10000
        );
        if (socketRef.current !== ws || ws.readyState !== 1) throw new Error("Connection closed before the restart command");
        ws.send(JSON.stringify({ type: "power", action: "restart" }));
        saveSyncedHash(hash);
        setSync({ state: "synced", error: null });
      } catch (e) {
        if (socketRef.current === ws) setSync({ state: "error", error: e.message });
      }
    };

    const connect = () => {
      if (stopped) return;
      retryRef.current = null;
      setConnection("connecting");

      let ws;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        setConnection("closed");
        setGaveUp(true);
        setLastError("The tunnel URL is not valid.");
        return;
      }
      socketRef.current = ws;
      let authed = false;

      ws.onmessage = (e) => {
        if (socketRef.current !== ws) return; // stale socket
        let msg;
        try { msg = JSON.parse(e.data); } catch { msg = { type: "console", data: String(e.data) }; }

        const first = !authed;
        if (first) {
          authed = true;
          everOpened = true;
          failures = 0;
          buffer.current = []; // the daemon replays its console history on hello
          sender.current = (m) => ws.send(JSON.stringify(m));
          setLastError(null);
          setConnection("open");
          sender.current({ type: "hello" });
          // Client-side keepalive so tunnels/proxies never see an idle socket.
          stopKeepalive();
          keepaliveRef.current = setInterval(() => {
            if (ws.readyState === 1) ws.send('{"type":"ping"}');
          }, KEEPALIVE_MS);
        }
        dispatch(msg);
        if (first) runSync(ws);
      };

      ws.onclose = (e) => {
        if (socketRef.current !== ws) return; // stale socket
        socketRef.current = null;
        sender.current = null;
        stopKeepalive();
        setStatus("offline");
        setConnection("closed");
        setSync(IDLE_SYNC);
        if (stopped) return;

        if (FATAL_CLOSE[e.code]) {
          setLastError(FATAL_CLOSE[e.code]);
          setGaveUp(true);
          return;
        }
        setLastError(
          authed
            ? "Connection dropped (tunnel restarted or the phone went to sleep). Reconnecting..."
            : "Could not reach the daemon through the tunnel. Check that cloudflared and PM2 are running and that the tunnel URL is current."
        );
        if (!everOpened && failures >= RETRY_DELAYS.length) {
          setGaveUp(true);
          return;
        }
        clearTimeout(retryRef.current); // never more than one pending reconnect
        retryRef.current = setTimeout(connect, RETRY_DELAYS[Math.min(failures++, RETRY_DELAYS.length - 1)]);
      };

      // The browser always fires "close" after "error"; reconnect handling lives there.
      ws.onerror = () => {};
    };
    connect();

    return () => {
      stopped = true;
      clearTimeout(retryRef.current);
      retryRef.current = null;
      stopKeepalive();
      const ws = socketRef.current;
      socketRef.current = null;
      sender.current = null;
      if (ws) {
        ws.onmessage = ws.onclose = ws.onerror = null;
        try { ws.close(); } catch {}
      }
    };
  }, [wsUrl, nonce, dispatch]);

  return { status, connection, gaveUp, lastError, sync, stats, send, on, getBuffer, request };
}
