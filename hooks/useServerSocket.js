"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { credentialPayload, hasCredentials, hashCredentials, loadSyncedHash, saveSyncedHash } from "@/lib/connectionConfig";

const CREDENTIALS_FILE = "bot-credentials.json";

// Cap consecutive failures before we stop auto-retrying
// (the daemon rate-limits bad tokens); once it has worked we keep retrying forever (tunnel/phone hiccups).
const MAX_FAILS_BEFORE_GIVE_UP = 8;
const BASE_RETRY_MS = 1500;
const MAX_RETRY_MS = 15000;

// Close codes that mean the daemon refused us on purpose. Retrying cannot fix these.
const FATAL_CODES = new Set([4001, 4003, 1008]);

const CLOSE_HINTS = {
  4001: "Wrong Auth Token. Copy AUTH_TOKEN exactly from backend/.env (no quotes or spaces), then press Save & Connect.",
  4003: "Origin not allowed. In backend/.env set ALLOWED_ORIGINS to this site's exact origin (for example https://your-site.vercel.app) or leave it empty. \"*\" is not a wildcard.",
  1008: "The daemon rejected the connection (policy violation). Check the Auth Token and ALLOWED_ORIGINS in backend/.env.",
};

function handshakeHint(wasOpen, closeCode) {
  const tail = "Confirm the tunnel/Railway URL in Admin and that the backend is running.";
  if (!wasOpen) {
    return `The WebSocket handshake failed. Likely causes: the tunnel URL is stale or cloudflared is down, the daemon is not running, or an older daemon refused the token/origin with an HTTP error (run git pull and pm2 restart bot-panel; ALLOWED_ORIGINS must be empty or an exact origin, \"*\" is not supported). ${tail}`;
  }
  return `The connection was closed before the daemon accepted it. ${tail}`;
}

const IDLE_SYNC = { state: "idle", error: null };

/**
 * One WebSocket to the real bot daemon (backend/server.js), with a lifecycle that cannot loop:
 *  - A new socket is opened only when `wsUrl` or `nonce` changes. Opening is never driven by connection state;
 *    nonce is bumped by an explicit "Save & Connect" click. Credentials, callbacks and timers live in refs,
 *    so the connect effect's dependency list is only [wsUrl, nonce] plus stable helpers.
 *  - While the user has not yet had a successful open, we back off and eventually set gaveUp after
 *    MAX_FAILS_BEFORE_GIVE_UP. After the first open we keep retrying with a soft cap (tunnel restarts).
 *  - Credentials (bot login + AI chat settings) are written to bot-credentials.json (files:write) and the bot is
 *    restarted (power:restart) from the socket's own handler, on the daemon's first message (its "token accepted"
 *    signal), or on demand through syncCredentials() when the user saves new settings on an open connection.
 */
