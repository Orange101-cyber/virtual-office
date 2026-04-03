import { useMemo, useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

export default function Cannibalization({
  focusKeyphrase,
  secondaryKeywords,
  pastKeywords,
  onPastKeywordsChange,
  clientId,
}) {
  const [clientKeywords, setClientKeywords] = useState('');
  const [loadingKw, setLoadingKw] = useState(false);
  const [savingKw, setSavingKw] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [reworking, setReworking] = useState(new Set());
  const [showClientBank, setShowClientBank] = useState(true);

  // Load client keyword bank from Supabase
  useEffect(() => {
    if (!clientId) return;
    setLoadingKw(true);
    supabase
      .from('clients')
      .select('past_keywords')
      .eq('id', clientId)
      .single()
      .then(({ data }) => {
        if (data?.past_keywords) {
          setClientKeywords(data.past_keywords);
          // Also set on the report-level field so checks work
          if (!pastKeywords) onPastKeywordsChange(data.past_keywords);
        }
        setLoadingKw(false);
      })
      .catch(() => setLoadingKw(false));
  }, [clientId]);

  // Save client keyword bank to Supabase
  const saveClientKeywords = useCallback(async () => {
    if (!clientId) return;
    setSavingKw(true);
    const { error } = await supabase
      .from('clients')
      .update({ past_keywords: clientKeywords })
      .eq('id', clientId);
    setSavingKw(false);
    if (!error) {
      setSavedMsg('Saved!');
      // Sync to report-level field
      onPastKeywordsChange(clientKeywords);
      setTimeout(() => setSavedMsg(''), 2000);
    } else {
      setSavedMsg('Error saving');
      setTimeout(() => setSavedMsg(''), 3000);
    }
  }, [clientId, clientKeywords, onPastKeywordsChange]);

  // Use client keywords if available, otherwise fall back to report-level
  const effectiveKeywords = clientKeywords || pastKeywords || '';

  const hits = useMemo(() => {
    const fk = focusKeyphrase?.trim().toLowerCase() || '';
    const sk = (secondaryKeywords || '')
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    const current = [fk, ...sk].filter(Boolean);
    const past = effectiveKeywords
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
  }, [focusKeyphrase, secondaryKeywords, effectiveKeywords]);

  const toggleRework = (id) => {
    setReworking((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
      <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider">
        Keyword Cannibalization
      </div>
      <div className="p-3.5">
        {/* Client Keyword Bank */}
        {clientId && (
          <div className="mb-3">
            <div
              className="flex items-center justify-between cursor-pointer mb-1"
              onClick={() => setShowClientBank(!showClientBank)}
            >
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 cursor-pointer">
                Client Keyword Bank {loadingKw && '(loading...)'}
              </label>
              <span className="text-[9px] text-gray-400">{showClientBank ? '▼' : '▶'}</span>
            </div>
            {showClientBank && (
              <>
                <div className="text-[10px] text-gray-400 mb-1">
                  These keywords are saved for this client and auto-loaded for every report.
                </div>
                <textarea
                  value={clientKeywords}
                  onChange={(e) => setClientKeywords(e.target.value)}
                  rows={6}
                  placeholder={'real estate west end\nbrisbane property investment\nselling in west end\n(one keyword per line)'}
                  className="w-full border border-gray-200 rounded-[5px] px-2 py-1.5 text-[11px] bg-[#f8f8f6] resize-y focus:outline-none focus:border-[#F5C518]"
                />
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={saveClientKeywords}
                    disabled={savingKw}
                    className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-[5px] px-3 py-1 text-[10px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40"
                  >
                    {savingKw ? 'Saving...' : 'Save Keywords'}
                  </button>
                  {savedMsg && (
                    <span className={`text-[10px] ${savedMsg === 'Saved!' ? 'text-green-600' : 'text-red-500'}`}>
                      {savedMsg}
                    </span>
                  )}
                  <span className="text-[9px] text-gray-400 ml-auto">
                    {clientKeywords.split('\n').filter(l => l.trim()).length} keywords
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Report-level override (if no client selected) */}
        {!clientId && (
          <div className="mb-2">
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
        )}

        {/* Results */}
        {effectiveKeywords && focusKeyphrase && (
          hits.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded px-2 py-1.5 mt-1.5 text-[11px] text-green-700">
              ✓ No overlap found.
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
                            Marked as intentional — updating existing article
                          </div>
                        </>
                      ) : (
                        <>
                          <strong className="text-red-500">Overlap:</strong>{' '}
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
          )
        )}
      </div>
    </div>
  );
}
