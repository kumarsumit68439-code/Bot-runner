import { Play, RotateCw, Square } from "lucide-react";

const BTN = "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";

export default function PowerControls({ status, disabled, onAction }) {
  const offline = status === "offline";
  return (
    <div className="flex flex-wrap gap-2">
      <button className={`${BTN} bg-emerald-600 text-white hover:bg-emerald-500`} disabled={disabled || !offline} onClick={() => onAction("start")}>
        <Play size={16} /> Start
      </button>
      <button className={`${BTN} bg-amber-600 text-white hover:bg-amber-500`} disabled={disabled || offline} onClick={() => onAction("restart")}>
        <RotateCw size={16} /> Restart
      </button>
      <button className={`${BTN} bg-rose-600 text-white hover:bg-rose-500`} disabled={disabled || offline} onClick={() => onAction("stop")}>
        <Square size={16} /> Stop
      </button>
    </div>
  );
}
