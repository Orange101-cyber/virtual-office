import { useState } from 'react';
import { CHECKS } from '../../data/checklist';

export default function Checklist({ checklistState, onToggle }) {
  const [collapsedCats, setCollapsedCats] = useState(new Set());

  const toggleCat = (idx) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div>
      {CHECKS.map((cat, ci) => {
        const passed = cat.items.filter((i) => checklistState[i.id]).length;
        const collapsed = collapsedCats.has(ci);

        return (
          <div key={ci}>
            <div
              onClick={() => toggleCat(ci)}
              className="px-3.5 py-1.5 bg-[#f8f8f6] border-b border-t border-gray-200 text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center justify-between cursor-pointer select-none hover:bg-[#f0f0ec] first:border-t-0"
            >
              <span>{cat.cat}</span>
              <span className="font-normal normal-case tracking-normal text-gray-400">
                {passed}/{cat.items.length}
              </span>
            </div>
            {!collapsed &&
              cat.items.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-start gap-2 px-3.5 py-2 border-b border-gray-200 last:border-b-0 hover:bg-[#f8f8f6] ${
                    checklistState[item.id] ? 'opacity-60' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checklistState[item.id] || false}
                    onChange={() => onToggle(item.id)}
                    className="mt-0.5 w-3 h-3 shrink-0 cursor-pointer accent-[#1a1a1a]"
                  />
                  <div className="flex-1">
                    <div className={`text-xs leading-snug ${checklistState[item.id] ? 'line-through text-gray-400' : ''}`}>
                      {item.label}
                      {item.crit && (
                        <span className="inline-block text-[9px] font-bold uppercase bg-red-50 text-red-500 px-1 py-0 rounded ml-1 align-middle">
                          Critical
                        </span>
                      )}
                      {item.isNew && (
                        <span className="inline-block text-[9px] font-bold uppercase bg-blue-50 text-blue-700 px-1 py-0 rounded ml-1 align-middle">
                          Add this
                        </span>
                      )}
                      {item.auto && (
                        <span className="inline-block text-[9px] font-bold uppercase bg-blue-100 text-blue-700 px-1.5 py-0 rounded-full ml-1 align-middle">
                          Auto
                        </span>
                      )}
                    </div>
                    {item.note && (
                      <div className="text-[10px] text-gray-400 mt-0.5">{item.note}</div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}
