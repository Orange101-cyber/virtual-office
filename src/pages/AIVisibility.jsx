import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import * as dfs from '../lib/dataForSeo';
import toast from 'react-hot-toast';

// AI Visibility — how often a client's pages are cited in AI answers
// (Google AI Overviews + ChatGPT) via DataForSEO's LLM Mentions API.
// Two modes:
//   • By Brand   — explore where the brand shows up + content opportunities
//   • Audit Pages — walk the bucket-list keywords and see, per page, whether AI
//                   cites us and at what position (the shift from clicks → AIO).

const PLATFORMS = [
  { id: 'google', label: 'Google AI Overviews', icon: '🔎' },
  { id: 'chat_gpt', label: 'ChatGPT', icon: '💬' },
];

const slug = (s = '') => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const cleanDomain = (d = '') => d.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
const shortUrl = (u = '') => u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

function overlap(a = '', b = '') {
  const wa = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wb = b.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (!wa.size || !wb.length) return 0;
  return wb.filter(w => wa.has(w)).length / Math.max(wa.size, wb.length);
}

// Run async work in small concurrent batches (keeps API usage sane, shows progress).
async function inBatches(items, size, fn, onTick) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const res = await Promise.all(chunk.map(fn));
    out.push(...res);
    onTick?.(Math.min(i + size, items.length));
  }
  return out;
}

