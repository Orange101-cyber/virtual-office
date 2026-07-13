import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import * as dfs from '../lib/dataForSeo';
import toast from 'react-hot-toast';

// Rank Tracker — a lightweight Wincher: track keywords per client, store a
// position snapshot on each refresh, and chart the trend. Two views:
//   • Overview  — a card per client with KPIs + mini trend
//   • Dashboard — one client's keyword table, groups, KPIs and charts

const CTR = (pos) => {
  if (!pos) return 0;
  const t = { 1: .28, 2: .15, 3: .11, 4: .08, 5: .06, 6: .05, 7: .04, 8: .033, 9: .028, 10: .025 };
  if (pos <= 10) return t[pos];
  if (pos <= 20) return .015;
  if (pos <= 30) return .008;
  if (pos <= 50) return .004;
  if (pos <= 100) return .002;
  return 0;
};
const estTraffic = (pos, vol) => Math.round(CTR(pos) * (vol || 0));
const cleanDomain = (d = '') => d.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
const shortUrl = (u = '') => u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
const today = () => new Date().toISOString().slice(0, 10);

async function inBatches(items, size, fn, onTick) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const res = await Promise.all(items.slice(i, i + size).map(fn));
    out.push(...res);
    onTick?.(Math.min(i + size, items.length));
  }
  return out;
}

