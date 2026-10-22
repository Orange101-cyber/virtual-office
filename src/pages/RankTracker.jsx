import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import { fetchAll } from '../lib/fetchAll';
import { CTR, estTraffic, cleanDomain, snapshotRow } from '../lib/rankParse';
import * as dfs from '../lib/dataForSeo';
import toast from 'react-hot-toast';

// Rank Tracker — a lightweight Wincher: track keywords per client, store a
// position snapshot per keyword per day, and chart the trend. Two views:
//   • Overview  — a card per client with KPIs + mini trend (computed in the DB)
//   • Dashboard — one client's keyword table, history/compare, competitors
// Rankings refresh automatically every morning (GitHub Actions, 5am Brisbane)
// and open pages update live as new snapshots land.

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

async function suggestForKeyword({ keyword, position, url, features, volume }) {
  if (!ANTHROPIC_KEY) throw new Error('Anthropic API key not configured');
  const system = `You are an SEO strategist specialising in AI search (Google AI Overviews + ChatGPT). Given a keyword, the client's current Google position, the page URL, and which SERP features appear, give 3 short, concrete, high-impact suggestions to help this page rank better — PRIORITISING getting cited in AI Overviews / AI answers. Be specific and actionable for a copywriter. Return ONLY a JSON array of 3 strings, no markdown.`;
  const user = `Keyword: "${keyword}"
Current Google position: ${position ?? 'not in top 100'}
Page: ${url || 'no ranking page'}
Monthly volume: ${volume ?? 'unknown'}
SERP features present: ${JSON.stringify(features || {})}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', output_config: { effort: 'low' }, fallbacks: 'default', max_tokens: 2000, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const j = await res.json();
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()); } catch { return [text]; }
}

const slug = (s = '') => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const shortUrl = (u = '') => u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
// Local (Brisbane/Manila) date, not UTC — so a 7am refresh counts as "today".
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const daysBefore = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const fmtDate = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const posColor = (p) => p == null || p > 30 ? 'text-red-500' : p <= 3 ? 'text-green-600' : p <= 10 ? 'text-lime-600' : 'text-orange-500';
const sameType = (a, b) => (a?.position_type || 'organic') === (b?.position_type || 'organic');

// Light columns for history — features/competitors are fetched separately, only
// for the snapshots on screen, because they're ~95% of the table's size.
const LIGHT = 'id,client_name,keyword,captured_on,position,position_type,rank_absolute,search_volume,est_traffic,url';
const LIGHT_LEGACY = 'id,client_name,keyword,captured_on,position,search_volume,est_traffic,url'; // before rank_tracker_v2.sql

async function loadSnapshots(filter) {
  const run = (cols) => fetchAll(() => {
    let q = supabase.from('rank_tracker_snapshots').select(cols);
    if (filter) q = filter(q);
    return q.order('captured_on', { ascending: true }).order('id');
  });
  let r = await run(LIGHT);
  if (r.error && /position_type|rank_absolute/.test(r.error.message || '')) r = await run(LIGHT_LEGACY);
  return r;
}

async function inBatches(items, size, fn, onTick) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const res = await Promise.all(items.slice(i, i + size).map(fn));
    out.push(...res);
    onTick?.(Math.min(i + size, items.length));
  }
  return out;
}

function downloadCsv(filename, headers, rows) {
  const esc = (c) => `"${String(c ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))];
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Compute a client's KPIs from its tracked keywords + snapshot history.
//   asOf      — show positions as they were on this date (default: latest)
//   compareTo — compare against this date (default: each keyword's previous snapshot)
function computeStats(keywords, snaps, { asOf = null, compareTo = null } = {}) {
  const byKw = new Map();
  for (const s of snaps) {
    if (asOf && s.captured_on > asOf) continue;
    if (!byKw.has(s.keyword)) byKw.set(s.keyword, []);
    byKw.get(s.keyword).push(s);
  }
  for (const list of byKw.values()) list.sort((a, b) => a.captured_on.localeCompare(b.captured_on));

  const rows = keywords.map(k => {
    const list = byKw.get(k.keyword) || [];
    const cur = list[list.length - 1] || null;
    let prev = null;
    if (compareTo) { for (const s of list) if (s.captured_on <= compareTo) prev = s; }
    else prev = list[list.length - 2] || null;
    if (prev && cur && prev.id === cur.id) prev = compareTo ? cur : null;
    const pos = cur?.position ?? null;
    const comparable = prev && cur && sameType(prev, cur);
    let ath = null;
    for (const s of list) if (s.position != null && sameType(s, cur) && (ath == null || s.position < ath)) ath = s.position;
    return {
      ...k,
      snapId: cur?.id || null,
      capturedOn: cur?.captured_on || null,
      position: pos,
      rankAbsolute: cur?.rank_absolute ?? null,
      legacy: cur?.position_type === 'absolute' || (cur && cur.position_type === undefined),
      prevPosition: comparable ? prev.position : null,
      prevDate: prev?.captured_on || null,
      url: cur?.url || '',
      volume: cur?.search_volume ?? null,
      est: cur ? (cur.est_traffic ?? estTraffic(pos, cur.search_volume)) : null,
      delta: (comparable && prev.position != null && pos != null) ? prev.position - pos : null, // +ve = improved
      ath,
    };
  });

  const ranked = rows.filter(r => r.position != null);
  const avgPosition = ranked.length ? (ranked.reduce((a, r) => a + r.position, 0) / ranked.length) : null;
  const buckets = { first: 0, p23: 0, p410: 0, p1130: 0, p30plus: 0 };
  rows.forEach(r => {
    const p = r.position;
    if (p == null || p > 30) buckets.p30plus++;
    else if (p === 1) buckets.first++;
    else if (p <= 3) buckets.p23++;
    else if (p <= 10) buckets.p410++;
    else buckets.p1130++;
  });
  const totalEst = rows.reduce((a, r) => a + (r.est || 0), 0);
  const improved = rows.filter(r => r.delta != null && r.delta > 0).length;
  const declined = rows.filter(r => r.delta != null && r.delta < 0).length;
  const sovNum = rows.reduce((a, r) => a + CTR(r.position) * (r.volume || 0), 0);
  const sovDen = rows.reduce((a, r) => a + CTR(1) * (r.volume || 0), 0);
  const shareOfVoice = sovDen ? (sovNum / sovDen) * 100 : 0;

  const perDate = {};
  for (const s of snaps) {
    if (asOf && s.captured_on > asOf) continue;
    const d = (perDate[s.captured_on] ||= { sum: 0, n: 0, count: 0 });
    d.count++;
    if (s.position != null) { d.sum += s.position; d.n++; }
  }
  const series = Object.keys(perDate).sort().map(d => ({ date: d, avg: perDate[d].n ? perDate[d].sum / perDate[d].n : null }));
  const latestDate = rows.reduce((m, r) => (r.capturedOn && r.capturedOn > (m || '') ? r.capturedOn : m), null);

  return { rows, avgPosition, buckets, totalEst, improved, declined, shareOfVoice, series, latestDate };
}

// Map the DB overview function's row to the same shape computeStats returns.
const statsFromRpc = (r) => ({
  avgPosition: r.avg_position != null ? Number(r.avg_position) : null,
  buckets: { first: r.b_first, p23: r.b_23, p410: r.b_410, p1130: r.b_1130, p30plus: r.b_30plus },
  totalEst: Number(r.total_est || 0), improved: r.improved, declined: r.declined,
  shareOfVoice: Number(r.share_of_voice || 0), series: r.series || [], latestDate: r.latest_date,
});

export default function RankTracker() {
  const { activeClients } = useClients();
  const [keywords, setKeywords] = useState([]);   // all tracked keywords (all clients)
  const [overview, setOverview] = useState({});   // client -> stats (overview cards)
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // null = overview
  const [refreshing, setRefreshing] = useState(null); // { client, done, total }
  const [showAdd, setShowAdd] = useState(false);
  const [live, setLive] = useState(false);
  const liveHandlers = useRef(new Set());

  const loadKeywords = useCallback(async () => {
    const r = await fetchAll(() => supabase.from('rank_tracker_keywords')
      .select('id,client_name,keyword,keyword_group,target_domain,device,created_at').order('client_name').order('id'));
    if (r.error) { toast.error('Could not load keywords: ' + r.error.message); return []; }
    setKeywords(r.data);
    return r.data;
  }, []);

  // Overview KPIs: computed server-side (rank_tracker_overview). If the DB
  // function isn't installed yet, fall back to computing in the browser.
  const loadOverview = useCallback(async (kws) => {
    const rpc = await supabase.rpc('rank_tracker_overview');
    if (!rpc.error) {
      const out = {};
      (rpc.data || []).forEach(r => { out[r.client_name] = statsFromRpc(r); });
      setOverview(out);
      return;
    }
    const sn = await loadSnapshots();
    if (sn.error) { toast.error('Could not load snapshots: ' + sn.error.message); return; }
    const out = {};
    const names = [...new Set((kws || []).map(k => k.client_name))];
    names.forEach(n => {
      out[n] = computeStats(kws.filter(k => k.client_name === n), sn.data.filter(s => s.client_name === n));
    });
    setOverview(out);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const kws = await loadKeywords();
    await loadOverview(kws);
    setLoading(false);
  }, [loadKeywords, loadOverview]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Live updates: new/updated snapshots (from the daily job, a teammate's
  // refresh, or ours) are pushed to every open Rank Tracker page.
  useEffect(() => {
    let timer = null;
    const ch = supabase.channel('rank-tracker-snapshots')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rank_tracker_snapshots' }, (payload) => {
        const row = payload.new;
        if (!row || !row.client_name) return;
        liveHandlers.current.forEach(fn => fn(row));
        clearTimeout(timer);
        timer = setTimeout(() => loadOverview(keywordsRef.current), 4000);
      })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => { clearTimeout(timer); supabase.removeChannel(ch); };
  }, [loadOverview]);
  const keywordsRef = useRef(keywords);
  useEffect(() => { keywordsRef.current = keywords; }, [keywords]);

  const trackedClients = useMemo(() => {
    const counts = {};
    keywords.forEach(k => { counts[k.client_name] = (counts[k.client_name] || 0) + 1; });
    return Object.keys(counts).sort((a, b) => a.localeCompare(b))
      .map(name => ({ name, count: counts[name], stats: overview[name] || null }));
  }, [keywords, overview]);

  const clientDomain = useCallback((name) => {
    const c = activeClients.find(x => x.name === name);
    const kw = keywords.find(k => k.client_name === name && k.target_domain);
    return cleanDomain(c?.website || c?.url || c?.domain || kw?.target_domain || '');
  }, [activeClients, keywords]);

  // ── Export (one client or all; latest positions or full history) ──
  const exportCsv = async ({ client = 'all', mode = 'latest' }) => {
    const t = toast.loading('Preparing export…');
    try {
      const names = client === 'all' ? trackedClients.map(c => c.name) : [client];
      const sn = await loadSnapshots(client === 'all' ? null : (q) => q.eq('client_name', client));
      if (sn.error) throw sn.error;
      const file = `rank-tracker-${client === 'all' ? 'all-clients' : slug(client)}-${mode}-${today()}.csv`;
      if (mode === 'history') {
        const kwInfo = {};
        keywords.forEach(k => { kwInfo[`${k.client_name}\u0000${k.keyword}`] = k; });
        const rows = sn.data
          .filter(s => names.includes(s.client_name) && kwInfo[`${s.client_name}\u0000${s.keyword}`])
          .map(s => [s.client_name, s.keyword, kwInfo[`${s.client_name}\u0000${s.keyword}`].keyword_group || '', s.captured_on,
            s.position == null ? '>100' : s.position, s.search_volume ?? '', s.est_traffic ?? '', s.url || '']);
        downloadCsv(file, ['Client', 'Keyword', 'Group', 'Date', 'Position', 'Volume', 'Est. traffic', 'Ranking page'], rows);
      } else {
        const rows = [];
        names.forEach(n => {
          const st = computeStats(keywords.filter(k => k.client_name === n), sn.data.filter(s => s.client_name === n));
          st.rows.forEach(r => rows.push([n, r.keyword, r.keyword_group || '',
            r.position == null ? '>100' : r.position,
            r.delta == null ? '' : (r.delta > 0 ? `+${r.delta}` : r.delta),
            r.volume ?? '', r.est ?? '', r.url || '', r.capturedOn || '']));
        });
        downloadCsv(file, ['Client', 'Keyword', 'Group', 'Position', 'Change', 'Volume', 'Est. traffic', 'Top ranking page', 'Last refreshed'], rows);
      }
      toast.success('Export ready', { id: t });
    } catch (e) { toast.error('Export failed: ' + e.message, { id: t }); }
  };

  // ── Add keywords (skips ones this client already tracks) ──
  const addKeywords = async (client, text, group, domain) => {
    const existing = new Set(keywords.filter(k => k.client_name === client).map(k => k.keyword.toLowerCase().trim()));
    const seen = new Set();
    const list = text.split('\n').map(s => s.trim()).filter(Boolean).filter(k => {
      const l = k.toLowerCase();
      if (seen.has(l)) return false;
      seen.add(l); return true;
    });
    if (!list.length) return toast.error('Enter at least one keyword');
    const fresh = list.filter(k => !existing.has(k.toLowerCase()));
    const skipped = list.length - fresh.length;
    if (!fresh.length) return toast(`All ${list.length} keyword${list.length > 1 ? 's are' : ' is'} already tracked`);
    const rows = fresh.map(keyword => ({
      client_name: client, keyword, keyword_group: group || null,
      target_domain: cleanDomain(domain) || null, device: 'desktop',
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('rank_tracker_keywords').insert(rows.slice(i, i + 500));
      if (error) { toast.error('Could not add: ' + error.message); break; }
    }
    toast.success(`Added ${rows.length} keyword${rows.length > 1 ? 's' : ''}${skipped ? ` · ${skipped} already tracked` : ''}`);
    setShowAdd(false);
    loadAll();
  };

  const removeKeyword = async (id) => {
    if (!confirm('Remove this keyword from tracking?')) return;
    await supabase.from('rank_tracker_keywords').delete().eq('id', id);
    loadAll();
  };

  // Pull the client's bucket-list focus keywords into tracking.
  const importFromBucket = async (client) => {
    const domain = clientDomain(client);
    const { data } = await fetchAll(() => supabase.from('client_pages').select('id,focus_keyword').eq('client_name', client).order('id'));
    const fromBucket = [...new Set((data || []).map(p => (p.focus_keyword || '').trim()).filter(Boolean))];
    if (!fromBucket.length) return toast('No bucket-list focus keywords for this client');
    await addKeywords(client, fromBucket.join('\n'), '', domain);
  };

  // ── Manual refresh (Live API, in the browser) ──
  // Only keywords not yet refreshed today, unless `all`. Writes in batches as
  // results come back, so the table fills in live.
  const refresh = async (client, { todo, competitors }) => {
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');
    const domain = clientDomain(client);
    if (!todo.length) return toast('Everything is already refreshed today');
    if (!domain && todo.some(k => !k.target_domain)) return toast.error('No target domain set — add keywords with a domain first');

    setRefreshing({ client, done: 0, total: todo.length });
    const day = today();
    let written = 0, failed = 0, buffer = [];
    const flush = async () => {
      if (!buffer.length) return;
      const batch = [...new Map(buffer.map(r => [r.keyword, r])).values()];
      buffer = [];
      const { error } = await supabase.from('rank_tracker_snapshots').upsert(batch, { onConflict: 'client_name,keyword,captured_on' });
      if (error) {
        failed += batch.length;
        if (/42P10|PGRST204|rank_absolute|competitors|position_type|ON CONFLICT/i.test(`${error.code} ${error.message}`)) {
          throw new Error('the database needs the Rank Tracker v2 update (supabase/rank_tracker_v2.sql)');
        }
      } else written += batch.length;
    };
    try {
      let volMap = {};
      try { volMap = await dfs.getSearchVolumeMap(todo.map(k => k.keyword)); } catch { /* volumes optional */ }
      await inBatches(todo, 8, async (k) => {
        try {
          const parsed = await dfs.getKeywordRank(k.keyword, cleanDomain(k.target_domain || domain), { device: k.device || 'desktop', competitors });
          buffer.push({ ...snapshotRow({ client_name: client, keyword: k.keyword, captured_on: day, parsed, volume: volMap[k.keyword.toLowerCase().trim()] ?? null }), position_type: 'organic' });
        } catch { failed++; } // API error ≠ "not ranking" — don't save a blank
      }, async (done) => {
        setRefreshing({ client, done, total: todo.length });
        if (buffer.length >= 24) await flush();
      });
      await flush();
      if (failed) toast.error(`Refreshed ${written} · ${failed} failed (try again later)`);
      else toast.success(`Refreshed ${written} keyword${written !== 1 ? 's' : ''}`);
    } catch (err) { toast.error('Refresh failed: ' + err.message); }
    setRefreshing(null);
    loadOverview(keywordsRef.current);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f8f8f6]">
      <div className="bg-[#1a1a1a] text-white px-4 h-9 flex items-center gap-3 shrink-0 border-t border-[#333]">
        <button onClick={() => setSelected(null)} className="text-xs font-semibold text-white/70 bg-transparent border-none cursor-pointer p-0 hover:text-[#F5C518]">Rank Tracker</button>
        {selected && <><span className="text-white/30">›</span><span className="text-[11px] text-[#F5C518] font-semibold">{selected}</span></>}
        <span className="ml-auto flex items-center gap-1 text-[10px] text-gray-400" title={live ? 'New rankings appear automatically' : 'Live updates unavailable — reload to see new data'}>
          <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-green-400' : 'bg-gray-500'}`} />{live ? 'Live' : 'Offline'}
        </span>
        <Link to="/seo-tools" className="text-[10px] text-gray-400 hover:text-[#F5C518] no-underline">← SEO Tools</Link>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-center py-10 text-[12px] text-gray-400">Loading…</div>
        ) : selected ? (
          <ClientDashboard
            client={selected}
            domain={clientDomain(selected)}
            keywords={keywords.filter(k => k.client_name === selected)}
            liveHandlers={liveHandlers}
            refreshing={refreshing?.client === selected ? refreshing : null}
            busy={!!refreshing}
            onRefresh={(opts) => refresh(selected, opts)}
            onAdd={() => setShowAdd(true)}
            onImport={() => importFromBucket(selected)}
            onRemove={removeKeyword}
          />
        ) : (
          <Overview
            trackedClients={trackedClients}
            allClients={activeClients}
            onOpen={setSelected}
            onAddClient={(name) => { setSelected(name); setShowAdd(true); }}
            onExport={exportCsv}
          />
        )}
      </div>

      {showAdd && (
        <AddKeywordsModal
          client={selected}
          allClients={activeClients}
          defaultDomain={selected ? clientDomain(selected) : ''}
          onClose={() => setShowAdd(false)}
          onAdd={addKeywords}
        />
      )}
    </div>
  );
}

