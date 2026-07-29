import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import toast from 'react-hot-toast';

// GSC Reporting — import a Google Search Console "Performance" CSV export per
// client, then surface what to write/improve: striking-distance opportunities,
// low-CTR title rewrites, and top performers. Feeds straight into the plan.

// Minimal CSV parser (handles quoted fields).
function parseCSV(text) {
  return text.split(/\r?\n/).filter(l => l.trim()).map(line => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') q = !q;
      else if (c === ',' && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim().replace(/^"|"$/g, ''));
  });
}
const num = (s) => parseInt((s || '0').replace(/[^0-9]/g, ''), 10) || 0;
const dec = (s) => parseFloat((s || '0').replace(/[^0-9.]/g, '')) || 0;

export default function GscReporting() {
  const { activeClients } = useClients();
  const [client, setClient] = useState('');
  const [queries, setQueries] = useState([]);
  const [pages, setPages] = useState([]);
  const [importedOn, setImportedOn] = useState(null);
  const [tab, setTab] = useState('opportunities');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState({});

  const clientNames = useMemo(() => activeClients.map(c => c.name).sort((a, b) => a.localeCompare(b)), [activeClients]);

  const load = useCallback(async (name) => {
    if (!name) { setQueries([]); setPages([]); setImportedOn(null); return; }
    const { data } = await supabase.from('gsc_metrics').select('*').eq('client_name', name);
    const rows = data || [];
    setQueries(rows.filter(r => r.kind === 'query'));
    setPages(rows.filter(r => r.kind === 'page'));
    setImportedOn(rows[0]?.imported_on || null);
  }, []);

  useEffect(() => { load(client); }, [client, load]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !client) { if (!client) toast.error('Pick a client first'); return; }
    setBusy(true);
    try {
      const rows = parseCSV(await file.text());
      if (rows.length < 2) throw new Error('CSV looks empty');
      const header = rows[0].map(h => h.toLowerCase());
      const kind = (header[0] || '').includes('page') ? 'page' : 'query';
      const ci = header.findIndex(h => h.includes('click'));
      const ii = header.findIndex(h => h.includes('impress'));
      const ti = header.findIndex(h => h.includes('ctr'));
      const pi = header.findIndex(h => h.includes('position'));
      const data = rows.slice(1).map(r => ({
        client_name: client, kind, term: r[0],
        clicks: ci >= 0 ? num(r[ci]) : 0,
        impressions: ii >= 0 ? num(r[ii]) : 0,
        ctr: ti >= 0 ? dec(r[ti]) : 0,
        position: pi >= 0 ? dec(r[pi]) : 0,
      })).filter(d => d.term);
      if (!data.length) throw new Error('No rows found — is this a GSC Performance export?');

      await supabase.from('gsc_metrics').delete().eq('client_name', client).eq('kind', kind);
      for (let i = 0; i < data.length; i += 500) {
        const { error } = await supabase.from('gsc_metrics').insert(data.slice(i, i + 500));
        if (error) throw error;
      }
      toast.success(`Imported ${data.length} ${kind === 'query' ? 'queries' : 'pages'}`);
      load(client);
    } catch (err) { toast.error('Import failed: ' + err.message); }
    setBusy(false);
  };

  // ── Insights from queries ──
  const kpis = useMemo(() => {
    const clicks = queries.reduce((a, q) => a + (q.clicks || 0), 0);
    const impr = queries.reduce((a, q) => a + (q.impressions || 0), 0);
    const wPos = queries.length ? queries.reduce((a, q) => a + (q.position || 0) * (q.impressions || 1), 0) / (impr || queries.length) : 0;
    return { clicks, impr, avgPos: wPos ? wPos.toFixed(1) : '—', ctr: impr ? ((clicks / impr) * 100).toFixed(1) : '0' };
  }, [queries]);

  // Striking distance: ranking 5–20, decent impressions, ranked by impressions.
  const opportunities = useMemo(() =>
    queries.filter(q => q.position >= 4.5 && q.position <= 20 && q.impressions >= 20)
      .sort((a, b) => b.impressions - a.impressions).slice(0, 40),
    [queries]);

  // High impressions but low CTR for their position → title/meta rewrite.
  const lowCtr = useMemo(() =>
    queries.filter(q => q.impressions >= 100 && q.position <= 10 && q.ctr < 2)
      .sort((a, b) => b.impressions - a.impressions).slice(0, 30),
    [queries]);

  const topQueries = useMemo(() => [...queries].sort((a, b) => b.clicks - a.clicks).slice(0, 30), [queries]);
  const topPages = useMemo(() => [...pages].sort((a, b) => b.clicks - a.clicks).slice(0, 30), [pages]);

  const addToPlan = async (q) => {
    if (!client) return;
    const now = new Date();
    const { error } = await supabase.from('content_plans').insert({
      client_name: client, quarter: `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`,
      month: now.toLocaleDateString('en-AU', { month: 'long' }), content_type: 'Blog',
      title: q.term, focus_keyword: q.term, status: 'Planned',
      search_volume: q.impressions || null, kd: null,
      is_refresh: q.position <= 20, // already ranking → likely a refresh/improve
    });
    if (error) return toast.error('Could not add: ' + error.message);
    setAdded(prev => ({ ...prev, [q.term]: true }));
    toast.success('Added to content plan');
  };

  const hasData = queries.length > 0 || pages.length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f8f8f6]">
      <div className="bg-[#1a1a1a] text-white px-4 h-9 flex items-center gap-3 shrink-0 border-t border-[#333]">
        <div className="text-xs font-semibold text-white/70">GSC Reporting</div>
        <div className="text-[11px] text-white/40">Import Search Console data · find what to write & improve</div>
        <Link to="/seo-tools" className="ml-auto text-[10px] text-gray-400 hover:text-[#F5C518] no-underline">← SEO Tools</Link>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Controls */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Client</label>
              <select value={client} onChange={e => setClient(e.target.value)}
                className="border border-gray-200 rounded px-2.5 py-1.5 text-[12px] bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518] min-w-[200px]">
                <option value="">— select a client —</option>
                {clientNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <label className={`text-[12px] font-bold rounded px-4 py-1.5 cursor-pointer ${client ? 'bg-[#F5C518] text-[#1a1a1a] hover:bg-[#e6b800]' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
              {busy ? 'Importing…' : '⬆ Import GSC CSV'}
              <input type="file" accept=".csv" className="hidden" disabled={!client || busy} onChange={onFile} />
            </label>
            {importedOn && <span className="text-[10px] text-gray-400">Last import: {importedOn}</span>}
            <div className="ml-auto text-[10px] text-gray-400 max-w-xs">
              In GSC → Performance → Export → download <b>Queries.csv</b> (and/or <b>Pages.csv</b>) and upload here.
            </div>
          </div>
        </div>

        {!hasData ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-[12px] text-gray-500">
            Pick a client and import their Search Console CSV to see clicks, impressions, and the highest-value pages to write or improve.
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              <Kpi label="Clicks" value={kpis.clicks} />
              <Kpi label="Impressions" value={kpis.impr} />
              <Kpi label="Avg CTR" value={`${kpis.ctr}%`} />
              <Kpi label="Avg Position" value={kpis.avgPos} />
            </div>

            {/* Tabs */}
            <div className="flex gap-1.5 mb-3">
              {[['opportunities', `Opportunities (${opportunities.length})`], ['ctr', `CTR Rewrites (${lowCtr.length})`], ['queries', 'Top Queries'], ['pages', `Pages (${pages.length})`]].map(([id, label]) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`px-3 py-1 rounded text-[11px] font-semibold border ${tab === id ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                  {label}
                </button>
              ))}
            </div>

            {tab === 'opportunities' && (
              <Panel title="Striking-distance opportunities" hint="Queries ranking positions 5–20 with real impressions — small improvements here win clicks fastest">
                <QTable rows={opportunities} added={added} onAdd={addToPlan} showAdd />
              </Panel>
            )}
            {tab === 'ctr' && (
              <Panel title="Low-CTR title/meta rewrites" hint="You already rank on page 1 but few people click — rewrite the title & meta description to lift CTR">
                <QTable rows={lowCtr} added={added} onAdd={addToPlan} showAdd />
              </Panel>
            )}
            {tab === 'queries' && (
              <Panel title="Top queries by clicks"><QTable rows={topQueries} added={added} onAdd={addToPlan} /></Panel>
            )}
            {tab === 'pages' && (
              <Panel title="Top pages by clicks">
                {pages.length === 0 ? <div className="p-4 text-[11px] text-gray-400">No Pages.csv imported yet — export the Pages table from GSC and upload it too.</div>
                  : <PTable rows={topPages} />}
              </Panel>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value }) {
  const v = typeof value === 'number' ? value.toLocaleString() : value;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3.5">
      <div className="text-[10px] font-bold uppercase text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-[#1a1a1a] mt-1">{v}</div>
    </div>
  );
}

