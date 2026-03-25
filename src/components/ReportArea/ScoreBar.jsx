import { CHECKS } from '../../data/checklist';

export default function ScoreBar({ checklistState }) {
  const allItems = CHECKS.flatMap((c) => c.items);
  const total = allItems.length;
  const passed = allItems.filter((i) => checklistState[i.id]).length;
  const pct = Math.round((passed / total) * 100);

  let cls, lbl, sub;
  if (pct >= 85) {
    cls = 'great';
    lbl = 'Looking great — almost ready to publish';
    sub = 'Check any remaining critical items.';
  } else if (pct >= 60) {
    cls = 'ok';
    lbl = 'Good progress — a few things to fix';
    sub = 'Focus on the critical items first.';
  } else {
    cls = 'poor';
    lbl = 'Needs work before publishing';
    sub = 'Multiple critical items are missing.';
  }

  const colorMap = { great: '#27ae60', ok: '#e67e22', poor: '#e74c3c' };
  const textColorMap = { great: 'text-green-600', ok: 'text-orange-500', poor: 'text-red-500' };

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] p-4 mb-4 flex items-center gap-5">
      <div className={`text-[40px] font-bold leading-none min-w-[70px] ${textColorMap[cls]}`}>
        {pct}%
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold mb-0.5">{lbl}</div>
        <div className="text-[11px] text-gray-400 mb-1.5">{sub}</div>
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: colorMap[cls] }}
          />
        </div>
        <div className="flex gap-3.5 mt-1.5 flex-wrap">
          <span className="text-[11px] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block" /> Auto (AI)
          </span>
          <span className="text-[11px] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-600 inline-block" /> <b>{passed}</b> passed
          </span>
          <span className="text-[11px] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" /> <b>{total - passed}</b> remaining
          </span>
        </div>
      </div>
    </div>
  );
}