// ── Export menu ──
function ExportMenu({ clients, defaultClient = 'all', onExport, label = '⬇ Export CSV' }) {
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState(defaultClient);
  const [mode, setMode] = useState('latest');
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="bg-white border border-gray-300 text-gray-700 rounded px-3 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-gray-400">
        {label} ▾
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-64 space-y-2">
          {clients && (
            <div>
              <label className="block text-[9px] font-bold uppercase text-gray-500 mb-1">Client</label>
              <select value={client} onChange={(e) => setClient(e.target.value)}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518]">
                <option value="all">All clients</option>
                {clients.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[9px] font-bold uppercase text-gray-500 mb-1">Data</label>
            <label className="flex items-center gap-1.5 text-[11px] text-gray-700"><input type="radio" checked={mode === 'latest'} onChange={() => setMode('latest')} /> Latest positions</label>
            <label className="flex items-center gap-1.5 text-[11px] text-gray-700"><input type="radio" checked={mode === 'history'} onChange={() => setMode('history')} /> Full history (every date)</label>
            {!clients && <label className="flex items-center gap-1.5 text-[11px] text-gray-700"><input type="radio" checked={mode === 'view'} onChange={() => setMode('view')} /> Current view (dates + competitors)</label>}
          </div>
          <button onClick={() => { setOpen(false); onExport({ client, mode }); }}
            className="w-full bg-[#F5C518] text-[#1a1a1a] border-none rounded px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800]">Download CSV</button>
        </div>
      )}
    </div>
  );
}

