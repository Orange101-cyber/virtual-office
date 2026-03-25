import { CHECKS } from '../../data/checklist';

export default function CategoryProgress({ checklistState }) {
  return (
    <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
      <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider">
        Category Progress
      </div>
      <div className="p-3.5">
        {CHECKS.map((cat, ci) => {
          const passed = cat.items.filter((i) => checklistState[i.id]).length;
          const total = cat.items.length;
          const pct = Math.round((passed / total) * 100);
          const color = pct === 100 ? '#27ae60' : pct >= 50 ? '#e67e22' : '#e74c3c';

          return (
            <div key={ci} className="flex items-center gap-2 py-1 border-b border-gray-200 last:border-b-0">
              <div className="flex-1 text-[11px]">{cat.cat}</div>
              <div className="text-[10px] text-gray-400 min-w-[28px] text-right">
                {passed}/{total}
              </div>
              <div className="w-14 h-1 bg-gray-200 rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm"
                  style={{ width: `${pct}%`, background: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
