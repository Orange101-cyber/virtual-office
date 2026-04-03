import { useMemo, useState } from 'react';

function analyzeDensity(content, focusKw, secondaryKws) {
  if (!content || !focusKw) return null;

  const words = content.toLowerCase().split(/\s+/).filter(w => w.match(/[a-z]/));
  const totalWords = words.length;
  if (totalWords === 0) return null;

  const text = content.toLowerCase();

  // Focus keyphrase
  const fkLower = focusKw.toLowerCase().trim();
  const fkRegex = new RegExp(fkLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const fkMatches = (content.match(fkRegex) || []).length;
  const fkDensity = ((fkMatches * fkLower.split(/\s+/).length) / totalWords * 100).toFixed(1);

  // Find positions for heatmap
  const positions = [];
  const sentences = content.split(/(?<=[.!?])\s+/);
  sentences.forEach((sentence, idx) => {
    const sLower = sentence.toLowerCase();
    if (sLower.includes(fkLower)) {
      positions.push({ idx, type: 'focus' });
    }
  });

  // Secondary keywords
  const secKws = (secondaryKws || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
  const secResults = secKws.map(kw => {
    const kwRegex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = (content.match(kwRegex) || []).length;
    const density = ((matches * kw.split(/\s+/).length) / totalWords * 100).toFixed(1);
    return { keyword: kw, count: matches, density: parseFloat(density) };
  });

  // Check if keyphrase is in first 100 words
  const first100 = words.slice(0, 100).join(' ');
  const inFirst100 = first100.includes(fkLower);

  // Check if keyphrase is in last paragraph
  const lastPara = content.split(/\n\s*\n/).filter(p => p.trim()).pop() || '';
  const inLastPara = lastPara.toLowerCase().includes(fkLower);

  return {
    focusKeyword: fkLower,
    count: fkMatches,
    density: parseFloat(fkDensity),
    totalWords,
    inFirst100,
    inLastPara,
    secondaryResults: secResults,
    sentenceCount: sentences.length,
    positions,
  };
}

function DensityBar({ label, density, count }) {
  const isGood = density >= 0.8 && density <= 2.5;
  const isTooHigh = density > 2.5;
  const color = isGood ? '#27ae60' : isTooHigh ? '#e74c3c' : '#e67e22';

  return (
    <div className="mb-2">
      <div className="flex justify-between text-[11px] mb-0.5">
        <span className="text-gray-600 truncate max-w-[140px]" title={label}>{label}</span>
        <span className="font-semibold shrink-0" style={{ color }}>
          {density}% ({count}x)
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(density * 33, 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export default function KeywordDensity({ content, focusKeyphrase, secondaryKeywords }) {
  const [showHeatmap, setShowHeatmap] = useState(false);
  const stats = useMemo(
    () => analyzeDensity(content, focusKeyphrase, secondaryKeywords),
    [content, focusKeyphrase, secondaryKeywords]
  );

  if (!stats) {
    return (
      <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
        <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider">
          Keyword Density
        </div>
        <div className="p-3.5 text-[11px] text-gray-400">
          Add content and a focus keyphrase to see density analysis.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
      <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider flex justify-between">
        <span>Keyword Density</span>
        <span className="font-normal normal-case tracking-normal opacity-60">Target: 1–2%</span>
      </div>
      <div className="p-3.5">
        {/* Focus keyword */}
        <DensityBar label={stats.focusKeyword} density={stats.density} count={stats.count} />

        {/* Placement checks */}
        <div className="flex gap-3 mb-3 flex-wrap">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${stats.inFirst100 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
            {stats.inFirst100 ? '✓' : '✗'} In first 100 words
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${stats.inLastPara ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
            {stats.inLastPara ? '✓' : '✗'} In conclusion
          </span>
        </div>

        {/* Secondary keywords */}
        {stats.secondaryResults.length > 0 && (
          <>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5 mt-2">
              Secondary Keywords
            </div>
            {stats.secondaryResults.map((r, i) => (
              <DensityBar key={i} label={r.keyword} density={r.density} count={r.count} />
            ))}
          </>
        )}

        {/* Heatmap toggle */}
        <button
          onClick={() => setShowHeatmap(!showHeatmap)}
          className="text-[10px] text-[#F5C518] font-semibold mt-2 bg-transparent border-none cursor-pointer hover:underline p-0"
        >
          {showHeatmap ? 'Hide' : 'Show'} keyword heatmap
        </button>

        {showHeatmap && (
          <div className="mt-2 flex flex-wrap gap-[2px]">
            {content.split(/(?<=[.!?])\s+/).map((sentence, idx) => {
              const hasKw = sentence.toLowerCase().includes(stats.focusKeyword);
              return (
                <span
                  key={idx}
                  className={`inline-block w-3 h-3 rounded-sm ${hasKw ? 'bg-[#F5C518]' : 'bg-gray-100'}`}
                  title={`Sentence ${idx + 1}${hasKw ? ' — contains keyword' : ''}`}
                />
              );
            })}
          </div>
        )}
        {showHeatmap && (
          <div className="flex gap-3 mt-1 text-[9px] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#F5C518] inline-block" /> Has keyword</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-gray-100 inline-block" /> No keyword</span>
          </div>
        )}
      </div>
    </div>
  );
}
