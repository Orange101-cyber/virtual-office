import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import * as dfs from '../lib/dataForSeo';
import toast from 'react-hot-toast';

// AI Visibility — measures how often a client's brand shows up in AI answers
// (Google AI Overviews + ChatGPT) via DataForSEO's LLM Mentions API, and turns
// it into a copywriting to-do list: which questions to write/refresh so you get
// cited in AI answers. This is the visibility Wincher can't see.

const PLATFORMS = [
  { id: 'google', label: 'Google AI Overviews', icon: '🔎' },
  { id: 'chat_gpt', label: 'ChatGPT', icon: '💬' },
];

const slug = (s = '') => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const cleanDomain = (d = '') => d.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

// Word-overlap score between two phrases (for bucket-list matching).
function overlap(a = '', b = '') {
  const wa = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wb = b.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (!wa.size || !wb.length) return 0;
  const shared = wb.filter(w => wa.has(w)).length;
  return shared / Math.max(wa.size, wb.length);
}

export default function AIVisibility() {
  const { activeClients } = useClients();
  const [selectedClient, setSelectedClient] = useState('');
  const [brand, setBrand] = useState('');
  const [domain, setDomain] = useState('');
  const [platform, setPlatform] = useState('google');
  const [loading, setLoading] = useState(false);
  const [examples, setExamples] = useState([]);
  const [volumes, setVolumes] = useState({}); // lowercased question -> search volume
  const [pages, setPages] = useState([]); // client bucket-list pages
  const [added, setAdded] = useState({}); // question -> true once planned
  const [ran, setRan] = useState(false);
  const [error, setError] = useState('');

  const clientNames = useMemo(
    () => activeClients.map(c => c.name).sort((a, b) => a.localeCompare(b)),
    [activeClients]
  );

  const onPickClient = (name) => {
    setSelectedClient(name);
    setBrand(name);
    const c = activeClients.find(x => x.name === name);
    const url = c?.website || c?.url || c?.domain || '';
    setDomain(url ? cleanDomain(url) : '');
    setExamples([]); setVolumes({}); setPages([]); setAdded({}); setRan(false); setError('');
  };

  const brandSlug = slug(brand);
  const domainSlug = slug(cleanDomain(domain));
  const isOurSource = (d) => {
    const ds = slug(cleanDomain(d));
    if (!ds) return false;
    if (domainSlug && ds.includes(domainSlug)) return true;
    return brandSlug.length >= 4 && ds.includes(brandSlug);
  };

  const enriched = useMemo(() => examples.map(ex => {
    const citedInSources = (ex.sources || []).some(s => isOurSource(s.domain || s.url));
    const inAnswer = brand && (ex.answer || '').toLowerCase().includes(brand.toLowerCase());
    return {
      ...ex,
      cited: citedInSources || inAnswer,
      sv: volumes[(ex.question || '').toLowerCase().trim()] ?? null,
    };
  }), [examples, brand, domain, volumes]); // eslint-disable-line react-hooks/exhaustive-deps

  const analysed = enriched.length;
  const cited = enriched.filter(e => e.cited).length;
  const citeRate = analysed ? Math.round((cited / analysed) * 100) : 0;

  // Content opportunities: questions where you're NOT cited, ranked by search
  // volume, cross-referenced against the bucket list (refresh vs new).
  const opportunities = useMemo(() => {
    return enriched
      .filter(e => !e.cited && e.question)
      .map(e => {
        const match = pages.find(p => p.focus_keyword && overlap(p.focus_keyword, e.question) >= 0.5);
        return { ...e, bucketMatch: match || null };
      })
      .sort((a, b) => (b.sv || 0) - (a.sv || 0));
  }, [enriched, pages]);

  // Your cited pages: the exact URLs of yours that AI cites, with count.
  const yourCitedPages = useMemo(() => {
    const counts = {};
    enriched.forEach(ex => (ex.sources || []).forEach(s => {
      if (!isOurSource(s.domain || s.url)) return;
      const u = s.url || s.domain;
      if (!u) return;
      counts[u] = (counts[u] || 0) + 1;
    }));
    return Object.entries(counts).map(([url, n]) => ({ url, count: n })).sort((a, b) => b.count - a.count);
  }, [enriched]); // eslint-disable-line react-hooks/exhaustive-deps

  const topDomains = useMemo(() => {
    const counts = {};
    enriched.forEach(ex => (ex.sources || []).forEach(s => {
      const d = cleanDomain(s.domain || s.url || '');
      if (!d) return;
      counts[d] = (counts[d] || 0) + 1;
    }));
    return Object.entries(counts)
      .map(([d, n]) => ({ domain: d, mentions: n, ours: isOurSource(d) }))
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 15);
  }, [enriched]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');
    const q = (brand || selectedClient).trim();
    if (!q) return toast.error('Pick a client or enter a brand name');
    setLoading(true); setError(''); setExamples([]); setVolumes({}); setPages([]); setAdded({}); setRan(false);
    try {
      const ex = await dfs.getAiMentionExamples(q, { platform, limit: 25 });
      const list = Array.isArray(ex) ? ex : [];
      setExamples(list);
      setRan(true);

      // Enrich in parallel: search volume for the questions + bucket-list pages.
      const questions = [...new Set(list.map(e => (e.question || '').trim()).filter(Boolean))].slice(0, 40);
      const [svData, pageData] = await Promise.all([
        questions.length ? dfs.getSearchVolume(questions).catch(() => []) : Promise.resolve([]),
        selectedClient
          ? supabase.from('client_pages').select('url, focus_keyword, page_category').eq('client_name', selectedClient).then(r => r.data || []).catch(() => [])
          : Promise.resolve([]),
      ]);
      const volMap = {};
      (svData || []).forEach(d => { volMap[(d.keyword || '').toLowerCase().trim()] = d.search_volume || 0; });
      setVolumes(volMap);
      setPages(pageData || []);

      toast.success('AI visibility loaded');
    } catch (err) {
      setError(err.message);
      toast.error('Lookup failed: ' + err.message);
    }
    setLoading(false);
  };

  const addToPlan = async (opp) => {
    if (!selectedClient) return toast.error('Pick a client first to add to their plan');
    const now = new Date();
    const quarter = `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
    const existingUrl = opp.bucketMatch?.url || null;
    const payload = {
      client_name: selectedClient,
      quarter,
      month: now.toLocaleDateString('en-AU', { month: 'long' }),
      content_type: 'Blog',
      title: opp.question,
      focus_keyword: opp.question,
      status: 'Planned',
      search_volume: opp.sv ?? null,
      kd: null,
      existing_url: existingUrl,
      is_refresh: !!existingUrl,
    };
    const { error: err } = await supabase.from('content_plans').insert(payload);
    if (err) return toast.error('Could not add: ' + err.message);
    setAdded(prev => ({ ...prev, [opp.question]: true }));
    toast.success(existingUrl ? 'Added as a REFRESH to the content plan' : 'Added to content plan');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f8f8f6]">
      <div className="bg-[#1a1a1a] text-white px-4 h-9 flex items-center gap-3 shrink-0 border-t border-[#333]">
        <div className="text-xs font-semibold text-white/70">AI Visibility</div>
        <div className="text-[11px] text-white/40">Brand mentions in AI search · LLM Mentions API</div>
        <Link to="/seo-tools" className="ml-auto text-[10px] text-gray-400 hover:text-[#F5C518] no-underline">← SEO Tools</Link>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Controls */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
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
            <button onClick={run} disabled={loading}
              className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-4 py-1.5 text-[12px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40 whitespace-nowrap">
              {loading ? 'Checking…' : 'Check AI Visibility'}
            </button>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <span className="text-[10px] font-bold uppercase text-gray-500">Platform</span>
            <div className="flex gap-1.5">
              {PLATFORMS.map(p => (
                <button key={p.id} onClick={() => setPlatform(p.id)}
                  className={`px-3 py-1 rounded text-[11px] font-semibold border cursor-pointer ${platform === p.id ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
            <input value={domain} onChange={(e) => setDomain(e.target.value)}
              placeholder="domain (optional, e.g. craftbuilt.com.au)"
              className="ml-auto w-64 border border-gray-200 rounded px-2 py-1 text-[10px] bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518]" />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-[11px] text-red-700">
            <strong>API error:</strong> {error}
          </div>
        )}

        {/* KPI tiles */}
        {ran && (
          <div className="grid grid-cols-4 gap-3 mb-4">
            <Kpi label="AI Answers Analysed" value={analysed} hint="AI answers in your topic space" />
            <Kpi label="Times You're Cited" value={cited} hint={`${brand || 'Brand'} appears as a source`} accent />
            <Kpi label="Citation Rate" value={`${citeRate}%`} hint="Share of answers that cite you" />
            <Kpi label="Opportunities" value={opportunities.length} hint="Uncited questions to target" />
          </div>
        )}

        {/* Content Opportunities — the copywriting to-do list */}
        {ran && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-4">
            <div className="px-4 py-2.5 border-b border-gray-200 bg-[#fafafa] flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase text-[#F5C518]">Content Opportunities</div>
                <div className="text-[11px] text-gray-500">Questions where AI cites competitors but not you — ranked by search volume</div>
              </div>
              <div className="text-[10px] text-gray-400">{opportunities.length} to target</div>
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {opportunities.length === 0 ? (
                <div className="p-6 text-center text-[11px] text-gray-400">
                  {loading ? 'Loading…' : 'Nice — no obvious gaps in this batch. Try the other platform or a broader brand term.'}
                </div>
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
                          {o.bucketMatch ? (
                            <span className="text-[10px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">✎ Refresh existing page</span>
                          ) : (
                            <span className="text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">＋ New content</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {added[o.question] ? (
                            <span className="text-[10px] text-gray-400">✓ Planned</span>
                          ) : (
                            <button onClick={() => addToPlan(o)}
                              className="text-[10px] font-bold text-[#1a1a1a] bg-[#F5C518] hover:bg-[#e6b800] rounded px-2 py-1 cursor-pointer border-none">
                              + Add to Plan
                            </button>
                          )}
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
          {/* Example AI answers */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200 bg-[#fafafa]">
              <div className="text-[10px] font-bold uppercase text-[#F5C518]">Example AI Answers</div>
              <div className="text-[11px] text-gray-500">What AI says — and who it cites (your sources highlighted)</div>
            </div>
            <div className="max-h-[520px] overflow-y-auto divide-y divide-gray-100">
              {enriched.length === 0 ? (
                <div className="p-6 text-center text-[11px] text-gray-400">
                  {loading ? 'Loading…' : ran ? 'No AI answers found for this brand/topic.' : 'Run a check to see AI answers in this brand’s space.'}
                </div>
              ) : enriched.map((ex, i) => (
                <div key={i} className="p-3">
                  <div className="flex items-start gap-2">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${ex.cited ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                      {ex.cited ? '✓ CITED' : 'NOT CITED'}
                    </span>
                    <div className="text-[12px] font-semibold text-[#1a1a1a] flex-1">{ex.question || '—'}</div>
                    {ex.sv != null && <span className="text-[10px] text-gray-400 shrink-0">{ex.sv.toLocaleString()}/mo</span>}
                  </div>
                  {ex.answer && <div className="text-[11px] text-gray-600 mt-1.5 leading-relaxed line-clamp-4">{stripMd(ex.answer)}</div>}
                  {ex.sources?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {ex.sources.slice(0, 8).map((s, j) => {
                        const d = cleanDomain(s.domain || s.url || '');
                        const ours = isOurSource(d);
                        return (
                          <a key={j} href={s.url} target="_blank" rel="noreferrer"
                            className={`text-[9px] px-1.5 py-0.5 rounded no-underline ${ours ? 'bg-[#F5C518]/30 text-[#1a1a1a] font-bold' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                            {d || s.title || 'source'}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right column: your cited pages + who AI cites most */}
          <div className="flex flex-col gap-4">
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-200 bg-[#fafafa]">
                <div className="text-[10px] font-bold uppercase text-[#F5C518]">Your Cited Pages</div>
                <div className="text-[11px] text-gray-500">Pages of yours AI already cites — do more of this</div>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {yourCitedPages.length === 0 ? (
                  <div className="p-4 text-center text-[11px] text-gray-400">{loading ? 'Loading…' : 'None cited yet in this batch — the opportunities above show where to start.'}</div>
                ) : yourCitedPages.map((p, i) => (
                  <a key={i} href={p.url.startsWith('http') ? p.url : `https://${p.url}`} target="_blank" rel="noreferrer"
                    className="flex items-center justify-between px-3 py-2 border-b border-gray-100 text-[11px] no-underline hover:bg-[#fafafa]">
                    <span className="text-blue-600 truncate">{p.url.replace(/^https?:\/\//, '')}</span>
                    <span className="text-[10px] text-gray-400 shrink-0 ml-2">{p.count}×</span>
                  </a>
                ))}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-200 bg-[#fafafa]">
                <div className="text-[10px] font-bold uppercase text-[#F5C518]">Who AI Cites Most</div>
                <div className="text-[11px] text-gray-500">Your AI-era competitors for this topic</div>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {topDomains.length === 0 ? (
                  <div className="p-4 text-center text-[11px] text-gray-400">Cited domains will appear here.</div>
                ) : (
                  <table className="w-full text-[11px]">
                    <tbody>
                      {topDomains.map((d, i) => (
                        <tr key={i} className={`border-b border-gray-100 ${d.ours ? 'bg-[#F5C518]/10' : ''}`}>
                          <td className="px-3 py-1.5 text-gray-300 w-6">{i + 1}</td>
                          <td className="px-3 py-1.5">
                            {d.domain}
                            {d.ours && <span className="ml-1.5 text-[9px] font-bold text-[#1a1a1a] bg-[#F5C518]/40 px-1 rounded">YOU</span>}
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold w-14">{d.mentions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Copywriter guidance */}
        <AiReadiness />

        <div className="text-[10px] text-gray-400 mt-4 leading-relaxed">
          Data from DataForSEO LLM Mentions API + search volume. Results cached 7 days. A source counts as “yours” when its
          domain matches the brand name or the domain entered above. Add opportunities to the content plan, then write/refresh
          those pages to earn citations in AI answers.
        </div>
      </div>
    </div>
  );
}

function AiReadiness() {
  const [open, setOpen] = useState(false);
  const tips = [
    ['Answer the question in the first 1–2 sentences', 'AI lifts the direct answer — put it up top, before the preamble.'],
    ['Use a clear H2 that matches the question', 'Phrase headings as the actual question people ask.'],
    ['Add an FAQ block with concise Q&As', 'FAQ-structured content is disproportionately quoted by AI.'],
    ['Include specific numbers, prices, and dates', 'e.g. “$25,000–$60,000” — concrete figures get cited over vague claims.'],
    ['Cite a source or stat with a link', 'Signals trustworthiness; AI favours well-referenced pages.'],
    ['Add FAQ / Article schema markup', 'Structured data helps AI parse and attribute your content.'],
    ['Keep it current — show a recent updated date', 'AI prefers fresh pages; refresh cited-adjacent pages regularly.'],
    ['Be the local authority', 'Location-specific detail (suburb, city) wins local AI answers.'],
  ];
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mt-4">
      <button onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-2.5 bg-[#fafafa] border-none cursor-pointer flex items-center justify-between text-left">
        <div>
          <div className="text-[10px] font-bold uppercase text-[#F5C518]">How to Get Cited in AI Search</div>
          <div className="text-[11px] text-gray-500">Checklist for the copywriting team</div>
        </div>
        <span className="text-[11px] text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {tips.map(([t, d], i) => (
            <div key={i} className="flex gap-2">
              <span className="text-[#F5C518] font-bold text-[12px] leading-tight">✓</span>
              <div>
                <div className="text-[11px] font-semibold text-[#1a1a1a]">{t}</div>
                <div className="text-[10px] text-gray-500 leading-snug">{d}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function stripMd(text = '') {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[\d+\]\]\([^)]*\)/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
