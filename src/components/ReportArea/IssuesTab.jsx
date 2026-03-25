import { CHECKS } from '../../data/checklist';

export default function IssuesTab({ checklistState }) {
  const allItems = CHECKS.flatMap((c) => c.items);
  const missing = allItems.filter((i) => !checklistState[i.id]);
  const critical = missing.filter((i) => i.crit);
  const remaining = missing.filter((i) => !i.crit);

  if (missing.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-green-600">
        ✓ All items complete!
      </div>
    );
  }

  return (
    <div className="p-3.5">
      {critical.length > 0 && (
        <>
          <p className="text-[11px] font-bold text-red-500 mb-1.5">
            Critical ({critical.length})
          </p>
          {critical.map((item) => (
            <div key={item.id} className="flex items-start gap-1.5 py-1 border-b border-gray-200 text-[11px] last:border-b-0">
              <div className="w-3 h-3 rounded-full bg-red-500 text-white flex items-center justify-center shrink-0 mt-0.5 text-[8px] font-bold">
                !
              </div>
              <div>{item.label}</div>
            </div>
          ))}
        </>
      )}
      {remaining.length > 0 && (
        <>
          <p className="text-[11px] font-bold text-orange-500 mt-3 mb-1.5">
            Remaining ({remaining.length})
          </p>
          {remaining.map((item) => (
            <div key={item.id} className="flex items-start gap-1.5 py-1 border-b border-gray-200 text-[11px] last:border-b-0">
              <div className="w-3 h-3 rounded-full bg-orange-500 text-white flex items-center justify-center shrink-0 mt-0.5 text-[8px]">
                ●
              </div>
              <div>{item.label}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