// Compute a client's KPIs from its tracked keywords + snapshot history.
function computeStats(keywords, snaps) {
  // Latest snapshot per keyword, plus the previous distinct date for deltas.
  const dates = [...new Set(snaps.map(s => s.captured_on))].sort();
  const latestDate = dates[dates.length - 1];
  const prevDate = dates[dates.length - 2];
  const latestByKw = {}, prevByKw = {};
  snaps.forEach(s => {
    if (s.captured_on === latestDate) latestByKw[s.keyword] = s;
    if (s.captured_on === prevDate) prevByKw[s.keyword] = s;
  });

  const rows = keywords.map(k => {
    const cur = latestByKw[k.keyword];
    const prev = prevByKw[k.keyword];
    const pos = cur?.position ?? null;
    return {
      ...k,
      position: pos,
      prevPosition: prev?.position ?? null,
      url: cur?.url || '',
      volume: cur?.search_volume ?? null,
      est: cur ? (cur.est_traffic ?? estTraffic(pos, cur.search_volume)) : null,
      delta: (prev?.position != null && pos != null) ? prev.position - pos : null, // +ve = improved
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

  // Trend series: avg position per date (for the mini chart).
  const series = dates.map(d => {
    const ps = snaps.filter(s => s.captured_on === d && s.position != null).map(s => s.position);
    return { date: d, avg: ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null };
  });

  return { rows, avgPosition, buckets, totalEst, improved, declined, shareOfVoice, series, latestDate };
}

export default function RankTracker() {
  const { activeClients } = useClients();
  const [keywords, setKeywords] = useState([]);   // all tracked keywords (all clients)
  const [snaps, setSnaps] = useState([]);         // all snapshots (all clients)
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // null = overview
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [groupFilter, setGroupFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [kwRes, snapRes] = await Promise.all([
      supabase.from('rank_tracker_keywords').select('*'),
      supabase.from('rank_tracker_snapshots').select('*').order('captured_on', { ascending: true }),
    ]);
    setKeywords(kwRes.data || []);
    setSnaps(snapRes.data || []);
    setLoading(false);
    if (kwRes.error) toast.error('Tables missing? Run supabase/rank_tracker_tables.sql. ' + kwRes.error.message);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Clients that have tracked keywords (for overview cards).
  const trackedClients = useMemo(() => {
    const names = [...new Set(keywords.map(k => k.client_name))];
    return names.map(name => {
      const kws = keywords.filter(k => k.client_name === name);
      const sn = snaps.filter(s => s.client_name === name);
      return { name, count: kws.length, stats: computeStats(kws, sn) };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [keywords, snaps]);

  const clientDomain = (name) => {
    const c = activeClients.find(x => x.name === name);
    const kw = keywords.find(k => k.client_name === name && k.target_domain);
    return cleanDomain(c?.website || c?.url || c?.domain || kw?.target_domain || '');
  };

  // ── Add keywords ──
  const addKeywords = async (client, text, group, domain) => {
    const list = [...new Set(text.split('\n').map(s => s.trim()).filter(Boolean))];
    if (!list.length) return toast.error('Enter at least one keyword');
    const rows = list.map(keyword => ({
      client_name: client, keyword, keyword_group: group || null,
      target_domain: cleanDomain(domain) || null, device: 'desktop',
    }));
    const { error } = await supabase.from('rank_tracker_keywords').insert(rows);
    if (error) return toast.error('Could not add: ' + error.message);
    toast.success(`Added ${rows.length} keyword${rows.length > 1 ? 's' : ''}`);
    setShowAdd(false);
    loadAll();
  };

  const removeKeyword = async (id) => {
    if (!confirm('Remove this keyword from tracking?')) return;
    await supabase.from('rank_tracker_keywords').delete().eq('id', id);
    loadAll();
  };

  // ── Refresh rankings (manual) ──
  const refresh = async (client) => {
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');
    const kws = keywords.filter(k => k.client_name === client);
    if (!kws.length) return toast.error('No keywords to refresh');
    const domain = clientDomain(client);
    if (!domain) return toast.error('No target domain set — add keywords with a domain first');

    setRefreshing(true); setProgress(0);
    const day = today();
    try {
      // Volumes in one batch.
      const svData = await dfs.getSearchVolume(kws.map(k => k.keyword)).catch(() => []);
      const volMap = {}; (svData || []).forEach(d => { volMap[(d.keyword || '').toLowerCase().trim()] = d.search_volume || 0; });

      await inBatches(kws, 5, async (k) => {
        let position = null, url = '';
        try {
          const r = await dfs.getKeywordRank(k.keyword, domain, { device: k.device });
          if (r) { position = r.position; url = r.url; }
        } catch { /* leave unranked */ }
        const vol = volMap[k.keyword.toLowerCase()] ?? null;
        // One row per keyword per day: clear today's then insert.
        await supabase.from('rank_tracker_snapshots')
          .delete().eq('client_name', client).eq('keyword', k.keyword).eq('captured_on', day);
        await supabase.from('rank_tracker_snapshots').insert({
          client_name: client, keyword: k.keyword, captured_on: day,
          position, url, search_volume: vol, est_traffic: estTraffic(position, vol),
        });
      }, (done) => setProgress(done));

      toast.success(`Refreshed ${kws.length} keywords`);
      await loadAll();
    } catch (err) { toast.error('Refresh failed: ' + err.message); }
    setRefreshing(false);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f8f8f6]">
      <div className="bg-[#1a1a1a] text-white px-4 h-9 flex items-center gap-3 shrink-0 border-t border-[#333]">
        <button onClick={() => setSelected(null)} className="text-xs font-semibold text-white/70 bg-transparent border-none cursor-pointer p-0 hover:text-[#F5C518]">Rank Tracker</button>
        {selected && <><span className="text-white/30">›</span><span className="text-[11px] text-[#F5C518] font-semibold">{selected}</span></>}
        <Link to="/seo-tools" className="ml-auto text-[10px] text-gray-400 hover:text-[#F5C518] no-underline">← SEO Tools</Link>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-center py-10 text-[12px] text-gray-400">Loading…</div>
        ) : selected ? (
          <ClientDashboard
            client={selected}
            domain={clientDomain(selected)}
            keywords={keywords.filter(k => k.client_name === selected)}
            snaps={snaps.filter(s => s.client_name === selected)}
            groupFilter={groupFilter} setGroupFilter={setGroupFilter}
            refreshing={refreshing} progress={progress}
            onRefresh={() => refresh(selected)}
            onAdd={() => setShowAdd(true)}
            onRemove={removeKeyword}
          />
        ) : (
          <Overview
            trackedClients={trackedClients}
            allClients={activeClients}
            onOpen={setSelected}
            onAddClient={(name) => { setSelected(name); setShowAdd(true); }}
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

// ── Overview: client cards ──
function Overview({ trackedClients, allClients, onOpen, onAddClient }) {
  const [pick, setPick] = useState('');
  const untracked = allClients.filter(c => !trackedClients.find(t => t.name === c.name));
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="text-sm font-bold text-[#1a1a1a]">Websites</div>
        <div className="ml-auto flex items-center gap-2">
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
                <div className="text-[10px] text-gray-400">· {tc.count} keywords</div>
                <button onClick={(e) => { e.stopPropagation(); onOpen(tc.name); }}
                  className="ml-auto bg-[#1a1a1a] text-white border-none rounded px-3 py-1 text-[10px] font-bold cursor-pointer hover:bg-[#333]">Dashboard →</button>
              </div>
              <CardKpis stats={tc.stats} />
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
      <Metric label="Est. traffic" value={s.totalEst.toLocaleString()} />
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
  const vals = pts.map(p => p.avg);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const w = 90, h = 24;
  const d = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * w;
    const y = ((p.avg - min) / range) * h; // lower position (better) -> smaller y = higher line
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return <svg width={w} height={h} className="mt-1"><path d={d} fill="none" stroke="#7c6cf5" strokeWidth="1.5" /></svg>;
}

// ── Client dashboard ──
function ClientDashboard({ client, domain, keywords, snaps, groupFilter, setGroupFilter, refreshing, progress, onRefresh, onAdd, onRemove }) {
  const stats = useMemo(() => computeStats(keywords, snaps), [keywords, snaps]);
  const groups = useMemo(() => [...new Set(keywords.map(k => k.keyword_group).filter(Boolean))].sort(), [keywords]);
  const rows = useMemo(() => {
    const r = groupFilter ? stats.rows.filter(x => x.keyword_group === groupFilter) : stats.rows;
    return [...r].sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
  }, [stats.rows, groupFilter]);

  const posColor = (p) => p == null || p > 30 ? 'text-red-500' : p <= 3 ? 'text-green-600' : p <= 10 ? 'text-lime-600' : 'text-orange-500';

  return (
    <div>
      {/* Header actions */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="text-sm font-bold text-[#1a1a1a]">{client}</div>
        {domain && <span className="text-[11px] text-gray-400">{domain}</span>}
        <div className="ml-auto flex items-center gap-2">
          {groups.length > 0 && (
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}
              className="border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-white focus:outline-none focus:border-[#F5C518]">
              <option value="">All groups</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          <button onClick={onAdd} className="bg-white border border-gray-300 text-gray-700 rounded px-3 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-gray-400">+ Add keywords</button>
          <button onClick={onRefresh} disabled={refreshing}
            className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40">
            {refreshing ? `Refreshing ${progress}/${keywords.length}…` : '↻ Refresh rankings'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <CardKpis stats={stats} />
        {stats.latestDate && <div className="text-[10px] text-gray-400 mt-2">Last refreshed: {stats.latestDate}</div>}
      </div>

      {/* Trend charts */}
      {stats.series.filter(s => s.avg != null).length >= 2 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <ChartCard title="Average position over time" hint="Lower is better — line rises as you improve">
            <BigSpark series={stats.series} />
          </ChartCard>
          <ChartCard title="Position distribution (now)">
            <DistBar buckets={stats.buckets} />
          </ChartCard>
        </div>
      )}

      {/* Keyword table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-200 bg-[#fafafa] flex items-center justify-between">
          <div className="text-[10px] font-bold uppercase text-[#F5C518]">{rows.length} Keywords</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[720px]">
            <thead className="bg-[#fafafa] border-b border-gray-200">
              <tr className="text-left text-gray-500">
                <th className="px-3 py-2 font-bold uppercase text-[9px]">Keyword</th>
                <th className="px-3 py-2 font-bold uppercase text-[9px]">Group</th>
                <th className="px-3 py-2 font-bold uppercase text-[9px] text-center w-24">Position</th>
                <th className="px-3 py-2 font-bold uppercase text-[9px] text-center w-16">Change</th>
                <th className="px-3 py-2 font-bold uppercase text-[9px] text-right w-16">Volume</th>
                <th className="px-3 py-2 font-bold uppercase text-[9px] text-right w-16">Est. traffic</th>
                <th className="px-3 py-2 font-bold uppercase text-[9px]">Top ranking page</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400 text-[11px]">No keywords yet — click “+ Add keywords”, then “Refresh rankings”.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-[#fafafa]">
                  <td className="px-3 py-2 font-medium text-[#1a1a1a]">{r.keyword}</td>
                  <td className="px-3 py-2">{r.keyword_group ? <span className="text-[10px] bg-gray-100 rounded px-1.5 py-0.5 text-gray-600">{r.keyword_group}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className={`px-3 py-2 text-center font-bold ${posColor(r.position)}`}>{r.position == null ? '>100' : r.position}</td>
                  <td className="px-3 py-2 text-center">
                    {r.delta == null ? <span className="text-gray-300">—</span> :
                      r.delta === 0 ? <span className="text-gray-400">–</span> :
                        <span className={`text-[10px] font-bold ${r.delta > 0 ? 'text-green-600' : 'text-red-500'}`}>{r.delta > 0 ? '▲' : '▼'}{Math.abs(r.delta)}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{r.volume != null ? r.volume.toLocaleString() : '—'}</td>
                  <td className="px-3 py-2 text-right">{r.est != null ? r.est.toLocaleString() : '—'}</td>
                  <td className="px-3 py-2">{r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="text-blue-600 no-underline">{shortUrl(r.url)}</a> : <span className="text-gray-300 italic">not in top 100</span>}</td>
                  <td className="px-3 py-2 text-center"><button onClick={() => onRemove(r.id)} className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer text-[12px]">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
          <div className="text-[10px] text-gray-500">{count} keyword{count !== 1 ? 's' : ''} · then hit “Refresh rankings”</div>
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
