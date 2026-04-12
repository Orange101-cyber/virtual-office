import { CHECKS, calcScopeScore } from '../../data/checklist';

function getColor(pct) {
  if (pct >= 85) return { bg: '#27ae60', text: 'text-green-600', label: 'Great' };
  if (pct >= 60) return { bg: '#e67e22', text: 'text-orange-500', label: 'Needs work' };
  return { bg: '#e74c3c', text: 'text-red-500', label: 'Poor' };
}

export default function ScoreBar({ checklistState }) {
  const allItems = CHECKS.flatMap((c) => c.items);
  const total = allItems.length;
  const passed = allItems.filter((i) => checklistState[i.id]).length;
  const pct = Math.round((passed / total) * 100);

  const writing = calcScopeScore(checklistState, 'writing');
  const technical = calcScopeScore(checklistState, 'technical');

  const overallColor = getColor(pct);
  const writingColor = getColor(writing.pct);
  const technicalColor = getColor(technical.pct);

  let lbl, sub;
  if (pct >= 85) {
    lbl = 'Looking great — almost ready to publish';
    sub = 'Check any remaining critical items.';
  } else if (pct >= 60) {
    lbl = 'Good progress — a few things to fix';
    sub = 'Focus on the critical items first.';
  } else {
    lbl = 'Needs work before publishing';
    sub = 'Multiple critical items are missing.';
  }

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] p-4">
      {/* Overall row */}
      <div className="flex items-center gap-5 mb-4">
        <div className={`text-[40px] font-bold leading-none min-w-[70px] ${overallColor.text}`}>
          {pct}%
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold mb-0.5">{lbl}</div>
          <div className="text-[11px] text-gray-400 mb-1.5">{sub}</div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: overallColor.bg }}
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

      {/* Split scores — Writing vs Technical */}
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
        {/* Writing score */}
        <div className="bg-[#f8f8f6] rounded-lg p-3 relative">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">✍️</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Writer Score</span>
            </div>
            <span className={`text-[18px] font-bold leading-none ${writingColor.text}`}>
              {writing.pct}%
            </span>
          </div>
          <div className="h-1 bg-white rounded-full overflow-hidden mb-1.5">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${writing.pct}%`, background: writingColor.bg }} />
          </div>
          <div className="text-[10px] text-gray-500">
            <b className="text-green-600">{writing.passed}</b> / <b>{writing.total}</b> content items passed
          </div>
          <div className="text-[9px] text-gray-400 mt-0.5">
            What the SEO writer controls (content, keywords, headings, meta)
          </div>
        </div>

        {/* Technical score */}
        <div className="bg-[#f8f8f6] rounded-lg p-3 relative">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">⚙️</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Technical Score</span>
            </div>
            <span className={`text-[18px] font-bold leading-none ${technicalColor.text}`}>
              {technical.pct}%
            </span>
          </div>
          <div className="h-1 bg-white rounded-full overflow-hidden mb-1.5">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${technical.pct}%`, background: technicalColor.bg }} />
          </div>
          <div className="text-[10px] text-gray-500">
            <b className="text-green-600">{technical.passed}</b> / <b>{technical.total}</b> technical items passed
          </div>
          <div className="text-[9px] text-gray-400 mt-0.5">
            Post-publish admin work (schema, GSC, UX, mobile, QA)
          </div>
        </div>
      </div>
    </div>
  );
}
