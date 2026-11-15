"use client";

import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

/** xterm.js console. Replays buffered output on mount, then streams live "console" messages. */
export default function Terminal({ getBuffer, on }) {
  const ref = useRef(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      // Dynamic import keeps xterm out of the server render.
      const [{ Terminal: XTerm }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed || !ref.current) return;

      const term = new XTerm({
        convertEol: true,
        disableStdin: true,
        cursorBlink: false,
        fontSize: 13,
        scrollback: 5000,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        theme: { background: "#07090d", foreground: "#d4d4d8", cursor: "#07090d", selectionBackground: "#5865F255" },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(ref.current);
      fit.fit();

      getBuffer().forEach((chunk) => term.write(chunk));
      const off = on("console", (m) => term.write(m.data));
      const ro = new ResizeObserver(() => { try { fit.fit(); } catch {} });
      ro.observe(ref.current);

      cleanup = () => { off(); ro.disconnect(); term.dispose(); };
    })();

    return () => { disposed = true; cleanup(); };
  }, [getBuffer, on]);

  return <div ref={ref} className="h-full w-full" />;
}
