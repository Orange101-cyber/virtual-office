import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

// Pulls every client's keywords from the three places they live:
//  1. rank_tracker_keywords  — keywords being tracked
//  2. client_pages           — bucket-list focus keywords (+ search volume)
//  3. keyword_research       — researched keywords in results_json (+ SV/KD/CPC)
// Dedupes per client (case-insensitive), keeps the best search volume and notes
// which source(s) each came from, then hands you a clean, Claude-ready export.

const norm = (s) => (s || '').toString().trim();
const key = (s) => norm(s).toLowerCase();

export default function KeywordExport() {
  const [loading, setLoading] = useState(true);
  const [byClient, setByClient] = useState({});   // { client: [{keyword, volume, kd, sources:[]}] }
  const [clientFilter, setClientFilter] = useState('all');
  const [format, setFormat] = useState('text');    // 'text' | 'csv'

  useEffect(() => {
    (async () => {
      setLoading(true);
      // agg: client -> Map(keyLower -> {keyword, volume, kd, sources:Set})
      const agg = {};
      const add = (client, keyword, { volume = null, kd = null, source }) => {
        const c = norm(client) || 'Unassigned';
        const k = key(keyword);
        if (!k) return;
        if (!agg[c]) agg[c] = new Map();
        const cur = agg[c].get(k) || { keyword: norm(keyword), volume: null, kd: null, sources: new Set() };
        if (volume != null && (cur.volume == null || volume > cur.volume)) cur.volume = volume;
        if (kd != null && cur.kd == null) cur.kd = kd;
        cur.sources.add(source);
        agg[c].set(k, cur);
      };

      // 1. Tracked keywords
      try {
        const { data } = await supabase.from('rank_tracker_keywords').select('client_name, keyword');
        (data || []).forEach(r => add(r.client_name, r.keyword, { source: 'tracked' }));
      } catch (e) { /* table may not exist yet */ }

      // 2. Bucket-list focus keywords
      try {
        const { data } = await supabase.from('client_pages').select('client_name, focus_keyword, search_volume');
        (data || []).forEach(r => add(r.client_name, r.focus_keyword, { volume: r.search_volume ?? null, source: 'bucket-list' }));
      } catch (e) { /* ignore */ }

      // 3. Keyword research results
      try {
        const { data } = await supabase.from('keyword_research').select('client_name, results_json');
        (data || []).forEach(r => {
          const list = r.results_json?.keywords || [];
          list.forEach(k => add(r.client_name, k.keyword, {
            volume: k.search_volume ?? null, kd: k.kd ?? null, source: 'research',
          }));
        });
      } catch (e) { /* ignore */ }

      // Finalise: arrays sorted by volume desc then alpha
      const out = {};
      Object.keys(agg).sort((a, b) => a.localeCompare(b)).forEach(c => {
        out[c] = [...agg[c].values()]
          .map(v => ({ ...v, sources: [...v.sources].sort() }))
          .sort((a, b) => (b.volume || 0) - (a.volume || 0) || a.keyword.localeCompare(b.keyword));
      });
      setByClient(out);
      setLoading(false);
    })();
  }, []);

  const clients = useMemo(() => Object.keys(byClient), [byClient]);
  const shown = useMemo(() => {
    if (clientFilter === 'all') return byClient;
    return { [clientFilter]: byClient[clientFilter] || [] };
  }, [byClient, clientFilter]);

  const totals = useMemo(() => {
    let kws = 0;
    Object.values(shown).forEach(list => { kws += list.length; });
    return { clients: Object.keys(shown).length, keywords: kws };
  }, [shown]);

  const buildText = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    let out = `KEYWORD EXPORT — ${stamp}\n`;
    out += `Purpose: use these keywords to build an SEO content plan.\n`;
    out += `Format: one section per client. Each line: keyword (SV = monthly search volume, KD = keyword difficulty) [source].\n\n`;
    Object.entries(shown).forEach(([client, list]) => {
      out += `## ${client}  (${list.length} keywords)\n`;
      list.forEach(k => {
        const bits = [];
        if (k.volume != null) bits.push(`SV: ${k.volume}`);
        if (k.kd != null) bits.push(`KD: ${k.kd}`);
        const meta = bits.length ? ` (${bits.join(', ')})` : '';
        out += `- ${k.keyword}${meta} [${k.sources.join(', ')}]\n`;
      });
      out += `\n`;
    });
    return out.trim();
  };

  const buildCsv = () => {
    const cell = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [['Client', 'Keyword', 'Search Volume', 'Difficulty', 'Sources'].join(',')];
    Object.entries(shown).forEach(([client, list]) => {
      list.forEach(k => rows.push([client, k.keyword, k.volume ?? '', k.kd ?? '', k.sources.join('; ')].map(cell).join(',')));
    });
    return rows.join('\n');
  };

  const preview = format === 'text' ? buildText() : buildCsv();

  const download = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const ext = format === 'text' ? 'txt' : 'csv';
    const mime = format === 'text' ? 'text/plain' : 'text/csv';
    const blob = new Blob([preview], { type: `${mime};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keywords-${clientFilter === 'all' ? 'all-clients' : clientFilter.replace(/\s+/g, '-').toLowerCase()}-${stamp}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Downloaded');
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(preview); toast.success('Copied to clipboard'); }
    catch { toast.error('Copy failed — select the text and copy manually'); }
  };

  return (
    <div className="p-5 max-w-[1000px] mx-auto">
      <div className="mb-4">
        <h1 className="text-[20px] font-bold text-[#1a1a1a] flex items-center gap-2">🔑 Keyword Export</h1>
        <p className="text-[12px] text-gray-500 mt-0.5">
          All keywords across every client — tracked keywords, bucket-list focus keywords, and keyword research — deduped and ready to paste into Claude for a content plan.
        </p>
      </div>

      {loading ? (
        <div className="text-[13px] text-gray-400 py-10 text-center">Pulling keywords from all clients…</div>
      ) : clients.length === 0 ? (
        <div className="text-[13px] text-gray-400 py-10 text-center">No keywords found yet.</div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
              className="text-[12px] px-2 py-2 rounded-md border border-gray-300 bg-white">
              <option value="all">All clients ({clients.length})</option>
              {clients.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex rounded-md border border-gray-300 overflow-hidden">
              <button onClick={() => setFormat('text')}
                className={`text-[12px] px-3 py-2 ${format === 'text' ? 'bg-[#1a1a1a] text-white' : 'bg-white text-gray-600'}`}>
                Text (for Claude)
              </button>
              <button onClick={() => setFormat('csv')}
                className={`text-[12px] px-3 py-2 border-l border-gray-300 ${format === 'csv' ? 'bg-[#1a1a1a] text-white' : 'bg-white text-gray-600'}`}>
                CSV
              </button>
            </div>
            <div className="flex-1" />
            <button onClick={copy} className="text-[12px] font-semibold px-3 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50">📋 Copy</button>
            <button onClick={download} className="text-[12px] font-bold px-3 py-2 rounded-md bg-[#F5C518] hover:brightness-95 text-[#1a1a1a]">⬇ Download .{format === 'text' ? 'txt' : 'csv'}</button>
          </div>

          <div className="text-[11px] text-gray-500 mb-2">
            {totals.clients} client{totals.clients === 1 ? '' : 's'} · {totals.keywords} unique keyword{totals.keywords === 1 ? '' : 's'}
          </div>

          <textarea readOnly value={preview}
            className="w-full h-[460px] text-[12px] font-mono px-3 py-2 rounded-lg border border-gray-200 bg-white leading-relaxed" />

          <div className="text-[11px] text-gray-400 mt-2">
            Tip: download the Text version, then upload it to Claude with a prompt like
            <span className="text-gray-600"> "Here are our keywords per client — build a 3-month SEO content plan grouped by client, prioritising by search volume and clustering related keywords into single articles."</span>
          </div>
        </>
      )}
    </div>
  );
}
