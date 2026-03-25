export default function TopBar({ clientName, monthLabel, onSave, canSave, onLogout }) {
  return (
    <div className="bg-[#1a1a1a] text-white px-4 h-11 flex items-center gap-3 shrink-0 z-10">
      <div className="bg-[#F5C518] text-[#1a1a1a] font-bold text-[11px] tracking-wider px-2.5 py-1 rounded-sm uppercase">
        CYL
      </div>
      <div className="text-sm font-semibold">SEO Blog Checker</div>
      <div className="ml-auto flex items-center gap-2.5">
        <div className="text-[11px] text-white/50">
          {clientName ? (
            <span>
              <span className="text-[#F5C518] font-semibold">{clientName}</span>
              {monthLabel && ` — ${monthLabel}`}
            </span>
          ) : (
            <span>No report open</span>
          )}
        </div>
        <button
          onClick={onSave}
          disabled={!canSave}
          className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-[5px] px-3.5 py-1.5 text-xs font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save Report
        </button>
        {onLogout && (
          <button
            onClick={onLogout}
            className="text-white/40 hover:text-white/70 text-xs border border-white/20 rounded px-2 py-1"
          >
            Logout
          </button>
        )}
      </div>
    </div>
  );
}