export default function AIVisibility() {
  const { activeClients } = useClients();
  const [mode, setMode] = useState('brand'); // 'brand' | 'audit'
  const [selectedClient, setSelectedClient] = useState('');
  const [brand, setBrand] = useState('');
  const [domain, setDomain] = useState('');
  const [platform, setPlatform] = useState('google');
  const [pages, setPages] = useState([]); // client bucket-list pages

  // Brand mode
  const [loading, setLoading] = useState(false);
  const [examples, setExamples] = useState([]);
  const [volumes, setVolumes] = useState({});
  const [added, setAdded] = useState({});
  const [ran, setRan] = useState(false);
  const [error, setError] = useState('');

  // Audit mode
  const [auditLimit, setAuditLimit] = useState(20);
  const [auditRows, setAuditRows] = useState([]);
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditProgress, setAuditProgress] = useState(0);
  const [auditRan, setAuditRan] = useState(false);

  const clientNames = useMemo(
    () => activeClients.map(c => c.name).sort((a, b) => a.localeCompare(b)),
    [activeClients]
  );

  const loadPages = async (clientName) => {
    if (!clientName) return [];
    const { data } = await supabase.from('client_pages')
      .select('url, focus_keyword, page_category').eq('client_name', clientName);
    return data || [];
  };

  const onPickClient = async (name) => {
    setSelectedClient(name);
    setBrand(name);
    const c = activeClients.find(x => x.name === name);
    const url = c?.website || c?.url || c?.domain || '';
    setDomain(url ? cleanDomain(url) : '');
    setExamples([]); setVolumes({}); setAdded({}); setRan(false); setError('');
    setAuditRows([]); setAuditRan(false); setAuditProgress(0);
    setPages(await loadPages(name));
  };

  const brandSlug = slug(brand);
  const domainSlug = slug(cleanDomain(domain));
  const isOurSource = (d) => {
    const ds = slug(cleanDomain(d));
    if (!ds) return false;
    if (domainSlug && ds.includes(domainSlug)) return true;
    return brandSlug.length >= 4 && ds.includes(brandSlug);
  };

  // ── Brand mode derivations ──────────────────────────────────────────
  const enriched = useMemo(() => examples.map(ex => {
    const ourSource = (ex.sources || []).find(s => isOurSource(s.domain || s.url));
    const inAnswer = brand && (ex.answer || '').toLowerCase().includes(brand.toLowerCase());
    return {
      ...ex,
      cited: !!ourSource || inAnswer,
      ourUrl: ourSource?.url || '',
      ourPosition: ourSource?.position ?? null,
      sourceCount: (ex.sources || []).length,
      sv: volumes[(ex.question || '').toLowerCase().trim()] ?? null,
    };
  }), [examples, brand, domain, volumes]); // eslint-disable-line react-hooks/exhaustive-deps

  const analysed = enriched.length;
  const cited = enriched.filter(e => e.cited).length;
  const citeRate = analysed ? Math.round((cited / analysed) * 100) : 0;

  // Exact pages of ours that AI cites, with the query + position for each.
  const citedPages = useMemo(() =>
    enriched.filter(e => e.ourUrl).map(e => ({
      url: e.ourUrl, query: e.question, position: e.ourPosition, of: e.sourceCount, sv: e.sv,
    })).sort((a, b) => (a.position || 99) - (b.position || 99)),
    [enriched]);

  const opportunities = useMemo(() =>
    enriched.filter(e => !e.cited && e.question).map(e => {
      const match = pages.find(p => p.focus_keyword && overlap(p.focus_keyword, e.question) >= 0.5);
      return { ...e, bucketMatch: match || null };
    }).sort((a, b) => (b.sv || 0) - (a.sv || 0)),
    [enriched, pages]);

  const topDomains = useMemo(() => {
    const counts = {};
    enriched.forEach(ex => (ex.sources || []).forEach(s => {
      const d = cleanDomain(s.domain || s.url || '');
      if (d) counts[d] = (counts[d] || 0) + 1;
    }));
    return Object.entries(counts).map(([d, n]) => ({ domain: d, mentions: n, ours: isOurSource(d) }))
      .sort((a, b) => b.mentions - a.mentions).slice(0, 15);
  }, [enriched]); // eslint-disable-line react-hooks/exhaustive-deps

  const runBrand = async () => {
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');
    const q = (brand || selectedClient).trim();
    if (!q) return toast.error('Pick a client or enter a brand name');
    setLoading(true); setError(''); setExamples([]); setVolumes({}); setAdded({}); setRan(false);
    try {
      const ex = await dfs.getAiMentionExamples(q, { platform, limit: 25 });
      const list = Array.isArray(ex) ? ex : [];
      setExamples(list); setRan(true);
      const questions = [...new Set(list.map(e => (e.question || '').trim()).filter(Boolean))].slice(0, 40);
      const svData = questions.length ? await dfs.getSearchVolume(questions).catch(() => []) : [];
      const volMap = {}; (svData || []).forEach(d => { volMap[(d.keyword || '').toLowerCase().trim()] = d.search_volume || 0; });
      setVolumes(volMap);
      toast.success('AI visibility loaded');
    } catch (err) { setError(err.message); toast.error('Lookup failed: ' + err.message); }
    setLoading(false);
  };

  const addToPlan = async (opp) => {
    if (!selectedClient) return toast.error('Pick a client first');
    const now = new Date();
    const existingUrl = opp.bucketMatch?.url || null;
    const { error: err } = await supabase.from('content_plans').insert({
      client_name: selectedClient, quarter: `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`,
      month: now.toLocaleDateString('en-AU', { month: 'long' }), content_type: 'Blog',
      title: opp.question, focus_keyword: opp.question, status: 'Planned',
      search_volume: opp.sv ?? null, kd: null, existing_url: existingUrl, is_refresh: !!existingUrl,
    });
    if (err) return toast.error('Could not add: ' + err.message);
    setAdded(prev => ({ ...prev, [opp.question]: true }));
    toast.success(existingUrl ? 'Added as a REFRESH' : 'Added to content plan');
  };

  // ── Audit mode ──────────────────────────────────────────────────────
  const auditKeywords = useMemo(() => {
    const seen = new Set(); const out = [];
    pages.forEach(p => {
      const k = (p.focus_keyword || '').trim();
      if (k && !seen.has(k.toLowerCase())) { seen.add(k.toLowerCase()); out.push({ keyword: k, url: p.url }); }
    });
    return out;
  }, [pages]);

  const runAudit = async () => {
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');
    if (!selectedClient) return toast.error('Pick a client first');
    if (!auditKeywords.length) return toast.error('This client has no bucket-list pages with focus keywords');

    const targets = auditKeywords.slice(0, auditLimit);
    setAuditRunning(true); setAuditRan(false); setAuditRows([]); setAuditProgress(0);
    try {
      // Search volume for all audited keywords in one batch.
      const svData = await dfs.getSearchVolume(targets.map(t => t.keyword)).catch(() => []);
      const volMap = {}; (svData || []).forEach(d => { volMap[(d.keyword || '').toLowerCase().trim()] = d.search_volume || 0; });

      const rows = await inBatches(targets, 5, async (t) => {
        try {
          const answers = await dfs.getAiMentionExamples(t.keyword, { platform, limit: 8 });
          const list = Array.isArray(answers) ? answers : [];
          // Find the first answer where our domain is cited, and its position.
          let position = null, ourUrl = '', citedQuestion = '';
          for (const a of list) {
            const src = (a.sources || []).find(s => isOurSource(s.domain || s.url));
            if (src) { position = src.position; ourUrl = src.url; citedQuestion = a.question; break; }
          }
          // Who's cited most across these answers (top competitor).
          const dc = {};
          list.forEach(a => (a.sources || []).forEach(s => {
            const d = cleanDomain(s.domain || s.url || ''); if (d && !isOurSource(d)) dc[d] = (dc[d] || 0) + 1;
          }));
          const topCompetitor = Object.entries(dc).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
          return {
            keyword: t.keyword, page: t.url, sv: volMap[t.keyword.toLowerCase()] ?? null,
            aioPresent: list.length > 0, cited: position != null, position, ourUrl, citedQuestion, topCompetitor,
          };
        } catch {
          return { keyword: t.keyword, page: t.url, sv: volMap[t.keyword.toLowerCase()] ?? null, aioPresent: false, cited: false, position: null, error: true };
        }
      }, (done) => setAuditProgress(done));

      // Sort: cited first (by position), then present-but-uncited, then no AIO.
      rows.sort((a, b) => {
        if (a.cited !== b.cited) return a.cited ? -1 : 1;
        if (a.cited && b.cited) return (a.position || 99) - (b.position || 99);
        if (a.aioPresent !== b.aioPresent) return a.aioPresent ? -1 : 1;
        return (b.sv || 0) - (a.sv || 0);
      });
      setAuditRows(rows); setAuditRan(true);
      toast.success(`Audited ${rows.length} keywords`);
    } catch (err) { toast.error('Audit failed: ' + err.message); }
    setAuditRunning(false);
  };

  const auditStats = useMemo(() => {
    const total = auditRows.length;
    const cited = auditRows.filter(r => r.cited).length;
    const aio = auditRows.filter(r => r.aioPresent).length;
    return { total, cited, aio, rate: total ? Math.round((cited / total) * 100) : 0 };
  }, [auditRows]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f8f8f6]">
      <div className="bg-[#1a1a1a] text-white px-4 h-9 flex items-center gap-3 shrink-0 border-t border-[#333]">
        <div className="text-xs font-semibold text-white/70">AI Visibility</div>
        <div className="text-[11px] text-white/40">Where AI cites you · LLM Mentions API</div>
        <Link to="/seo-tools" className="ml-auto text-[10px] text-gray-400 hover:text-[#F5C518] no-underline">← SEO Tools</Link>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Mode + controls */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex gap-1.5 mb-3">
            {[['brand', 'By Brand'], ['audit', 'Audit Our Pages']].map(([id, label]) => (
              <button key={id} onClick={() => setMode(id)}
                className={`px-3 py-1 rounded text-[11px] font-bold border cursor-pointer ${mode === id ? 'bg-[#F5C518] text-[#1a1a1a] border-[#F5C518]' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Client</label>
              <select value={selectedClient} onChange={(e) => onPickClient(e.target.value)}
                className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-[12px] bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518]">
                <option value="">— select a client —</option>
                {clientNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Brand / domain (matched in sources)</label>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Craftbuilt"
                className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-[12px] bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518]" />
            </div>
            {mode === 'brand' ? (
              <button onClick={runBrand} disabled={loading}
                className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-4 py-1.5 text-[12px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40 whitespace-nowrap">
                {loading ? 'Checking…' : 'Check AI Visibility'}
              </button>
            ) : (
              <button onClick={runAudit} disabled={auditRunning}
                className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-4 py-1.5 text-[12px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40 whitespace-nowrap">
                {auditRunning ? `Auditing ${auditProgress}/${Math.min(auditLimit, auditKeywords.length)}…` : 'Run Page Audit'}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className="text-[10px] font-bold uppercase text-gray-500">Platform</span>
            <div className="flex gap-1.5">
              {PLATFORMS.map(p => (
                <button key={p.id} onClick={() => setPlatform(p.id)}
                  className={`px-3 py-1 rounded text-[11px] font-semibold border cursor-pointer ${platform === p.id ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
            {mode === 'audit' && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase text-gray-500">Keywords</span>
                <input type="number" min={1} max={50} value={auditLimit}
                  onChange={(e) => setAuditLimit(Math.max(1, Math.min(50, +e.target.value || 1)))}
                  className="w-16 border border-gray-200 rounded px-2 py-1 text-[11px] bg-[#f8f8f6]" />
                <span className="text-[10px] text-gray-400">of {auditKeywords.length} pages</span>
              </div>
            )}
            <input value={domain} onChange={(e) => setDomain(e.target.value)}
              placeholder="domain (optional)"
              className="ml-auto w-56 border border-gray-200 rounded px-2 py-1 text-[10px] bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518]" />
          </div>
          {mode === 'audit' && (
            <div className="text-[10px] text-gray-400 mt-2">Each keyword = one LLM Mentions lookup (cached 7 days). Auditing {Math.min(auditLimit, auditKeywords.length)} of this client’s {auditKeywords.length} pages.</div>
          )}
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-[11px] text-red-700"><strong>API error:</strong> {error}</div>}

        {/* ══ AUDIT MODE ══ */}
        {mode === 'audit' && (
          <>
            {auditRan && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                <Kpi label="Pages Audited" value={auditStats.total} hint="Bucket-list keywords checked" />
                <Kpi label="AI Overviews Present" value={auditStats.aio} hint="Keywords that trigger an AI answer" />
                <Kpi label="Pages Cited" value={auditStats.cited} hint="Where AI cites your page" accent />
                <Kpi label="Citation Rate" value={`${auditStats.rate}%`} hint="Share of audited pages cited" />
              </div>
            )}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-200 bg-[#fafafa]">
                <div className="text-[10px] font-bold uppercase text-[#F5C518]">Page Audit — {PLATFORMS.find(p => p.id === platform)?.label}</div>
                <div className="text-[11px] text-gray-500">Every bucket-list keyword: is there an AI answer, does it cite your page, and at what position</div>
              </div>
              <div className="overflow-x-auto">
                {!auditRan ? (
                  <div className="p-6 text-center text-[11px] text-gray-400">
                    {auditRunning ? `Auditing ${auditProgress}/${Math.min(auditLimit, auditKeywords.length)} keywords…` : 'Pick a client and run the audit to see where AI cites your pages.'}
                  </div>
                ) : (
                  <table className="w-full text-[11px] min-w-[720px]">
                    <thead className="bg-[#fafafa] border-b border-gray-200">
                      <tr className="text-left text-gray-500">
                        <th className="px-3 py-2 font-bold uppercase text-[9px]">Keyword</th>
                        <th className="px-3 py-2 font-bold uppercase text-[9px]">Your Page</th>
                        <th className="px-3 py-2 font-bold uppercase text-[9px] text-right w-16">Volume</th>
                        <th className="px-3 py-2 font-bold uppercase text-[9px] text-center w-20">AI Answer</th>
                        <th className="px-3 py-2 font-bold uppercase text-[9px] text-center w-24">Your Position</th>
                        <th className="px-3 py-2 font-bold uppercase text-[9px]">Top competitor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditRows.map((r, i) => (
                        <tr key={i} className={`border-b border-gray-100 ${r.cited ? 'bg-green-50/50' : ''}`}>
                          <td className="px-3 py-2 font-medium text-[#1a1a1a]">{r.keyword}</td>
                          <td className="px-3 py-2">
                            {r.page ? <a href={r.page.startsWith('http') ? r.page : `https://${r.page}`} target="_blank" rel="noreferrer" className="text-blue-600 no-underline">{shortUrl(r.page)}</a> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right">{r.sv != null ? r.sv.toLocaleString() : '—'}</td>
                          <td className="px-3 py-2 text-center">
                            {r.aioPresent ? <span className="text-[9px] text-gray-500">yes</span> : <span className="text-[9px] text-gray-300">none</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {r.cited
                              ? <span className="text-[10px] font-bold text-green-700 bg-green-100 rounded px-1.5 py-0.5">#{r.position}{r.ourUrl && r.ourUrl !== r.page ? '' : ''}</span>
                              : r.aioPresent
                                ? <span className="text-[10px] font-semibold text-orange-600">not cited</span>
                                : <span className="text-[10px] text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-500">{r.topCompetitor || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <div className="text-[10px] text-gray-400 mt-3 leading-relaxed">
              <strong>How to read this:</strong> “Your Position #2” means AI cited your page as the 2nd source in its answer.
              “Not cited” with an AI answer present = a page to improve (the competitor column shows who’s winning it).
              “None” = no AI Overview yet for that keyword. Re-run monthly to watch positions improve.
            </div>
          </>
        )}

        {/* ══ BRAND MODE ══ */}
        {mode === 'brand' && (
          <>
            {ran && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                <Kpi label="AI Answers Analysed" value={analysed} hint="AI answers in your topic space" />
                <Kpi label="Times You're Cited" value={cited} hint={`${brand || 'Brand'} appears as a source`} accent />
                <Kpi label="Citation Rate" value={`${citeRate}%`} hint="Share of answers that cite you" />
                <Kpi label="Opportunities" value={opportunities.length} hint="Uncited questions to target" />
              </div>
            )}

            {/* Pages you're cited for — exact page + query + position */}
            {ran && citedPages.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-4">
                <div className="px-4 py-2.5 border-b border-gray-200 bg-[#fafafa]">
                  <div className="text-[10px] font-bold uppercase text-[#F5C518]">Pages You're Cited For</div>
                  <div className="text-[11px] text-gray-500">The exact page AI cites, the query it answers, and your position</div>
                </div>
                <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
                  <table className="w-full text-[11px] min-w-[640px]">
                    <thead className="bg-[#fafafa] border-b border-gray-200 sticky top-0">
                      <tr className="text-left text-gray-500">
                        <th className="px-3 py-1.5 font-bold uppercase text-[9px]">Your Page (exact URL)</th>
                        <th className="px-3 py-1.5 font-bold uppercase text-[9px]">Query it answers</th>
                        <th className="px-3 py-1.5 font-bold uppercase text-[9px] text-right w-16">Volume</th>
                        <th className="px-3 py-1.5 font-bold uppercase text-[9px] text-center w-24">Position</th>
                      </tr>
                    </thead>
                    <tbody>
                      {citedPages.map((p, i) => (
                        <tr key={i} className="border-b border-gray-100 hover:bg-[#fafafa]">
                          <td className="px-3 py-1.5"><a href={p.url} target="_blank" rel="noreferrer" className="text-blue-600 no-underline">{shortUrl(p.url)}</a></td>
                          <td className="px-3 py-1.5 text-gray-600">{p.query}</td>
                          <td className="px-3 py-1.5 text-right">{p.sv != null ? p.sv.toLocaleString() : '—'}</td>
                          <td className="px-3 py-1.5 text-center">
                            <span className="text-[10px] font-bold text-green-700 bg-green-100 rounded px-1.5 py-0.5">#{p.position ?? '—'}{p.of ? ` of ${p.of}` : ''}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Opportunities */}
            {ran && (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-4">
                <div className="px-4 py-2.5 border-b border-gray-200 bg-[#fafafa] flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-[#F5C518]">Content Opportunities</div>
                    <div className="text-[11px] text-gray-500">Questions where AI cites competitors but not you — ranked by search volume</div>
                  </div>
                  <div className="text-[10px] text-gray-400">{opportunities.length} to target</div>
                </div>
                <div className="max-h-[320px] overflow-y-auto">
                  {opportunities.length === 0 ? (
                    <div className="p-6 text-center text-[11px] text-gray-400">{loading ? 'Loading…' : 'No obvious gaps in this batch.'}</div>
                  ) : (
                    <table className="w-full text-[11px]">
                      <thead className="bg-[#fafafa] border-b border-gray-200 sticky top-0">
                        <tr className="text-left text-gray-500">
                          <th className="px-3 py-1.5 font-bold uppercase text-[9px]">Question / topic</th>
                          <th className="px-3 py-1.5 font-bold uppercase text-[9px] text-right w-20">Volume</th>
                          <th className="px-3 py-1.5 font-bold uppercase text-[9px] w-40">Action</th>
                          <th className="px-3 py-1.5 w-24"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {opportunities.map((o, i) => (
                          <tr key={i} className="border-b border-gray-100 hover:bg-[#fafafa]">
                            <td className="px-3 py-2 text-[#1a1a1a]">{o.question}</td>
                            <td className="px-3 py-2 text-right font-semibold">{o.sv != null ? o.sv.toLocaleString() : '—'}</td>
                            <td className="px-3 py-2">
                              {o.bucketMatch
                                ? <span className="text-[10px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">✎ Refresh existing page</span>
                                : <span className="text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">＋ New content</span>}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {added[o.question]
                                ? <span className="text-[10px] text-gray-400">✓ Planned</span>
                                : <button onClick={() => addToPlan(o)} className="text-[10px] font-bold text-[#1a1a1a] bg-[#F5C518] hover:bg-[#e6b800] rounded px-2 py-1 cursor-pointer border-none">+ Add to Plan</button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-200 bg-[#fafafa]">
                  <div className="text-[10px] font-bold uppercase text-[#F5C518]">Example AI Answers</div>
                  <div className="text-[11px] text-gray-500">Your cited source shows the exact page + its position</div>
                </div>
                <div className="max-h-[520px] overflow-y-auto divide-y divide-gray-100">
                  {enriched.length === 0 ? (
                    <div className="p-6 text-center text-[11px] text-gray-400">{loading ? 'Loading…' : ran ? 'No AI answers found.' : 'Run a check to see AI answers.'}</div>
                  ) : enriched.map((ex, i) => (
                    <div key={i} className="p-3">
                      <div className="flex items-start gap-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${ex.cited ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                          {ex.cited ? (ex.ourPosition ? `✓ #${ex.ourPosition}` : '✓ CITED') : 'NOT CITED'}
                        </span>
                        <div className="text-[12px] font-semibold text-[#1a1a1a] flex-1">{ex.question || '—'}</div>
                        {ex.sv != null && <span className="text-[10px] text-gray-400 shrink-0">{ex.sv.toLocaleString()}/mo</span>}
                      </div>
                      {ex.ourUrl && (
                        <div className="text-[10px] text-green-700 mt-1">Cited page: <a href={ex.ourUrl} target="_blank" rel="noreferrer" className="underline">{shortUrl(ex.ourUrl)}</a> · position #{ex.ourPosition} of {ex.sourceCount}</div>
                      )}
                      {ex.answer && <div className="text-[11px] text-gray-600 mt-1.5 leading-relaxed line-clamp-3">{stripMd(ex.answer)}</div>}
                      {ex.sources?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {ex.sources.slice(0, 8).map((s, j) => {
                            const ours = isOurSource(s.domain || s.url);
                            return (
                              <a key={j} href={s.url} target="_blank" rel="noreferrer"
                                className={`text-[9px] px-1.5 py-0.5 rounded no-underline ${ours ? 'bg-[#F5C518]/30 text-[#1a1a1a] font-bold' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                {s.position ? `${s.position}. ` : ''}{ours ? shortUrl(s.url || s.domain) : cleanDomain(s.domain || s.url)}
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-200 bg-[#fafafa]">
                  <div className="text-[10px] font-bold uppercase text-[#F5C518]">Who AI Cites Most</div>
                  <div className="text-[11px] text-gray-500">Your AI-era competitors for this topic</div>
                </div>
                <div className="max-h-[520px] overflow-y-auto">
                  {topDomains.length === 0 ? (
                    <div className="p-4 text-center text-[11px] text-gray-400">Cited domains will appear here.</div>
                  ) : (
                    <table className="w-full text-[11px]">
                      <tbody>
                        {topDomains.map((d, i) => (
                          <tr key={i} className={`border-b border-gray-100 ${d.ours ? 'bg-[#F5C518]/10' : ''}`}>
                            <td className="px-3 py-1.5 text-gray-300 w-6">{i + 1}</td>
                            <td className="px-3 py-1.5">{d.domain}{d.ours && <span className="ml-1.5 text-[9px] font-bold text-[#1a1a1a] bg-[#F5C518]/40 px-1 rounded">YOU</span>}</td>
                            <td className="px-3 py-1.5 text-right font-semibold w-14">{d.mentions}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        <AiReadiness />
      </div>
    </div>
  );
}

function AiReadiness() {
  const [open, setOpen] = useState(false);
  const tips = [
    ['Answer the question in the first 1–2 sentences', 'AI lifts the direct answer — put it up top.'],
    ['Use an H2 that matches the exact question', 'Phrase headings as the question people ask.'],
    ['Add an FAQ block with concise Q&As', 'FAQ content is disproportionately quoted by AI.'],
    ['Include specific numbers, prices, dates', 'Concrete figures get cited over vague claims.'],
    ['Cite a source or stat with a link', 'AI favours well-referenced pages.'],
    ['Add FAQ / Article schema markup', 'Helps AI parse and attribute your content.'],
    ['Show a recent updated date', 'AI prefers fresh pages — refresh regularly.'],
    ['Be the local authority', 'Suburb/city detail wins local AI answers.'],
  ];
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mt-4">
      <button onClick={() => setOpen(o => !o)} className="w-full px-4 py-2.5 bg-[#fafafa] border-none cursor-pointer flex items-center justify-between text-left">
        <div>
          <div className="text-[10px] font-bold uppercase text-[#F5C518]">How to Get Cited in AI Search</div>
          <div className="text-[11px] text-gray-500">Checklist for the comms / copywriting team</div>
        </div>
        <span className="text-[11px] text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {tips.map(([t, d], i) => (
            <div key={i} className="flex gap-2">
              <span className="text-[#F5C518] font-bold text-[12px] leading-tight">✓</span>
              <div><div className="text-[11px] font-semibold text-[#1a1a1a]">{t}</div><div className="text-[10px] text-gray-500 leading-snug">{d}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function stripMd(text = '') {
  return text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[\[\d+\]\]\([^)]*\)/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

function Kpi({ label, value, hint, accent }) {
  const display = typeof value === 'number' ? value.toLocaleString() : (value ?? '—');
  return (
    <div className={`bg-white border rounded-lg p-3.5 ${accent ? 'border-[#F5C518]' : 'border-gray-200'}`}>
      <div className="text-[10px] font-bold uppercase text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-[#1a1a1a] mt-1">{display}</div>
      <div className="text-[10px] text-gray-400 mt-0.5">{hint}</div>
    </div>
  );
}
