"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_BUFFER = 2000;
// Backoff between reconnect attempts. After the last one we stop: the daemon rate-limits repeated bad tokens.
const RETRY_DELAYS = [2000, 4000, 8000, 15000];

/**
 * Single WebSocket connection to the real bot daemon (backend/server.js).
 * wsUrl is the full URL including ?token=. Changing wsUrl or nonce (re)connects.
 * connection: "unconfigured" | "connecting" | "open" | "closed"
 * There is no mock/demo fallback.
 */
export function useServerSocket({ wsUrl = null, nonce = 0 } = {}) {
  const [status, setStatus] = useState("offline");
  const [connection, setConnection] = useState("unconfigured");
  const [gaveUp, setGaveUp] = useState(false);
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
    if (!wsUrl) {
      setConnection("unconfigured");
      setStatus("offline");
      return;
    }

    let ws, retry, closed = false, failures = 0;
    const connect = () => {
      setConnection("connecting");
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        setConnection("closed");
        setGaveUp(true);
        return;
      }
      ws.onopen = () => {
        failures = 0;
        buffer.current = []; // the daemon replays its console history on hello
        sender.current = (m) => ws.send(JSON.stringify(m));
        setConnection("open");
        setOpenCount((n) => n + 1);
        sender.current({ type: "hello" });
      };
      ws.onmessage = (e) => {
        try { dispatch(JSON.parse(e.data)); }
        catch { dispatch({ type: "console", data: String(e.data) }); }
      };
      ws.onclose = () => {
        if (closed) return;
        sender.current = null;
        setStatus("offline");
        setConnection("closed");
        if (failures >= RETRY_DELAYS.length) { setGaveUp(true); return; }
        retry = setTimeout(connect, RETRY_DELAYS[failures++]);
      };
      ws.onerror = () => ws.close();
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      sender.current = null;
      if (ws) { ws.onmessage = null; ws.close(); }
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

  return { status, connection, gaveUp, openCount, stats, send, on, getBuffer, request };
}
