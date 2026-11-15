"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_BUFFER = 2000;
// Reconnect backoff. If the connection has never worked with this URL/token we give up after the last delay
// (the daemon rate-limits bad tokens); once it has worked we keep retrying forever (tunnel/phone hiccups).
const RETRY_DELAYS = [2000, 4000, 8000, 15000];
const KEEPALIVE_MS = 25000;

// Close codes the daemon sends when it refuses a connection on purpose. Retrying cannot fix these.
const FATAL_CLOSE = {
  4001: "Wrong Auth Token. Copy AUTH_TOKEN exactly from backend/.env (no quotes or spaces), then press Save & Connect.",
  4003: "Origin not allowed. Add this site's URL to ALLOWED_ORIGINS in backend/.env, or leave it empty.",
  4029: "Too many failed attempts from this network. Wait 10 minutes, then press Save & Connect.",
};

/**
 * Single WebSocket connection to the real bot daemon (backend/server.js).
 * wsUrl is the full URL including ?token=. Changing wsUrl or nonce (re)connects.
 * connection: "unconfigured" | "connecting" | "open" | "closed"
 * The connection only counts as "open" once the daemon accepted the token (its first message arrives).
 */
export function useServerSocket({ wsUrl = null, nonce = 0 } = {}) {
  const [status, setStatus] = useState("offline");
  const [connection, setConnection] = useState("unconfigured");
  const [gaveUp, setGaveUp] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [openCount, setOpenCount] = useState(0);
  const [stats, setStats] = useState({ cpu: 0, ram: 0, ramLimit: 512, uptime: 0 });
  const listeners = useRef(new Map());
  const buffer = useRef([]);
  const sender = useRef(null);

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

  useEffect(() => {
    setGaveUp(false);
    setLastError(null);
    if (!wsUrl) {
      setConnection("unconfigured");
      setStatus("offline");
      return;
    }

    let socket, retry, keepalive, closed = false, failures = 0, everOpened = false;

    const connect = () => {
      setConnection("connecting");
      let authed = false;
      try {
        socket = new WebSocket(wsUrl);
      } catch {
        setConnection("closed");
        setGaveUp(true);
        setLastError("The tunnel URL is not valid.");
        return;
      }
      const ws = socket;

      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { msg = { type: "console", data: String(e.data) }; }
        if (!authed) {
          // The daemon sends its status as the first message once the token was accepted.
          authed = true;
          everOpened = true;
          failures = 0;
          buffer.current = []; // the daemon replays its console history on hello
          sender.current = (m) => ws.send(JSON.stringify(m));
          setLastError(null);
          setConnection("open");
          setOpenCount((n) => n + 1);
          sender.current({ type: "hello" });
          // Client-side keepalive so tunnels/proxies never see an idle socket.
          keepalive = setInterval(() => { if (ws.readyState === 1) ws.send('{"type":"ping"}'); }, KEEPALIVE_MS);
        }
        dispatch(msg);
      };

      ws.onclose = (e) => {
        clearInterval(keepalive);
        if (closed) return;
        sender.current = null;
        setStatus("offline");
        setConnection("closed");
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
        retry = setTimeout(connect, RETRY_DELAYS[Math.min(failures++, RETRY_DELAYS.length - 1)]);
      };

      ws.onerror = () => ws.close();
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(keepalive);
      sender.current = null;
      if (socket) { socket.onmessage = null; socket.close(); }
    };
  }, [dispatch, wsUrl, nonce]);

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

  return { status, connection, gaveUp, lastError, openCount, stats, send, on, getBuffer, request };
}