// ── Overview: client cards ──
function Overview({ trackedClients, allClients, onOpen, onAddClient, onExport }) {
  const [pick, setPick] = useState('');
  const untracked = allClients.filter(c => !trackedClients.find(t => t.name === c.name));
  const total = trackedClients.reduce((a, c) => a + c.count, 0);
  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="text-sm font-bold text-[#1a1a1a]">Websites</div>
        <div className="text-[10px] text-gray-400">{total.toLocaleString()} keywords · auto-refreshed daily at 5am (Brisbane)</div>
        <div className="ml-auto flex items-center gap-2">
          {trackedClients.length > 0 && <ExportMenu clients={trackedClients.map(c => c.name)} onExport={onExport} />}
          <select value={pick} onChange={(e) => setPick(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-white focus:outline-none focus:border-[#F5C518]">
            <option value="">+ Track a client…</option>
            {untracked.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <button onClick={() => pick && onAddClient(pick)} disabled={!pick}
            className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40">
            Add
          </button>
        </div>
      </div>

      {trackedClients.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-[12px] text-gray-500">
          No clients tracked yet. Pick a client above to start tracking keywords.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {trackedClients.map(tc => (
            <div key={tc.name} className="bg-white border border-gray-200 rounded-lg p-4 hover:border-[#F5C518] cursor-pointer" onClick={() => onOpen(tc.name)}>
              <div className="flex items-center gap-2 mb-3">
                <div className="text-[13px] font-bold text-[#1a1a1a]">{tc.name}</div>
                <div className="text-[10px] text-gray-400">· {tc.count} keywords{tc.stats?.latestDate ? ` · updated ${fmtDate(tc.stats.latestDate)}` : ''}</div>
                <button onClick={(e) => { e.stopPropagation(); onOpen(tc.name); }}
                  className="ml-auto bg-[#1a1a1a] text-white border-none rounded px-3 py-1 text-[10px] font-bold cursor-pointer hover:bg-[#333]">Dashboard →</button>
              </div>
              {tc.stats ? <CardKpis stats={tc.stats} /> : <div className="text-[11px] text-gray-400">No rankings yet.</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CardKpis({ stats }) {
  const s = stats;
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Metric label="Position changes" value={s.improved} delta={s.improved - s.declined} />
      <Metric label="Avg position" value={s.avgPosition != null ? s.avgPosition.toFixed(1) : '—'} chart={<Spark series={s.series} />} />
      <Metric label="Est. traffic" value={Math.round(s.totalEst).toLocaleString()} />
      <Metric label="Share of Voice" value={`${s.shareOfVoice.toFixed(2)}%`} />
      <div>
        <div className="text-[9px] font-bold uppercase text-gray-400 mb-1">First positions</div>
        <Bucket label="Pos 1" n={s.buckets.first} color="#16a34a" />
        <Bucket label="Pos 2-3" n={s.buckets.p23} color="#65a30d" />
        <Bucket label="Pos 4-10" n={s.buckets.p410} color="#ca8a04" />
        <Bucket label="Pos 11-30" n={s.buckets.p1130} color="#ea580c" />
        <Bucket label="Pos >30" n={s.buckets.p30plus} color="#dc2626" />
      </div>
    </div>
  );
}

function Metric({ label, value, delta, chart }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase text-gray-400 mb-1">{label}</div>
      <div className="flex items-center gap-1.5">
        <div className="text-xl font-bold text-[#1a1a1a]">{value}</div>
        {delta != null && delta !== 0 && (
          <span className={`text-[10px] font-bold ${delta > 0 ? 'text-green-600' : 'text-red-500'}`}>{delta > 0 ? '▲' : '▼'}{Math.abs(delta)}</span>
        )}
      </div>
      {chart}
    </div>
  );
}

function Bucket({ label, n, color }) {
  return (
    <div className="flex items-center justify-between text-[10px] leading-tight">
      <span className="flex items-center gap-1 text-gray-500"><span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{label}</span>
      <span className="font-semibold text-[#1a1a1a]">{n}</span>
    </div>
  );
}

// Mini sparkline of avg position (inverted so improving = up).
function Spark({ series }) {
  const pts = (series || []).filter(s => s.avg != null);
  if (pts.length < 2) return <div className="h-6" />;
  const vals = pts.map(p => Number(p.avg));
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const w = 90, h = 24;
  const d = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * w;
    const y = ((Number(p.avg) - min) / range) * h;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return <svg width={w} height={h} className="mt-1"><path d={d} fill="none" stroke="#7c6cf5" strokeWidth="1.5" /></svg>;
}

// ── Client dashboard ──
function ClientDashboard({ client, domain, keywords, liveHandlers, refreshing, busy, onRefresh, onAdd, onImport, onRemove }) {
  const [snaps, setSnaps] = useState([]);
  const [loadingSnaps, setLoadingSnaps] = useState(true);
  const [details, setDetails] = useState({});         // snapshot id -> { features, competitors }
  const [competitors, setCompetitors] = useState([]); // [{id, domain, label}]
  const [compTableMissing, setCompTableMissing] = useState(false);
  const [groupFilter, setGroupFilter] = useState('');
  const [search, setSearch] = useState('');
  const [asOf, setAsOf] = useState('');               // '' = latest
  const [compareTo, setCompareTo] = useState('');     // '' = previous snapshot
  const [suggestFor, setSuggestFor] = useState(null);
  const [featureView, setFeatureView] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [showComp, setShowComp] = useState(false);

  // History (light columns) for this client only.
  useEffect(() => {
    let on = true;
    setLoadingSnaps(true); setDetails({}); setAsOf(''); setCompareTo('');
    loadSnapshots((q) => q.eq('client_name', client)).then(r => {
      if (!on) return;
      if (r.error) toast.error('Could not load history: ' + r.error.message);
      setSnaps(r.data || []);
      setLoadingSnaps(false);
    });
    return () => { on = false; };
  }, [client]);

  const loadCompetitors = useCallback(async () => {
    const { data, error } = await supabase.from('rank_tracker_competitors').select('id,domain,label').eq('client_name', client).order('created_at');
    if (error) { setCompTableMissing(true); setCompetitors([]); return; }
    setCompTableMissing(false);
    setCompetitors(data || []);
  }, [client]);
  useEffect(() => { loadCompetitors(); }, [loadCompetitors]);

  // Merge live rows into the table as they arrive.
  useEffect(() => {
    const handler = (row) => {
      if (row.client_name !== client) return;
      setSnaps(prev => {
        const rest = prev.filter(s => s.id !== row.id && !(s.keyword === row.keyword && s.captured_on === row.captured_on));
        const light = {};
        LIGHT.split(',').forEach(c => { light[c] = row[c]; });
        return [...rest, light];
      });
      if (row.features || row.competitors) setDetails(d => ({ ...d, [row.id]: { features: row.features, competitors: row.competitors } }));
    };
    const set = liveHandlers.current;
    set.add(handler);
    return () => set.delete(handler);
  }, [client, liveHandlers]);

  const dates = useMemo(() => {
    const c = {};
    snaps.forEach(s => { c[s.captured_on] = (c[s.captured_on] || 0) + 1; });
    return Object.keys(c).sort().map(d => ({ date: d, count: c[d] }));
  }, [snaps]);

  const stats = useMemo(() => computeStats(keywords, snaps, { asOf: asOf || null, compareTo: compareTo || null }), [keywords, snaps, asOf, compareTo]);

  // Fetch features + competitor positions for the snapshots on screen.
  const requested = useRef(new Set());
  useEffect(() => { requested.current = new Set(); }, [client]);
  useEffect(() => {
    const need = stats.rows.map(r => r.snapId).filter(id => id && !(id in details) && !requested.current.has(id));
    if (!need.length) return;
    need.forEach(id => requested.current.add(id));
    (async () => {
      for (let i = 0; i < need.length; i += 150) {
        const ids = need.slice(i, i + 150);
        let r = await supabase.from('rank_tracker_snapshots').select('id,features,competitors').in('id', ids);
        if (r.error) r = await supabase.from('rank_tracker_snapshots').select('id,features').in('id', ids);
        const got = {};
        ids.forEach(id => { got[id] = { features: null, competitors: null }; });
        (r.data || []).forEach(x => { got[x.id] = { features: x.features, competitors: x.competitors || null }; });
        setDetails(d => ({ ...d, ...got }));
      }
    })();
  }, [stats.rows, details]);

  const groups = useMemo(() => [...new Set(keywords.map(k => k.keyword_group).filter(Boolean))].sort(), [keywords]);
  const compDomains = useMemo(() => competitors.map(c => cleanDomain(c.domain)), [competitors]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stats.rows
      .filter(x => !groupFilter || x.keyword_group === groupFilter)
      .filter(x => !q || x.keyword.toLowerCase().includes(q))
      .map(r => {
        const det = details[r.snapId] || {};
        return { ...r, features: det.features || null, compPos: det.competitors || null };
      })
      .sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
  }, [stats.rows, groupFilter, search, details]);

  // Competitor summary at the selected date (only keywords where we know their position).
  const compStats = useMemo(() => compDomains.map(d => {
    let known = 0, ranked = 0, sum = 0, top10 = 0, est = 0, beatUs = 0;
    rows.forEach(r => {
      if (!r.compPos) return;
      const e = r.compPos[d];
      if (e === undefined) return;
      known++;
      if (e.position != null) {
        ranked++; sum += e.position; if (e.position <= 10) top10++;
        est += estTraffic(e.position, r.volume) || 0;
        if (r.position == null || e.position < r.position) beatUs++;
      }
    });
    return { domain: d, known, avg: ranked ? sum / ranked : null, top10, est, beatUs };
  }), [compDomains, rows]);
  const usTop10 = rows.filter(r => r.position != null && r.position <= 10).length;

  // Domains that most often rank top 10 for this client's keywords.
  const suggestions = useMemo(() => {
    const freq = {};
    rows.forEach(r => Object.entries(r.compPos || {}).forEach(([d, v]) => {
      if (v?.position != null && v.position <= 10) freq[d] = (freq[d] || 0) + 1;
    }));
    const own = cleanDomain(domain);
    return Object.entries(freq)
      .filter(([d]) => d !== own && !d.endsWith('.' + own) && !compDomains.includes(d))
      .sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [rows, domain, compDomains]);

  const addCompetitor = async (raw) => {
    const d = cleanDomain(raw);
    if (!d || !d.includes('.')) return toast.error('Enter a domain like competitor.com.au');
    const { error } = await supabase.from('rank_tracker_competitors').insert({ client_name: client, domain: d });
    if (error) return toast.error(error.code === '23505' ? 'Already tracked' : 'Could not add: ' + error.message);
    toast.success(`Tracking ${d} — positions fill in from the next refresh (and from past data where it was in the top 20)`);
    loadCompetitors();
  };
  const removeCompetitor = async (id) => {
    await supabase.from('rank_tracker_competitors').delete().eq('id', id);
    loadCompetitors();
  };

  // Presets: compare with the snapshot closest to N days before the as-of date.
  const latest = dates[dates.length - 1]?.date || null;
  const effectiveAsOf = asOf || latest;
  const presetDate = (n) => {
    if (!effectiveAsOf) return '';
    const target = daysBefore(effectiveAsOf, n);
    let best = '';
    dates.forEach(d => { if (d.date <= target) best = d.date; });
    return best || dates[0]?.date || '';
  };

  const todayIso = today();
  const lastCheck = useMemo(() => {
    const m = {};
    snaps.forEach(s => { if (!m[s.keyword] || s.captured_on > m[s.keyword]) m[s.keyword] = s.captured_on; });
    return m;
  }, [snaps]);
  const staleCount = keywords.filter(k => lastCheck[k.keyword] !== todayIso).length;
  const doRefresh = () => {
    let todo = keywords.filter(k => lastCheck[k.keyword] !== todayIso);
    if (!todo.length) {
      if (!confirm(`All ${keywords.length} keywords were already checked today. Check them all again?`)) return;
      todo = keywords;
    }
    if (todo.length > 150 && !confirm(`Check ${todo.length} keywords now?\n\nThis uses the Live API, which costs more than the automatic 5am refresh, and takes a few minutes. You can keep working — the table updates as results come in.`)) return;
    onRefresh({ todo, competitors: compDomains });
  };

  const exportView = ({ mode }) => {
    const file = `rank-tracker-${slug(client)}-${mode}-${todayIso}.csv`;
    if (mode === 'history') {
      const info = {}; keywords.forEach(k => { info[k.keyword] = k; });
      const out = snaps.filter(s => info[s.keyword]).map(s => [client, s.keyword, info[s.keyword].keyword_group || '', s.captured_on, s.position == null ? '>100' : s.position, s.search_volume ?? '', s.est_traffic ?? '', s.url || '']);
      return downloadCsv(file, ['Client', 'Keyword', 'Group', 'Date', 'Position', 'Volume', 'Est. traffic', 'Ranking page'], out);
    }
    const withComp = mode === 'view';
    const headers = ['Client', 'Keyword', 'Group', `Position${effectiveAsOf ? ` (${effectiveAsOf})` : ''}`];
    if (withComp) headers.push(`Position (${compareTo || 'previous'})`);
    headers.push('Change', 'Volume', 'Est. traffic', 'Top ranking page', 'Date');
    if (withComp) compDomains.forEach(d => headers.push(d));
    const out = rows.map(r => {
      const line = [client, r.keyword, r.keyword_group || '', r.position == null ? '>100' : r.position];
      if (withComp) line.push(r.prevPosition ?? '');
      line.push(r.delta == null ? '' : (r.delta > 0 ? `+${r.delta}` : r.delta), r.volume ?? '', r.est ?? '', r.url || '', r.capturedOn || '');
      if (withComp) compDomains.forEach(d => { const e = r.compPos?.[d]; line.push(e === undefined ? '' : e.position == null ? '>100' : e.position); });
      return line;
    });
    downloadCsv(file, headers, out);
  };

  const anyLegacy = rows.some(r => r.legacy);

  return (
    <div>
      {/* Header actions */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="text-sm font-bold text-[#1a1a1a]">{client}</div>
        {domain && <span className="text-[11px] text-gray-400">{domain}</span>}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <ExportMenu onExport={exportView} label="⬇ Export" />
          <button onClick={onImport} className="bg-white border border-gray-300 text-gray-700 rounded px-3 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-gray-400" title="Pull this client's bucket-list focus keywords into tracking">📋 Import from bucket list</button>
          <button onClick={onAdd} className="bg-white border border-gray-300 text-gray-700 rounded px-3 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-gray-400">+ Add keywords</button>
          <button onClick={doRefresh} disabled={busy}
            title="Checks keywords that haven't been refreshed today. Rankings also refresh automatically every morning."
            className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40">
            {refreshing ? `Refreshing ${refreshing.done}/${refreshing.total}…` : busy ? 'Another refresh is running…' : `↻ Refresh now${staleCount ? ` (${staleCount})` : ''}`}
          </button>
        </div>
      </div>

      {/* History / compare */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <span className="text-[10px] font-bold uppercase text-[#F5C518] mr-1">History</span>
          <label className="text-gray-500">Show</label>
          <select value={asOf} onChange={(e) => setAsOf(e.target.value)} className="border border-gray-200 rounded px-2 py-1 bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518]">
            <option value="">Latest{latest ? ` (${fmtDate(latest)})` : ''}</option>
            {[...dates].reverse().map(d => <option key={d.date} value={d.date}>{fmtDate(d.date)} · {d.count} kw</option>)}
          </select>
          <label className="text-gray-500">compared with</label>
          <select value={compareTo} onChange={(e) => setCompareTo(e.target.value)} className="border border-gray-200 rounded px-2 py-1 bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518]">
            <option value="">Previous check</option>
            {[...dates].reverse().filter(d => !effectiveAsOf || d.date < effectiveAsOf).map(d => <option key={d.date} value={d.date}>{fmtDate(d.date)}</option>)}
          </select>
          {[7, 30, 90].map(n => (
            <button key={n} onClick={() => setCompareTo(presetDate(n))} disabled={dates.length < 2}
              className="bg-transparent border border-gray-300 rounded px-2 py-0.5 text-[10px] text-gray-600 cursor-pointer hover:border-[#F5C518] disabled:opacity-40">vs {n}d ago</button>
          ))}
          {(asOf || compareTo) && <button onClick={() => { setAsOf(''); setCompareTo(''); }} className="bg-transparent border-none text-[10px] text-gray-400 cursor-pointer hover:text-[#1a1a1a]">Reset</button>}
        </div>
        <Timeline dates={dates} asOf={effectiveAsOf} compareTo={compareTo} onPick={(d, shift) => shift ? setCompareTo(d === effectiveAsOf ? '' : d) : setAsOf(d === latest ? '' : d)} />
      </div>

      {/* KPIs */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <CardKpis stats={stats} />
        <div className="text-[10px] text-gray-400 mt-2">
          {stats.latestDate ? `Positions as of ${fmtDate(stats.latestDate)}` : 'No rankings yet'}
          {compareTo ? ` · changes vs ${fmtDate(compareTo)}` : ' · changes vs each keyword’s previous check'}
          {' · refreshes automatically every morning'}
        </div>
      </div>

      {/* Competitors */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-4">
        <button onClick={() => setShowComp(o => !o)} className="w-full px-4 py-2.5 bg-[#fafafa] border-none cursor-pointer flex items-center justify-between text-left">
          <div>
            <div className="text-[10px] font-bold uppercase text-[#F5C518]">Competitors · {competitors.length}</div>
            <div className="text-[11px] text-gray-500">Track rival domains on the same keywords. It costs nothing extra because positions come from the same Google check.</div>
          </div>
          <span className="text-[11px] text-gray-400">{showComp ? '▲' : '▼'}</span>
        </button>
        {showComp && (
          <CompetitorPanel
            missing={compTableMissing} competitors={competitors} compStats={compStats}
            us={{ domain, avg: stats.avgPosition, top10: usTop10, est: stats.totalEst }}
            suggestions={suggestions} onAdd={addCompetitor} onRemove={removeCompetitor}
          />
        )}
      </div>

      {/* AI Visibility via LLM Mentions API */}
      <AiVisibilityPanel client={client} domain={domain} />

      {/* Trend charts */}
      {stats.series.filter(s => s.avg != null).length >= 2 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <ChartCard title="Average position over time" hint="Lower is better — line rises as you improve">
            <BigSpark series={stats.series} />
          </ChartCard>
          <ChartCard title={`Position distribution (${asOf ? fmtDate(asOf) : 'now'})`}>
            <DistBar buckets={stats.buckets} />
          </ChartCard>
        </div>
      )}

      {/* Keyword table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-200 bg-[#fafafa] flex items-center gap-2 flex-wrap">
          <div className="text-[10px] font-bold uppercase text-[#F5C518]">{rows.length} Keywords</div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search keywords…"
            className="ml-auto border border-gray-200 rounded px-2 py-1 text-[11px] bg-white w-48 focus:outline-none focus:border-[#F5C518]" />
          {groups.length > 0 && (
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}
              className="border border-gray-200 rounded px-2 py-1 text-[11px] bg-white focus:outline-none focus:border-[#F5C518]">
              <option value="">All groups</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[900px]">
            <thead className="bg-[#fafafa] border-b border-gray-200">
              <tr className="text-left text-gray-500">
                <th className="px-3 py-2 font-bold uppercase text-[9px]">Keyword</th>
                <th className="px-3 py-2 font-bold uppercase text-[9px]">Group</th>
                <th className="px-3 py-2 font-bold uppercase text-[9px] text-center w-20" title="Organic position (SERP features like AI Overviews and maps aren't counted)">Position</th>
                {compareTo && <th className="px-3 py-2 font-bold uppercase text-[9px] text-center w-20">{fmtDate(compareTo)}</th>}
                <th className="px-3 py-2 font-bold uppercase text-[9px] text-center w-14">Change</th>
                <th className="px-3 py-2 font-bold uppercase text-[9px] text-center w-14" title="All-time high (best position ever)">ATH</th>
                {compDomains.map(d => <th key={d} className="px-3 py-2 font-bold uppercase text-[9px] text-center w-20 text-purple-600" title={d}>{d.split('.')[0]}</th>)}
                <th className="px-3 py-2 font-bold uppercase text-[9px]">SERP features</th>
                <th className="px-3 py-2 font-bold uppercase text-[9px] text-right w-14">Volume</th>
                <th className="px-3 py-2 font-bold uppercase text-[9px] text-right w-16">Est. traffic</th>
                <th className="px-3 py-2 font-bold uppercase text-[9px]">Top ranking page</th>
                <th className="px-3 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {loadingSnaps ? (
                <tr><td colSpan={12 + compDomains.length} className="px-3 py-8 text-center text-gray-400 text-[11px]">Loading history…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={12 + compDomains.length} className="px-3 py-8 text-center text-gray-400 text-[11px]">{keywords.length ? 'No keywords match.' : 'No keywords yet — click “+ Add keywords”, then “Refresh now”.'}</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-[#fafafa]">
                  <td className="px-3 py-2 font-medium text-[#1a1a1a]">
                    <button onClick={() => setHistoryFor(r)} className="bg-transparent border-none p-0 text-left cursor-pointer text-[#1a1a1a] hover:text-blue-600 font-medium" title="View ranking history">{r.keyword}</button>
                  </td>
                  <td className="px-3 py-2">{r.keyword_group ? <span className="text-[10px] bg-gray-100 rounded px-1.5 py-0.5 text-gray-600">{r.keyword_group}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className={`px-3 py-2 text-center font-bold ${posColor(r.position)}`} title={r.rankAbsolute != null && !r.legacy ? `Absolute position (counting SERP features): ${r.rankAbsolute}` : r.legacy ? 'Older check, so this position also counts SERP features' : ''}>
                    {r.capturedOn ? (r.position == null ? '>100' : r.position) : <span className="text-gray-300 font-normal">—</span>}{r.legacy && r.position != null && <sup className="text-gray-400 font-normal">*</sup>}
                  </td>
                  {compareTo && <td className={`px-3 py-2 text-center ${posColor(r.prevPosition)}`}>{r.prevDate ? (r.prevPosition ?? '>100') : <span className="text-gray-300">—</span>}</td>}
                  <td className="px-3 py-2 text-center">
                    {r.delta == null ? <span className="text-gray-300">—</span> :
                      r.delta === 0 ? <span className="text-gray-400">–</span> :
                        <span className={`text-[10px] font-bold ${r.delta > 0 ? 'text-green-600' : 'text-red-500'}`}>{r.delta > 0 ? '▲' : '▼'}{Math.abs(r.delta)}</span>}
                  </td>
                  <td className="px-3 py-2 text-center text-gray-500">{r.ath ?? '—'}</td>
                  {compDomains.map(d => {
                    const e = r.compPos?.[d];
                    const p = e?.position ?? null;
                    const beats = e !== undefined && p != null && (r.position == null || p < r.position);
                    return (
                      <td key={d} className={`px-3 py-2 text-center ${e === undefined ? 'text-gray-300' : posColor(p)} ${beats ? 'bg-red-50' : ''}`}
                        title={e === undefined ? 'Not recorded on this date' : e?.url ? shortUrl(e.url) : ''}>
                        {e === undefined ? '—' : p == null ? '>100' : p}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2"><Features f={r.features} onOpen={(label, entries) => setFeatureView({ label, entries })} /></td>
                  <td className="px-3 py-2 text-right">{r.volume != null ? r.volume.toLocaleString() : '—'}</td>
                  <td className="px-3 py-2 text-right">{r.est != null ? Math.round(r.est).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2">{r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="text-blue-600 no-underline">{shortUrl(r.url)}</a> : r.capturedOn ? <span className="text-gray-300 italic">not in top 100</span> : <span className="text-gray-300 italic">not checked yet</span>}</td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    <button onClick={() => setSuggestFor(r)} title="AI-search suggestions to rank better" className="text-gray-400 hover:text-[#F5C518] bg-transparent border-none cursor-pointer text-[13px] mr-1">💡</button>
                    <button onClick={() => onRemove(r.id)} className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer text-[12px]">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {anyLegacy && <div className="px-4 py-2 text-[10px] text-gray-400 border-t border-gray-100">* Checked before the accuracy update. These positions also counted AI Overviews, People Also Ask and map results, so they read lower than the true organic rank. They aren't compared with newer checks.</div>}
      </div>

      {suggestFor && <SuggestModal row={suggestFor} onClose={() => setSuggestFor(null)} />}
      {featureView && <FeatureModal label={featureView.label} entries={featureView.entries} onClose={() => setFeatureView(null)} />}
      {historyFor && <KeywordHistoryModal client={client} row={historyFor} snaps={snaps.filter(s => s.keyword === historyFor.keyword)} competitors={compDomains} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

// Day-by-day strip of every check — click to view that date, Shift+click to compare.
function Timeline({ dates, asOf, compareTo, onPick }) {
  if (!dates.length) return null;
  const max = Math.max(...dates.map(d => d.count));
  return (
    <div className="mt-2">
      <div className="flex items-end gap-[3px] overflow-x-auto pb-1">
        {dates.map(d => {
          const isA = d.date === asOf, isB = d.date === compareTo;
          return (
            <button key={d.date} onClick={(e) => onPick(d.date, e.shiftKey)}
              title={`${fmtDate(d.date)} · ${d.count} keywords checked\nClick: view this date · Shift+click: compare with it`}
              className={`shrink-0 w-3 rounded-sm border-none cursor-pointer p-0 ${isA ? 'bg-[#F5C518]' : isB ? 'bg-purple-500' : 'bg-gray-300 hover:bg-gray-400'}`}
              style={{ height: `${8 + (d.count / max) * 18}px` }} />
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-gray-400">
        <span>{fmtDate(dates[0].date)}</span>
        <span><span className="inline-block w-2 h-2 bg-[#F5C518] rounded-sm align-middle" /> showing · <span className="inline-block w-2 h-2 bg-purple-500 rounded-sm align-middle" /> compared · Shift+click to compare</span>
        <span>{fmtDate(dates[dates.length - 1].date)}</span>
      </div>
    </div>
  );
}

function CompRow({ name, avg, top10, est, extra, onX }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="px-3 py-1.5 font-medium text-[#1a1a1a]">{name}</td>
      <td className="px-3 py-1.5 text-center">{avg != null ? avg.toFixed(1) : '—'}</td>
      <td className="px-3 py-1.5 text-center">{top10}</td>
      <td className="px-3 py-1.5 text-right">{Math.round(est || 0).toLocaleString()}</td>
      <td className="px-3 py-1.5 text-center text-gray-500">{extra}</td>
      <td className="px-3 py-1.5 text-center">{onX && <button onClick={onX} className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer">×</button>}</td>
    </tr>
  );
}

function CompetitorPanel({ missing, competitors, compStats, us, suggestions, onAdd, onRemove }) {
  const [input, setInput] = useState('');
  if (missing) return <div className="p-4 text-[11px] text-gray-500">Competitor tracking will be available once the Rank Tracker database update (rank_tracker_v2.sql) has been applied.</div>;
  return (
    <div className="p-4">
      <div className="flex gap-2 mb-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { onAdd(input); setInput(''); } }}
          placeholder="competitor.com.au" className="border border-gray-200 rounded px-2.5 py-1.5 text-[12px] bg-[#f8f8f6] w-64 focus:outline-none focus:border-[#F5C518]" />
        <button onClick={() => { onAdd(input); setInput(''); }} className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800]">+ Track</button>
      </div>
      {suggestions.length > 0 && (
        <div className="mb-3 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-gray-400">Often in the top 10 for these keywords:</span>
          {suggestions.map(([d, n]) => (
            <button key={d} onClick={() => onAdd(d)} title={`Top 10 for ${n} keyword${n > 1 ? 's' : ''} — click to track`}
              className="text-[10px] bg-gray-100 hover:bg-purple-100 border-none rounded px-1.5 py-0.5 cursor-pointer text-gray-700">+ {d} <span className="text-gray-400">{n}</span></button>
          ))}
        </div>
      )}
      {competitors.length > 0 && (
        <table className="w-full text-[11px]">
          <thead><tr className="text-gray-500 text-[9px] uppercase border-b border-gray-200">
            <th className="px-3 py-1.5 text-left">Domain</th><th className="px-3 py-1.5">Avg position</th><th className="px-3 py-1.5">Top 10</th>
            <th className="px-3 py-1.5 text-right">Est. traffic</th><th className="px-3 py-1.5">Outranks you</th><th />
          </tr></thead>
          <tbody>
            <CompRow name={`${us.domain || 'You'} (you)`} avg={us.avg} top10={us.top10} est={us.est} extra="—" />
            {competitors.map(c => {
              const s = compStats.find(x => x.domain === cleanDomain(c.domain)) || {};
              return <CompRow key={c.id} name={c.domain} avg={s.avg ?? null} top10={s.top10 || 0} est={s.est} onX={() => onRemove(c.id)}
                extra={s.known ? `${s.beatUs} / ${s.known} kw` : 'after next refresh'} />;
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Per-keyword history: position over time (+ tracked competitors), and every check.
function KeywordHistoryModal({ client, row, snaps, competitors, onClose }) {
  const [compData, setCompData] = useState({}); // date -> competitors json
  useEffect(() => {
    if (!competitors.length) return;
    supabase.from('rank_tracker_snapshots').select('captured_on,competitors')
      .eq('client_name', client).eq('keyword', row.keyword).order('captured_on')
      .then(({ data, error }) => {
        if (error) return;
        const m = {}; (data || []).forEach(d => { m[d.captured_on] = d.competitors; }); setCompData(m);
      });
  }, [client, row.keyword, competitors.length]);

  const list = [...snaps].sort((a, b) => a.captured_on.localeCompare(b.captured_on));
  const COLORS = ['#7c3aed', '#db2777', '#0891b2', '#ea580c', '#65a30d'];
  const lines = [{ name: 'You', color: '#F5C518', pts: list.map(s => ({ date: s.captured_on, pos: s.position })) }];
  competitors.forEach((d, i) => lines.push({ name: d, color: COLORS[i % COLORS.length], pts: list.map(s => ({ date: s.captured_on, pos: compData[s.captured_on]?.[d]?.position ?? null })) }));

  const w = 560, h = 180, pad = 24;
  const n = list.length;
  const x = (i) => pad + (n <= 1 ? (w - 2 * pad) / 2 : (i / (n - 1)) * (w - 2 * pad));
  const allPos = lines.flatMap(l => l.pts.map(p => p.pos)).filter(p => p != null);
  const maxPos = Math.max(10, ...allPos, 1);
  const y = (p) => pad + ((Math.min(p ?? 101, 101) - 1) / (Math.max(maxPos, 1) + 1)) * (h - 2 * pad);

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <div className="text-[10px] font-bold uppercase text-[#F5C518]">Ranking history</div>
            <div className="text-[13px] font-semibold text-[#1a1a1a]">{row.keyword}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-[#1a1a1a] bg-transparent border-none text-xl cursor-pointer leading-none">×</button>
        </div>
        <div className="p-4 overflow-y-auto">
          {n === 0 ? <div className="text-[11px] text-gray-400 text-center py-6">No checks yet.</div> : (
            <>
              <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
                {[1, 10, 20, 50, 100].filter(p => p <= maxPos + 1).map(p => (
                  <g key={p}><line x1={pad} x2={w - pad} y1={y(p)} y2={y(p)} stroke="#eee" /><text x={2} y={y(p) + 3} fontSize="8" fill="#999">{p}</text></g>
                ))}
                {lines.map(l => {
                  const d = l.pts.map((p, i) => p.pos == null ? null : `${x(i).toFixed(1)},${y(p.pos).toFixed(1)}`);
                  const segs = []; let cur = [];
                  d.forEach(pt => { if (pt) cur.push(pt); else { if (cur.length) segs.push(cur); cur = []; } });
                  if (cur.length) segs.push(cur);
                  return (
                    <g key={l.name}>
                      {segs.map((s, i) => s.length > 1 ? <polyline key={i} points={s.join(' ')} fill="none" stroke={l.color} strokeWidth="2" /> : null)}
                      {l.pts.map((p, i) => p.pos != null && <circle key={i} cx={x(i)} cy={y(p.pos)} r="2.5" fill={l.color}><title>{`${l.name} · ${fmtDate(p.date)} · #${p.pos}`}</title></circle>)}
                    </g>
                  );
                })}
              </svg>
              <div className="flex flex-wrap gap-3 mt-1 mb-3">
                {lines.map(l => <span key={l.name} className="flex items-center gap-1 text-[10px] text-gray-600"><span className="w-2 h-2 rounded-full" style={{ background: l.color }} />{l.name}</span>)}
              </div>
              <table className="w-full text-[11px]">
                <thead><tr className="text-gray-500 text-[9px] uppercase border-b border-gray-200">
                  <th className="px-2 py-1 text-left">Date</th><th className="px-2 py-1">Position</th>
                  {competitors.map(d => <th key={d} className="px-2 py-1 text-purple-600">{d.split('.')[0]}</th>)}
                  <th className="px-2 py-1 text-right">Volume</th><th className="px-2 py-1 text-left">Page</th>
                </tr></thead>
                <tbody>
                  {[...list].reverse().map(s => (
                    <tr key={s.id} className="border-b border-gray-100">
                      <td className="px-2 py-1">{fmtDate(s.captured_on)}</td>
                      <td className={`px-2 py-1 text-center font-bold ${posColor(s.position)}`}>{s.position ?? '>100'}{s.position_type === 'absolute' && s.position != null && <sup className="text-gray-400 font-normal">*</sup>}</td>
                      {competitors.map(d => { const e = compData[s.captured_on]?.[d]; return <td key={d} className="px-2 py-1 text-center text-gray-600">{e === undefined ? '—' : e.position ?? '>100'}</td>; })}
                      <td className="px-2 py-1 text-right">{s.search_volume?.toLocaleString() ?? '—'}</td>
                      <td className="px-2 py-1 text-blue-600 truncate max-w-[200px]">{s.url ? shortUrl(s.url) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Compact SERP-feature badges — clickable to reveal the actual links.
function Features({ f, onOpen }) {
  if (!f) return <span className="text-gray-300">—</span>;
  const chip = (on, label, entries, title, cls) => {
    if (!on) return null;
    const has = entries && entries.length;
    return (
      <button key={label} onClick={() => has && onOpen(title, entries)} title={has ? `${title} — click for links` : title}
        className={`text-[9px] font-bold px-1 py-0.5 rounded border-none ${cls} ${has ? 'cursor-pointer hover:opacity-80' : 'cursor-default opacity-90'}`}>
        {label}{has ? ` ${entries.length}` : ''}
      </button>
    );
  };
  const aioLabel = f.ai_overview_cited ? `AIO✓${f.ai_overview_position ? '#' + f.ai_overview_position : ''}` : 'AIO';
  const items = [
    f.ai_overview && chip(true, aioLabel, f.ai_overview_sources,
      f.ai_overview_cited ? `AI Overview — you're cited${f.ai_overview_position ? ' at #' + f.ai_overview_position : ''}` : 'AI Overview references',
      f.ai_overview_cited ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'),
    chip(f.people_also_ask, 'PAA', f.paa, 'People Also Ask', 'bg-blue-50 text-blue-600'),
    chip(f.local_pack, 'Local', f.local, 'Local Pack', 'bg-amber-50 text-amber-700'),
    chip(f.discussions_forums, 'Forum', f.forums, 'Discussions & Forums', 'bg-teal-50 text-teal-700'),
    chip(f.images, 'Img', f.image_sources, 'Images', 'bg-pink-50 text-pink-600'),
  ].filter(Boolean);
  return items.length ? <div className="flex flex-wrap gap-1">{items}</div> : <span className="text-gray-300">—</span>;
}

// Modal listing the actual links/questions behind a SERP feature.
function FeatureModal({ label, entries, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="text-[13px] font-semibold text-[#1a1a1a]">{label}</div>
          <button onClick={onClose} className="text-gray-400 hover:text-[#1a1a1a] bg-transparent border-none text-xl cursor-pointer leading-none">×</button>
        </div>
        <div className="p-4 overflow-y-auto divide-y divide-gray-100">
          {(!entries || entries.length === 0) ? (
            <div className="text-[11px] text-gray-400 text-center py-4">No links captured — refresh rankings to populate.</div>
          ) : entries.map((e, i) => (
            <div key={i} className="py-2">
              <div className="text-[12px] font-medium text-[#1a1a1a]">{e.title || e.domain || 'result'}</div>
              {e.url ? (
                <a href={e.url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 no-underline break-all">{shortUrl(e.url)}</a>
              ) : e.domain ? <span className="text-[11px] text-gray-400">{e.domain}</span> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// AI-search suggestions modal for a keyword.
function SuggestModal({ row, onClose }) {
  const [loading, setLoading] = useState(true);
  const [tips, setTips] = useState([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    let on = true;
    suggestForKeyword({ keyword: row.keyword, position: row.position, url: row.url, features: row.features, volume: row.volume })
      .then(t => { if (on) { setTips(Array.isArray(t) ? t : [String(t)]); setLoading(false); } })
      .catch(e => { if (on) { setErr(e.message); setLoading(false); } });
    return () => { on = false; };
  }, [row]);
  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase text-[#F5C518]">AI-Search Suggestions</div>
            <div className="text-[13px] font-semibold text-[#1a1a1a]">{row.keyword}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-[#1a1a1a] bg-transparent border-none text-xl cursor-pointer leading-none">×</button>
        </div>
        <div className="p-5">
          {loading ? <div className="text-[12px] text-gray-400 text-center py-4">Thinking…</div>
            : err ? <div className="text-[12px] text-red-600">{err}</div>
              : <ul className="space-y-3">
                {tips.map((t, i) => (
                  <li key={i} className="flex gap-2 text-[12px] text-gray-700 leading-relaxed">
                    <span className="text-[#F5C518] font-bold shrink-0">{i + 1}.</span><span>{t}</span>
                  </li>
                ))}
              </ul>}
          <div className="text-[10px] text-gray-400 mt-4">Focused on winning AI Overview / AI-answer citations for this keyword.</div>
        </div>
      </div>
    </div>
  );
}

// Brand-level AI visibility — derived from the LLM Mentions search endpoint
// (the reliable one): how many AI answers we appear in, across Google AI
// Overviews + ChatGPT, and how often they cite the brand.
function AiVisibilityPanel({ client, domain }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const PLAT = [{ id: 'google', label: '🔎 Google AI' }, { id: 'chat_gpt', label: '💬 ChatGPT' }];

  const brandSlug = slug(client);
  const domSlug = slug(cleanDomain(domain || ''));
  const isOurs = (d) => {
    const ds = slug(cleanDomain(d));
    if (!ds) return false;
    if (domSlug && ds.includes(domSlug)) return true;
    return brandSlug.length >= 4 && ds.includes(brandSlug);
  };

  const run = async () => {
    if (!dfs.isConfigured()) return setErr('DataForSEO not configured');
    setLoading(true); setErr('');
    try {
      const out = {};
      for (const p of PLAT) {
        const ex = await dfs.getAiMentionExamples(client, { platform: p.id, limit: 25 }).catch(e => ({ _err: e.message }));
        if (ex && ex._err) { out[p.id] = { _err: ex._err }; continue; }
        const list = Array.isArray(ex) ? ex : [];
        const cited = list.filter(a =>
          (a.sources || []).some(s => isOurs(s.domain || s.url)) ||
          (client && (a.answer || '').toLowerCase().includes(client.toLowerCase()))
        ).length;
        out[p.id] = { analysed: list.length, cited, rate: list.length ? Math.round((cited / list.length) * 100) : 0 };
      }
      setData(out);
      const anyErr = out.google?._err || out.chat_gpt?._err;
      if (anyErr && !out.google?.analysed && !out.chat_gpt?.analysed) setErr(anyErr);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  const M = ({ label, value }) => (
    <div>
      <div className="text-[9px] font-bold uppercase text-gray-400">{label}</div>
      <div className="text-lg font-bold text-[#1a1a1a]">{typeof value === 'number' ? value.toLocaleString() : (value ?? '—')}</div>
    </div>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-4">
      <button onClick={() => { setOpen(o => !o); if (!data && !loading) run(); }}
        className="w-full px-4 py-2.5 bg-[#fafafa] border-none cursor-pointer flex items-center justify-between text-left">
        <div>
          <div className="text-[10px] font-bold uppercase text-[#F5C518]">AI Visibility · LLM Mentions</div>
          <div className="text-[11px] text-gray-500">How often AI answers cite this brand — Google AI Overviews + ChatGPT</div>
        </div>
        <span className="text-[11px] text-gray-400">{loading ? '…' : open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="p-4">
          {err && <div className="text-[11px] text-red-600 mb-2">API note: {err}</div>}
          {!data && loading && <div className="text-[11px] text-gray-400">Loading…</div>}
          {data && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PLAT.map(p => {
                const d = data[p.id] || {};
                return (
                  <div key={p.id} className="border border-gray-100 rounded-lg p-3">
                    <div className="text-[12px] font-bold text-[#1a1a1a] mb-2">{p.label}</div>
                    {d._err ? <div className="text-[11px] text-gray-400">No data</div>
                      : d.analysed === 0 ? <div className="text-[11px] text-gray-400">No AI answers found in this brand’s space yet.</div>
                        : (
                          <div className="grid grid-cols-3 gap-2">
                            <M label="AI Answers" value={d.analysed} />
                            <M label="Cite You" value={d.cited} />
                            <M label="Cite Rate" value={`${d.rate}%`} />
                          </div>
                        )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-3 mt-3">
            <button onClick={run} disabled={loading} className="text-[10px] font-semibold text-gray-500 hover:text-[#1a1a1a] bg-transparent border border-gray-300 rounded px-2 py-1 cursor-pointer disabled:opacity-40">↻ Refresh</button>
            <Link to="/ai-visibility" className="text-[10px] text-gray-400 hover:text-[#F5C518] no-underline">Full AI Visibility →</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, hint, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-[10px] font-bold uppercase text-[#F5C518]">{title}</div>
      {hint && <div className="text-[10px] text-gray-400 mb-2">{hint}</div>}
      {children}
    </div>
  );
}

function BigSpark({ series }) {
  const pts = (series || []).filter(s => s.avg != null);
  if (pts.length < 2) return <div className="text-[11px] text-gray-400">Not enough history yet — refresh over a few days.</div>;
  const vals = pts.map(p => p.avg);
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const w = 100, h = 60;
  const d = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * w;
    const y = ((p.avg - min) / range) * h;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24" preserveAspectRatio="none">
        <path d={`${d} L${w},${h} L0,${h} Z`} fill="#7c6cf5" opacity="0.08" />
        <path d={d} fill="none" stroke="#7c6cf5" strokeWidth="1.5" />
      </svg>
      <div className="flex justify-between text-[9px] text-gray-400 mt-1"><span>{pts[0].date}</span><span>best {min.toFixed(1)} · now {pts[pts.length - 1].avg.toFixed(1)}</span></div>
    </div>
  );
}

function DistBar({ buckets }) {
  const segs = [
    { n: buckets.first, color: '#16a34a', label: 'Pos 1' },
    { n: buckets.p23, color: '#65a30d', label: '2-3' },
    { n: buckets.p410, color: '#ca8a04', label: '4-10' },
    { n: buckets.p1130, color: '#ea580c', label: '11-30' },
    { n: buckets.p30plus, color: '#dc2626', label: '>30' },
  ];
  const total = segs.reduce((a, s) => a + s.n, 0) || 1;
  return (
    <div>
      <div className="flex h-6 rounded overflow-hidden">
        {segs.map((s, i) => s.n > 0 && <div key={i} style={{ width: `${(s.n / total) * 100}%`, background: s.color }} title={`${s.label}: ${s.n}`} />)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {segs.map((s, i) => (
          <span key={i} className="flex items-center gap-1 text-[10px] text-gray-600">
            <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />{s.label}: <b>{s.n}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Add keywords modal ──
function AddKeywordsModal({ client, allClients, defaultDomain, onClose, onAdd }) {
  const [targetClient, setTargetClient] = useState(client || '');
  const [text, setText] = useState('');
  const [group, setGroup] = useState('');
  const [domain, setDomain] = useState(defaultDomain || '');
  const count = text.split('\n').map(s => s.trim()).filter(Boolean).length;

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="text-sm font-semibold text-[#1a1a1a]">Add keywords to track</div>
          <button onClick={onClose} className="text-gray-400 hover:text-[#1a1a1a] bg-transparent border-none text-xl cursor-pointer leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          {!client && (
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Client</label>
              <select value={targetClient} onChange={(e) => setTargetClient(e.target.value)}
                className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-[12px] bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518]">
                <option value="">— select —</option>
                {allClients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Target domain</label>
              <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="abpower.com.au"
                className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-[12px] bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518]" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Group (optional)</label>
              <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. electrical"
                className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-[12px] bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518]" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Keywords (one per line)</label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7}
              placeholder={'airconditioning\nelectrician brisbane\nsolar installation'}
              className="w-full border border-gray-200 rounded px-2.5 py-2 text-[12px] font-mono bg-[#f8f8f6] resize-y focus:outline-none focus:border-[#F5C518]" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between bg-[#fafafa]">
          <div className="text-[10px] text-gray-500">{count} keyword{count !== 1 ? 's' : ''} · checked in the next 5am refresh, or hit “Refresh now”</div>
          <div className="flex gap-2">
            <button onClick={onClose} className="bg-transparent border border-gray-300 text-gray-600 rounded px-4 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-gray-400">Cancel</button>
            <button onClick={() => onAdd(client || targetClient, text, group, domain)} disabled={!count || !(client || targetClient)}
              className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-4 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40">
              Add {count || ''} keyword{count !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
