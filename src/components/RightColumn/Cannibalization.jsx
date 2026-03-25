import { useMemo } from 'react';

export default function Cannibalization({
  focusKeyphrase,
  secondaryKeywords,
  pastKeywords,
  onPastKeywordsChange,
}) {
  const hits = useMemo(() => {
    const fk = focusKeyphrase?.trim().toLowerCase() || '';
    const sk = (secondaryKeywords || '')
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    const current = [fk, ...sk].filter(Boolean);
    const past = (pastKeywords || '')
      .split('\n')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    if (!current.length || !past.length) return [];

    const found = [];
    current.forEach((kw) => {
      past.forEach((p) => {
        if (p && kw && (p.includes(kw) || kw.includes(p))) {
          if (!found.find((h) => h.kw === kw && h.p === p)) {
            found.push({ kw, p });
          }
        }
      });
    });
    return found;
  }, [focusKeyphrase, secondaryKeywords, pastKeywords]);

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
      <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider">
        Keyword Cannibalization
      </div>
      <div className="p-3.5">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
            Past article keywords (one per line)
          </label>
          <textarea
            value={pastKeywords}
            onChange={(e) => onPastKeywordsChange(e.target.value)}
            rows={6}
            placeholder={'past keyword 1\npast keyword 2\n(paste from your spreadsheet)'}
            className="w-full border border-gray-200 rounded-[5px] px-2 py-1.5 text-[11px] bg-[#f8f8f6] resize-y focus:outline-none focus:border-[#F5C518]"
          />
        </div>
        {pastKeywords && focusKeyphrase && (
          hits.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded px-2 py-1.5 mt-1.5 text-[11px] text-green-700">
              ✓ No overlap found.
            </div>
          ) : (
            hits.map((h, i) => (
              <div
                key={i}
                className="bg-red-50 border border-red-200 rounded px-2 py-1.5 mt-1.5 text-[11px]"
              >
                <strong className="text-red-500">Overlap:</strong> &quot;{h.kw}&quot; matches &quot;{h.p}&quot;
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}