export function useServerSocket({ wsUrl, nonce, credentials }) {
  const [connection, setConnection] = useState(wsUrl ? "connecting" : "unconfigured");
  const [gaveUp, setGaveUp] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [sync, setSync] = useState(IDLE_SYNC);
  const [stats, setStats] = useState(null);

  const wsRef = useRef(null);
  const buffer = useRef([]);
  const listeners = useRef(new Map());
  const failCount = useRef(0);
  const everOpen = useRef(false);
  const retryTimer = useRef(null);
  const intentionalClose = useRef(false);
  const credentialsRef = useRef(credentials);
  const syncNowRef = useRef(null);
  const nonceRef = useRef(nonce);
  const wsUrlRef = useRef(wsUrl);

  useEffect(() => { credentialsRef.current = credentials; }, [credentials]);
  useEffect(() => { nonceRef.current = nonce; }, [nonce]);
  useEffect(() => { wsUrlRef.current = wsUrl; }, [wsUrl]);

  const dispatch = useCallback((msg) => {
    if (msg?.type === "console" && typeof msg.data === "string") {
      buffer.current.push(msg.data);
      if (buffer.current.length > 2000) buffer.current.shift();
    }
    if (msg?.type === "stats") setStats(msg);
    if (msg?.type === "status") {
      // optional
    }
    const set = listeners.current.get(msg?.type);
    if (set) for (const fn of set) {
      try { fn(msg); } catch {}
    }
  }, []);

  const panelLine = useCallback((text) => {
    // Quiet: do not spam console with [panel] connection chatter
    void text;
  }, []);

  const on = useCallback((type, fn) => {
    if (!listeners.current.has(type)) listeners.current.set(type, new Set());
    listeners.current.get(type).add(fn);
    return () => listeners.current.get(type)?.delete(fn);
  }, []);

  const getBuffer = useCallback(() => buffer.current.slice(), []);

  const send = useCallback((obj) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(obj));
      return true;
    } catch {
      return false;
    }
  }, []);

  const request = useCallback((payload, expectType, timeoutMs = 15000) => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected to the daemon"));
        return;
      }
      const id = payload.id || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const body = { ...payload, id };
      let offMain = () => {};
      let offErr = () => {};
      const cleanup = () => { offMain(); offErr(); };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Request timed out"));
      }, timeoutMs);
      const handler = (msg) => {
        if (msg?.id && msg.id !== id && expectType !== msg.type) return;
        if (expectType && msg.type !== expectType && msg.type !== "error") return;
        if (msg.type === "error" && msg.id && msg.id !== id) return;
        clearTimeout(timer);
        cleanup();
        if (msg.type === "error") reject(new Error(msg.message || "Error"));
        else resolve(msg);
      };
      offMain = on(expectType || "*", handler);
      // also listen error
      offErr = on("error", handler);
      try {
        ws.send(JSON.stringify(body));
      } catch (e) {
        cleanup();
        clearTimeout(timer);
        reject(e);
      }
    });
  }, [on]);

  /** Push the given credentials to the daemon now and restart the bot. Returns false when not connected. */
  const syncCredentials = useCallback((creds) => (syncNowRef.current ? syncNowRef.current(creds) : false), []);

  useEffect(() => {
    if (!wsUrl) {
      setConnection("unconfigured");
      setGaveUp(false);
      setLastError(null);
      intentionalClose.current = true;
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
      return;
    }

    intentionalClose.current = false;
    setGaveUp(false);
    setLastError(null);
    failCount.current = 0;

    const syncNow = (creds) => {
      const c = creds || credentialsRef.current;
      if (!c || !hasCredentials(c)) return setSync(IDLE_SYNC);
      const payload = credentialPayload(c);
      const hash = hashCredentials(payload);
      if (hash && hash === loadSyncedHash()) {
        setSync({ state: "synced", error: null });
        return true;
      }
      setSync({ state: "syncing", error: null });
      try {
        const ok = send({
          type: "files:write",
          name: CREDENTIALS_FILE,
          content: JSON.stringify(payload, null, 2),
        });
        if (!ok) {
          setSync({ state: "error", error: "not connected" });
          return false;
        }
        send({ type: "power:restart" });
        if (hash) saveSyncedHash(hash);
        setSync({ state: "synced", error: null });
        // creds synced (silent)
        return true;
      } catch (e) {
        setSync({ state: "error", error: String(e.message || e) });
        return false;
      }
    };
    syncNowRef.current = syncNow;

    let cancelled = false;

    const connect = () => {
      if (cancelled || intentionalClose.current) return;
      setConnection("connecting");
      let ws;
      try {
        ws = new WebSocket(wsUrl);
      } catch (e) {
        setConnection("closed");
        setLastError(String(e.message || e));
        scheduleRetry();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        everOpen.current = true;
        failCount.current = 0;
        setConnection("open");
        setLastError(null);
        buffer.current = []; // the daemon replays
        // connected (silent)
        syncNow(credentialsRef.current);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          dispatch(msg);
        } catch {}
      };

      ws.onerror = () => {
        // browser fires error then close; handle on close
      };

      ws.onclose = (e) => {
        if (cancelled || intentionalClose.current) return;
        wsRef.current = null;
        setConnection("closed");
        // ws closed (silent)
        if (FATAL_CODES.has(e.code)) {
          setLastError(CLOSE_HINTS[e.code] || `Closed (${e.code})`);
          setGaveUp(true);
          return;
        }
        if (!everOpen.current) {
          failCount.current += 1;
          if (failCount.current >= MAX_FAILS_BEFORE_GIVE_UP) {
            setGaveUp(true);
            setLastError(handshakeHint(false, e.code));
            return;
          }
        }
        scheduleRetry();
      };
    };

    const scheduleRetry = () => {
      if (cancelled || intentionalClose.current || retryTimer.current) return;
      const n = Math.min(failCount.current, 8);
      const ms = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * Math.pow(1.4, n));
      retryTimer.current = setTimeout(() => {
        retryTimer.current = null;
        connect();
      }, ms);
    };

    connect();

    return () => {
      cancelled = true;
      intentionalClose.current = true;
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, [wsUrl, nonce, dispatch, panelLine, send]);

  return { connection, gaveUp, lastError, sync, stats, send, on, getBuffer, request, syncCredentials };
}