function Panel({ title, hint, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 bg-[#fafafa]">
        <div className="text-[10px] font-bold uppercase text-[#F5C518]">{title}</div>
        {hint && <div className="text-[11px] text-gray-500">{hint}</div>}
      </div>
      <div className="overflow-x-auto max-h-[520px] overflow-y-auto">{children}</div>
    </div>
  );
}

const posColor = (p) => p <= 3 ? 'text-green-600' : p <= 10 ? 'text-lime-600' : p <= 20 ? 'text-orange-500' : 'text-red-500';

function QTable({ rows, added, onAdd, showAdd }) {
  if (!rows.length) return <div className="p-6 text-center text-[11px] text-gray-400">Nothing here for this import.</div>;
  return (
    <table className="w-full text-[11px] min-w-[620px]">
      <thead className="bg-[#fafafa] border-b border-gray-200 sticky top-0">
        <tr className="text-left text-gray-500">
          <th className="px-3 py-1.5 font-bold uppercase text-[9px]">Query</th>
          <th className="px-3 py-1.5 font-bold uppercase text-[9px] text-right w-16">Clicks</th>
          <th className="px-3 py-1.5 font-bold uppercase text-[9px] text-right w-20">Impr.</th>
          <th className="px-3 py-1.5 font-bold uppercase text-[9px] text-right w-14">CTR</th>
          <th className="px-3 py-1.5 font-bold uppercase text-[9px] text-center w-16">Pos.</th>
          {showAdd && <th className="px-3 py-1.5 w-24"></th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((q, i) => (
          <tr key={i} className="border-b border-gray-100 hover:bg-[#fafafa]">
            <td className="px-3 py-1.5 text-[#1a1a1a]">{q.term}</td>
            <td className="px-3 py-1.5 text-right font-semibold">{(q.clicks || 0).toLocaleString()}</td>
            <td className="px-3 py-1.5 text-right text-gray-500">{(q.impressions || 0).toLocaleString()}</td>
            <td className="px-3 py-1.5 text-right text-gray-500">{(q.ctr || 0).toFixed(1)}%</td>
            <td className={`px-3 py-1.5 text-center font-bold ${posColor(q.position)}`}>{q.position ? q.position.toFixed(1) : '—'}</td>
            {showAdd && (
              <td className="px-3 py-1.5 text-right">
                {added[q.term] ? <span className="text-[10px] text-gray-400">✓ Planned</span>
                  : <button onClick={() => onAdd(q)} className="text-[10px] font-bold text-[#1a1a1a] bg-[#F5C518] hover:bg-[#e6b800] rounded px-2 py-1 cursor-pointer border-none">+ Add to Plan</button>}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PTable({ rows }) {
  return (
    <table className="w-full text-[11px] min-w-[620px]">
      <thead className="bg-[#fafafa] border-b border-gray-200 sticky top-0">
        <tr className="text-left text-gray-500">
          <th className="px-3 py-1.5 font-bold uppercase text-[9px]">Page</th>
          <th className="px-3 py-1.5 font-bold uppercase text-[9px] text-right w-16">Clicks</th>
          <th className="px-3 py-1.5 font-bold uppercase text-[9px] text-right w-20">Impr.</th>
          <th className="px-3 py-1.5 font-bold uppercase text-[9px] text-right w-14">CTR</th>
          <th className="px-3 py-1.5 font-bold uppercase text-[9px] text-center w-16">Pos.</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p, i) => (
          <tr key={i} className="border-b border-gray-100 hover:bg-[#fafafa]">
            <td className="px-3 py-1.5"><a href={p.term} target="_blank" rel="noreferrer" className="text-blue-600 no-underline">{p.term.replace(/^https?:\/\//, '').replace(/^www\./, '')}</a></td>
            <td className="px-3 py-1.5 text-right font-semibold">{(p.clicks || 0).toLocaleString()}</td>
            <td className="px-3 py-1.5 text-right text-gray-500">{(p.impressions || 0).toLocaleString()}</td>
            <td className="px-3 py-1.5 text-right text-gray-500">{(p.ctr || 0).toFixed(1)}%</td>
            <td className={`px-3 py-1.5 text-center font-bold ${posColor(p.position)}`}>{p.position ? p.position.toFixed(1) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
