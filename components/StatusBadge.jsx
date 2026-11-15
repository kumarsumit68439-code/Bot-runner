const STYLES = {
  online: { label: "Online", text: "text-emerald-300", bg: "bg-emerald-500/10 ring-emerald-500/30", dot: "bg-emerald-400", ping: true },
  starting: { label: "Starting", text: "text-amber-300", bg: "bg-amber-500/10 ring-amber-500/30", dot: "bg-amber-400", ping: true },
  offline: { label: "Offline", text: "text-rose-300", bg: "bg-rose-500/10 ring-rose-500/30", dot: "bg-rose-500", ping: false },
};

export default function StatusBadge({ status }) {
  const s = STYLES[status] ?? STYLES.offline;
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ${s.bg} ${s.text}`}>
      <span className="relative flex h-2 w-2">
        {s.ping && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${s.dot}`} />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${s.dot}`} />
      </span>
      {s.label}
    </span>
  );
}
