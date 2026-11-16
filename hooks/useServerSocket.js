"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { credentialPayload, hasCredentials, hashCredentials, loadSyncedHash, saveSyncedHash } from "@/lib/connectionConfig";

const MAX_BUFFER = 2000;
// Reconnect backoff. If the connection has never worked with this URL/token we give up after the last delay
// (the daemon rate-limits bad tokens); once it has worked we keep retrying forever (tunnel/phone hiccups).
const RETRY_DELAYS = [2000, 4000, 8000, 15000];
const KEEPALIVE_MS = 25000;
const CREDENTIALS_FILE = "bot-credentials.json";
const IDLE_SYNC = { state: "idle", error: null };

// Close codes that mean the daemon refused us on purpose. Retrying cannot fix these.
const FATAL_CLOSE = {
  4001: "Wrong Auth Token. Copy AUTH_TOKEN exactly from backend/.env (no quotes or spaces), then press Save & Connect.",
  4003: "Origin not allowed. In backend/.env set ALLOWED_ORIGINS to this site's exact origin (for example https://your-site.vercel.app) or leave it empty. \"*\" is not a wildcard.",
  4029: "Too many failed attempts from this network. Wait 10 minutes, then press Save & Connect.",
  1008: "The daemon rejected the connection (policy violation). Check the Auth Token and ALLOWED_ORIGINS in backend/.env.",
};

function describeClose(code, reason, authed) {
  const tail = `(close code ${code}${reason ? `, reason: "${reason}"` : ""})`;
  if (FATAL_CLOSE[code]) return `${FATAL_CLOSE[code]} ${tail}`;
  if (authed) return `Connection dropped (tunnel restarted or the phone went to sleep). Reconnecting... ${tail}`;
  if (code === 1006) {
    return `The WebSocket handshake failed. Likely causes: the tunnel URL is stale or cloudflared is down, the daemon is not running, or an older daemon refused the token/origin with an HTTP error (run git pull and pm2 restart bot-panel; ALLOWED_ORIGINS must be empty or an exact origin, \"*\" is not supported). ${tail}`;
  }
  return `The connection was closed before the daemon accepted it. ${tail}`;
}

/**
 * One WebSocket to the real bot daemon (backend/server.js), with a lifecycle that cannot loop:
 *
 *  - The connect effect depends ONLY on [wsUrl, nonce]. wsUrl contains the tunnel URL and the auth token;
 *    nonce is bumped by an explicit "Save & Connect" click. Credentials, callbacks and timers live in refs,
 *    so editing them or re-rendering never closes the socket. wsUrl === null disconnects.
 *  - There is at most one socket (socketRef) and one reconnect timer (retryRef). Events from a socket that is
 *    no longer socketRef.current are ignored.
 *  - Credentials (bot login + AI chat settings) are written to bot-credentials.json (files:write) and the bot is
 *    restarted (power:restart) from the socket's own handler, on the daemon's first message (its "token accepted"
 *    signal), or on demand through syncCredentials() when the user saves new settings on an open connection.
 *  - Every close is reported with its code and reason, in the status banner and in the console window.
 *
 * credentials: the whole saved config object (read through a ref, never a dependency).
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
  const syncNowRef = useRef(null);
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
    // console, status, stats, files:list, files:content, files:saved, startup:*, error ... all fan out here
    listeners.current.get(msg.type)?.forEach((cb) => cb(msg));
  }, []);

  const panelLine = useCallback((text) => {
    dispatch({ type: "console", data: `\x1b[33m[panel]\x1b[0m ${text}\r\n` });
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
  requestRef.current = request;

  /** Push the given credentials to the daemon now and restart the bot. Returns false when not connected. */
  const syncCredentials = useCallback((creds) => (syncNowRef.current ? syncNowRef.current(creds) : false), []);

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

    // Writes bot-credentials.json and restarts the bot. Runs from socket handlers, never from an effect.
    // Skipped when nothing changed since the last successful sync, unless forced.
    const runSync = async (ws, force, c) => {
      if (!c || !hasCredentials(c)) return setSync(IDLE_SYNC);
      const payload = credentialPayload(c);
      const hash = hashCredentials(payload);
      if (!force && loadSyncedHash() === hash) return setSync({ state: "synced", error: null });

      setSync({ state: "syncing", error: null });
      try {
        await requestRef.current(
          { type: "files:write", name: CREDENTIALS_FILE, content: JSON.stringify(payload, null, 2) },
          "files:saved",
          10000
        );
        if (socketRef.current !== ws || ws.readyState !== 1) throw new Error("Connection closed before the restart command");
        ws.send(JSON.stringify({ type: "power", action: "restart" }));
        saveSyncedHash(hash);
        setSync({ state: "synced", error: null });
        panelLine("Credentials synced to the phone, restarting the bot.");
      } catch (e) {
        if (socketRef.current === ws) setSync({ state: "error", error: e.message });
      }
    };

    syncNowRef.current = (creds) => {
      const ws = socketRef.current;
      if (!ws || !sender.current) return false;
      runSync(ws, true, creds);
      return true;
    };

    const connect = () => {
      if (stopped) return;
      retryRef.current = null;
      setConnection("connecting");

      let ws;
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        setConnection("closed");
        setGaveUp(true);
        setLastError(`The WebSocket URL is not valid: ${err.message}`);
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
          panelLine("Connected to the daemon.");
          sender.current({ type: "hello" });
          sender.current({ type: "files:list" });
          // Client-side keepalive so tunnels/proxies never see an idle socket.
          stopKeepalive();
          keepaliveRef.current = setInterval(() => {
            if (ws.readyState === 1) ws.send('{"type":"ping"}');
          }, KEEPALIVE_MS);
        }
        dispatch(msg);
        if (first) {
          const force = nonceRef.current !== handledNonce.current; // true right after "Save & Connect"
          handledNonce.current = nonceRef.current;
          runSync(ws, force, credsRef.current);
        }
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

        const message = describeClose(e.code, e.reason, authed);
        console.warn("[panel] WebSocket closed", { code: e.code, reason: e.reason, wasClean: e.wasClean });
        panelLine(`WebSocket closed: code ${e.code}${e.reason ? ` (${e.reason})` : ""}`);
        setLastError(message);

        if (FATAL_CLOSE[e.code]) {
          setGaveUp(true);
          return;
        }
        if (!everOpened && failures >= RETRY_DELAYS.length) {
          setGaveUp(true);
          return;
        }
        clearTimeout(retryRef.current); // never more than one pending reconnect
        retryRef.current = setTimeout(connect, RETRY_DELAYS[Math.min(failures++, RETRY_DELAYS.length - 1)]);
      };

      // The browser hides why it failed and always fires "close" right after; the close code is reported there.
      ws.onerror = () => {
        console.warn("[panel] WebSocket error event (the browser hides the cause; see the close code that follows)");
      };
    };
    connect();

    return () => {
      stopped = true;
      syncNowRef.current = null;
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
  }, [wsUrl, nonce, dispatch, panelLine]);

  return { status, connection, gaveUp, lastError, sync, stats, send, on, getBuffer, request, syncCredentials };
}
