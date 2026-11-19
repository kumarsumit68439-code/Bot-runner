import { Bot, FolderOpen, Puzzle, Rocket, SquareTerminal, KeyRound, Shield, LogOut, CircleUser } from "lucide-react";

const ADMIN_USER_ID = "1487343086198853785";

// Admin-only: Environment (server .env), Files, Startup, Admin
const ADMIN_ONLY = new Set(["env", "files", "startup", "admin"]);

const TABS = [
  { id: "console", label: "Console", icon: SquareTerminal },
  { id: "files", label: "File Manager", icon: FolderOpen },
  { id: "modules", label: "Modules", icon: Puzzle },
  { id: "env", label: "Environment", icon: KeyRound },
  { id: "startup", label: "Startup Settings", icon: Rocket },
  { id: "account", label: "Account", icon: CircleUser },
  { id: "admin", label: "Admin", icon: Shield },
];

const CONNECTION = {
  open: ["bg-emerald-400", "Daemon connected"],
  connecting: ["bg-amber-400 animate-pulse", "Connecting..."],
  closed: ["bg-rose-500", "Disconnected"],
  unconfigured: ["bg-zinc-500", "Not configured"],
};

export default function Sidebar({ tab, onChange, connection, user }) {
  const [dot, label] = CONNECTION[connection] ?? CONNECTION.closed;
  const isOwner = String(user?.id || "") === ADMIN_USER_ID;
  const visibleTabs = TABS.filter((t) => !ADMIN_ONLY.has(t.id) || isOwner);

  return (
    <aside className="flex shrink-0 flex-col border-b border-line bg-panel md:min-h-screen md:w-64 md:border-b-0 md:border-r">
      <div className="flex items-center gap-3 px-5 py-4 md:py-6">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand shadow-lg shadow-brand/30">
          <Bot size={20} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">BotHost</p>
          <p className="text-xs text-zinc-500">Discord bot panel</p>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:pb-0">
        {visibleTabs.map(({ id, label: lab, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm transition ${
                active ? "bg-brand/15 text-white ring-1 ring-brand/40" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
              }`}
            >
              <Icon size={18} className={active ? "text-brand" : ""} />
              {lab}
            </button>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-line px-5 py-4 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          {label}
        </div>
        {user && (
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-zinc-500">{user.global_name || user.username}</span>
            <a href="/api/auth/logout" className="inline-flex items-center gap-1 text-zinc-400 hover:text-white" title="Logout">
              <LogOut size={14} />
            </a>
          </div>
        )}
      </div>
    </aside>
  );
}
