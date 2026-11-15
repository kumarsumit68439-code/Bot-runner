"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL;
const MAX_BUFFER = 2000;

/**
 * Single WebSocket connection to the real bot daemon (backend/server.js).
 * connection: "unconfigured" | "connecting" | "open" | "closed"
 * There is no mock/demo fallback: without NEXT_PUBLIC_WS_URL nothing is simulated.
 */
export function useServerSocket() {
  const [status, setStatus] = useState("offline");
  const [connection, setConnection] = useState(WS_URL ? "connecting" : "unconfigured");
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
    if (!WS_URL) { setConnection("unconfigured"); return; }

    let ws, retry, closed = false;
    const connect = () => {
      setConnection("connecting");
      ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        buffer.current = []; // the daemon replays its console history on hello
        setConnection("open");
        sender.current = (m) => ws.send(JSON.stringify(m));
        sender.current({ type: "hello" });
      };
      ws.onmessage = (e) => {
        try { dispatch(JSON.parse(e.data)); }
        catch { dispatch({ type: "console", data: String(e.data) }); }
      };
      ws.onclose = () => {
        sender.current = null;
        setConnection("closed");
        setStatus("offline");
        if (!closed) retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { closed = true; clearTimeout(retry); ws?.close(); };
  }, [dispatch]);

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

  return { status, connection, stats, send, on, getBuffer, request };
}
