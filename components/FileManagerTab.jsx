"use client";

import { useCallback, useEffect, useState } from "react";
import { File as FileIcon, FileCode, FileText, Loader2, RefreshCw, Save } from "lucide-react";

const iconFor = (name) =>
  name.endsWith(".js") ? FileCode : name.endsWith(".json") || name.startsWith(".env") ? FileText : FileIcon;

export default function FileManagerTab({ server }) {
  const { request, connection } = server;
  const [files, setFiles] = useState([]);
  const [active, setActive] = useState(null);
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const dirty = active !== null && content !== original;

  const loadList = useCallback(async () => {
    try {
      const r = await request({ type: "files:list" }, "files:list");
      setFiles(r.files);
    } catch (e) {
      setNote({ error: true, text: e.message });
    }
  }, [request]);

  useEffect(() => {
    if (connection === "open" || connection === "demo") loadList();
  }, [connection, loadList]);

  const openFile = async (name) => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await request({ type: "files:read", name }, "files:content");
      setActive(name);
      setContent(r.content ?? "");
      setOriginal(r.content ?? "");
    } catch (e) {
      setNote({ error: true, text: e.message });
    }
    setBusy(false);
  };

  const save = async () => {
    if (!active || !dirty) return;
    setBusy(true);
    try {
      await request({ type: "files:write", name: active, content }, "files:saved");
      setOriginal(content);
      setNote({ text: `Saved ${active}. Restart the bot to apply changes.` });
    } catch (e) {
      setNote({ error: true, text: e.message });
    }
    setBusy(false);
  };

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); }
    if (e.key === "Tab") {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: end } = e.target;
      setContent(content.slice(0, s) + "  " + content.slice(end));
      requestAnimationFrame(() => { e.target.selectionStart = e.target.selectionEnd = s + 2; });
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-white">File Manager</h1>
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="rounded-xl border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3 text-xs uppercase tracking-wide text-zinc-500">
            Files
            <button onClick={loadList} className="hover:text-white" title="Refresh"><RefreshCw size={14} /></button>
          </div>
          <ul className="p-2">
            {files.length === 0 && <li className="px-3 py-2 text-sm text-zinc-500">No files</li>}
            {files.map((f) => {
              const Icon = iconFor(f.name);
              return (
                <li key={f.name}>
                  <button
                    onClick={() => openFile(f.name)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                      active === f.name ? "bg-brand/15 text-white" : "text-zinc-400 hover:bg-white/5"
                    }`}
                  >
                    <Icon size={16} />
                    <span className="flex-1 truncate font-mono">{f.name}</span>
                    <span className="text-xs text-zinc-600">{f.size}B</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex min-h-[460px] flex-col rounded-xl border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-mono text-sm text-zinc-300">
              {active ?? "Select a file"} {dirty && <span className="text-amber-400">- unsaved</span>}
            </span>
            <button
              onClick={save}
              disabled={!dirty || busy}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand/80 disabled:opacity-40"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save
            </button>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!active}
            spellCheck={false}
            className="min-h-[380px] flex-1 resize-none bg-[#07090d] p-4 font-mono text-[13px] leading-6 text-zinc-200 outline-none disabled:opacity-40"
          />
          {note && (
            <p className={`border-t border-line px-4 py-2 text-xs ${note.error ? "text-rose-400" : "text-emerald-400"}`}>{note.text}</p>
          )}
        </div>
      </div>
    </div>
  );
}
