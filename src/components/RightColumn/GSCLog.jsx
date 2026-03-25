import { useMemo } from 'react';

export default function GSCLog({ gscData, onGscChange }) {
  const deltas = useMemo(() => {
    const w1i = parseFloat(gscData.w1_imp);
    const w4i = parseFloat(gscData.w4_imp);
    const w1c = parseFloat(gscData.w1_clk);
    const w4c = parseFloat(gscData.w4_clk);
    const w1p = parseFloat(gscData.w1_pos);
    const w4p = parseFloat(gscData.w4_pos);

    if (isNaN(w4i) && isNaN(w4c)) return [];

    const rows = [];
    if (!isNaN(w1i) && !isNaN(w4i)) {
      const d = w4i - w1i;
      rows.push({ label: 'Impressions', delta: d, positive: d >= 0 });
    }
    if (!isNaN(w1c) && !isNaN(w4c)) {
      const d = w4c - w1c;
      rows.push({ label: 'Clicks', delta: d, positive: d >= 0 });
    }
    if (!isNaN(w1p) && !isNaN(w4p)) {
      const d = w4p - w1p;
      rows.push({
        label: 'Position',
        delta: d,
        positive: d <= 0,
        suffix: d <= 0 ? '(improving)' : '(dropping)',
        format: true,
      });
    }
    return rows;
  }, [gscData]);

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
      <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider flex items-center justify-between">
        <span>GSC Performance Log</span>
        <span className="text-[9px] font-normal normal-case tracking-normal opacity-60">Log from Search Console</span>
      </div>
      <div className="p-3.5">
        <div className="text-[11px] text-gray-400 mb-2.5 leading-relaxed">
          GSC → Performance → filter by this page URL
        </div>

        {/* Week 1-2 */}
        <div className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider mb-1.5 bg-[#F5C518] text-[#1a1a1a]">
          Week 1–2
        </div>
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          <GscInput label="Impressions" value={gscData.w1_imp} onChange={(v) => onGscChange('w1_imp', v)} placeholder="42" />
          <GscInput label="Clicks" value={gscData.w1_clk} onChange={(v) => onGscChange('w1_clk', v)} placeholder="3" />
          <GscInput label="Position" value={gscData.w1_pos} onChange={(v) => onGscChange('w1_pos', v)} placeholder="34" />
        </div>

        {/* Week 4 */}
        <div className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider mb-1.5 bg-[#f8f8f6] border border-gray-200 text-gray-500">
          Week 4
        </div>
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          <GscInput label="Impressions" value={gscData.w4_imp} onChange={(v) => onGscChange('w4_imp', v)} placeholder="180" />
          <GscInput label="Clicks" value={gscData.w4_clk} onChange={(v) => onGscChange('w4_clk', v)} placeholder="12" />
          <GscInput label="Position" value={gscData.w4_pos} onChange={(v) => onGscChange('w4_pos', v)} placeholder="18" />
        </div>

        {/* Deltas */}
        {deltas.length > 0 && (
          <div className="flex flex-wrap gap-1.5 p-2 bg-[#f8f8f6] rounded mb-2 text-[10px]">
            {deltas.map((d, i) => (
              <span key={i} style={{ color: d.positive ? '#27ae60' : '#e74c3c' }}>
                {d.positive ? '↑' : '↓'} {d.label}{' '}
                {d.format
                  ? `${d.delta <= 0 ? '' : '+'}${d.delta.toFixed(1)} ${d.suffix}`
                  : `${d.delta >= 0 ? '+' : ''}${d.delta}`}
              </span>
            ))}
          </div>
        )}

        {/* Queries */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
            Top Queries (from GSC Queries tab)
          </label>
          <textarea
            value={gscData.queries}
            onChange={(e) => onGscChange('queries', e.target.value)}
            rows={2}
            placeholder="real estate west end, west end property..."
            className="w-full border border-gray-200 rounded-[5px] px-2 py-1.5 text-[11px] bg-[#f8f8f6] resize-y focus:outline-none focus:border-[#F5C518]"
          />
        </div>
      </div>
    </div>
  );
}

function GscInput({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="text-[9px] text-gray-400 uppercase tracking-wider block mb-0.5">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518]"
      />
    </div>
  );
}
