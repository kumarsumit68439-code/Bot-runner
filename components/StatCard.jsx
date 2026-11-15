export default function StatCard({ icon: Icon, label, value, sub, percent }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-zinc-500">
        {label}
        <Icon size={16} />
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="text-xs text-zinc-500">{sub}</p>}
      {percent !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
          <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
      )}
    </div>
  );
}
