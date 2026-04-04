import { useMemo, useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function Cannibalization({
  focusKeyphrase,
  secondaryKeywords,
  clientId,
  onManageKeywords,
}) {
  const [clientKeywords, setClientKeywords] = useState('');
  const [loading, setLoading] = useState(false);
  const [reworking, setReworking] = useState(new Set());

  // Auto-load keywords from the client
  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    supabase
      .from('clients')
      .select('past_keywords')
      .eq('id', clientId)
      .single()
      .then(({ data }) => {
        setClientKeywords(data?.past_keywords || '');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [clientId]);

  const hits = useMemo(() => {
    const fk = focusKeyphrase?.trim().toLowerCase() || '';
    const sk = (secondaryKeywords || '')
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    const current = [fk, ...sk].filter(Boolean);
    const past = clientKeywords
      .split('\n')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    if (!current.length || !past.length) return [];

    const found = [];
    current.forEach((kw) => {
      past.forEach((p) => {
        if (p && kw && (p.includes(kw) || kw.includes(p))) {
          if (!found.find((h) => h.kw === kw && h.p === p)) {
            found.push({ kw, p, id: `${kw}::${p}` });
          }
        }
      });
    });
    return found;
  }, [focusKeyphrase, secondaryKeywords, clientKeywords]);

  const toggleRework = (id) => {
    setReworking((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const keywordCount = clientKeywords.split('\n').filter(l => l.trim()).length;

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
      <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider flex justify-between items-center">
        <span>Keyword Cannibalization</span>
        {clientId && onManageKeywords && (
          <button
            onClick={() => onManageKeywords(clientId)}
            className="bg-transparent border border-white/20 text-white/70 rounded px-2 py-0 text-[9px] cursor-pointer hover:text-[#F5C518] hover:border-[#F5C518]"
          >
            Manage Keywords
          </button>
        )}
      </div>
      <div className="p-3.5">
        {!clientId ? (
          <div className="text-[11px] text-gray-400">
            Save this report to a client to enable cannibalization checks.
          </div>
        ) : loading ? (
          <div className="text-[11px] text-gray-400">Loading keywords...</div>
        ) : keywordCount === 0 ? (
          <div className="text-[11px] text-gray-400">
            No keywords in this client&apos;s keyword bank.{' '}
            {onManageKeywords && (
              <button
                onClick={() => onManageKeywords(clientId)}
                className="text-[#F5C518] font-semibold bg-transparent border-none cursor-pointer hover:underline p-0 text-[11px]"
              >
                Add keywords
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="text-[10px] text-gray-400 mb-2">
              Checking against {keywordCount} saved keywords
            </div>

            {!focusKeyphrase ? (
              <div className="text-[11px] text-gray-400">
                Enter a focus keyphrase to check for overlaps.
              </div>
            ) : hits.length === 0 ? (
              <div className="bg-green-50 border border-green-200 rounded px-2 py-1.5 text-[11px] text-green-700">
                ✓ No overlap found — safe to publish.
              </div>
            ) : (
              <>
                {hits.map((h) => {
                  const isRework = reworking.has(h.id);
                  return (
                    <div
                      key={h.id}
                      className={`rounded px-2 py-1.5 mt-1.5 text-[11px] flex items-start gap-2 ${
                        isRework
                          ? 'bg-blue-50 border border-blue-200'
                          : 'bg-red-50 border border-red-200'
                      }`}
                    >
                      <div className="flex-1">
                        {isRework ? (
                          <>
                            <strong className="text-blue-500">Reworking:</strong>{' '}
                            &quot;{h.kw}&quot; matches &quot;{h.p}&quot;
                            <div className="text-[9px] text-blue-400 mt-0.5">
                              Marked as intentional update
                            </div>
                          </>
                        ) : (
                          <><strong className="text-red-500">Overlap:</strong>{' '}
                            &quot;{h.kw}&quot; matches &quot;{h.p}&quot;
                          </>
                        )}
                      </div>
                      <label className="flex items-center gap-1 shrink-0 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isRework}
                          onChange={() => toggleRework(h.id)}
                          className="w-3 h-3 cursor-pointer accent-blue-500"
                        />
                        <span className="text-[9px] text-gray-400">Rework</span>
                      </label>
                    </div>
                  );
                })}
                {hits.some(h => !reworking.has(h.id)) && (
                  <div className="text-[9px] text-gray-400 mt-1.5">
                    Tick &ldquo;Rework&rdquo; if you&apos;re intentionally updating an existing article for this keyword.
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
