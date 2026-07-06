import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useClients } from '../hooks/useClients';
import * as dfs from '../lib/dataForSeo';
import toast from 'react-hot-toast';

// AI Visibility — measures how often a client's brand shows up in AI answers
// (Google AI Overviews + ChatGPT) via DataForSEO's LLM Mentions API. This is
// the visibility Wincher can't see: whether you're cited when AI answers a query.
//
// Everything shown is derived from the LLM Mentions "search" results (the real
// AI answers + the sources each answer cited), which is the reliable dataset.

const PLATFORMS = [
  { id: 'google', label: 'Google AI Overviews', icon: '🔎' },
  { id: 'chat_gpt', label: 'ChatGPT', icon: '💬' },
];

// Normalise a domain/brand to a comparable slug: lowercase, alnum only.
const slug = (s = '') => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const cleanDomain = (d = '') => d.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

export default function AIVisibility() {
  const { activeClients } = useClients();
  const [selectedClient, setSelectedClient] = useState('');
  const [brand, setBrand] = useState('');
  const [domain, setDomain] = useState('');
  const [platform, setPlatform] = useState('google');
  const [loading, setLoading] = useState(false);
  const [examples, setExamples] = useState([]);
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
    setExamples([]); setRan(false); setError('');
  };

  // Does a source domain belong to us? Match the brand slug OR the explicit domain.
  const brandSlug = slug(brand);
  const domainSlug = slug(cleanDomain(domain));
  const isOurSource = (d) => {
    const ds = slug(cleanDomain(d));
    if (!ds) return false;
    if (domainSlug && ds.includes(domainSlug)) return true;
    return brandSlug.length >= 4 && ds.includes(brandSlug);
  };

  // Enrich each example with a derived "cited" flag.
  const enriched = useMemo(() => examples.map(ex => {
    const citedInSources = (ex.sources || []).some(s => isOurSource(s.domain || s.url));
    const inAnswer = brand && (ex.answer || '').toLowerCase().includes(brand.toLowerCase());
    return { ...ex, cited: citedInSources || inAnswer };
  }), [examples, brand, domain]); // eslint-disable-line react-hooks/exhaustive-deps

  // Headline metrics derived from the answers.
  const analysed = enriched.length;
  const cited = enriched.filter(e => e.cited).length;
  const citeRate = analysed ? Math.round((cited / analysed) * 100) : 0;

  // "Who AI cites most" — frequency of every source domain across all answers.
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
    setLoading(true); setError(''); setExamples([]); setRan(false);
    try {
      const ex = await dfs.getAiMentionExamples(q, { platform, limit: 25 });
      setExamples(Array.isArray(ex) ? ex : []);
      setRan(true);
      toast.success('AI visibility loaded');
    } catch (err) {
      setError(err.message);
      toast.error('Lookup failed: ' + err.message);
    }
    setLoading(false);
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
              <select
                value={selectedClient}
                onChange={(e) => onPickClient(e.target.value)}
                className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-[12px] bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518]"
              >
                <option value="">— select a client —</option>
                {clientNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Brand / domain (matched in sources)</label>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Craftbuilt"
                className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-[12px] bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518]"
              />
            </div>
            <button
              onClick={run}
              disabled={loading}
              className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-4 py-1.5 text-[12px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40 whitespace-nowrap"
            >
              {loading ? 'Checking…' : 'Check AI Visibility'}
            </button>
          </div>

          <div className="flex items-center gap-3 mt-3">
            <span className="text-[10px] font-bold uppercase text-gray-500">Platform</span>
            <div className="flex gap-1.5">
              {PLATFORMS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  className={`px-3 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
                    platform === p.id
                      ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="domain (optional, e.g. craftbuilt.com.au)"
              className="ml-auto w-64 border border-gray-200 rounded px-2 py-1 text-[10px] bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518]"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-[11px] text-red-700">
            <strong>API error:</strong> {error}
          </div>
        )}

        {/* KPI tiles — derived from the answers analysed */}
        {ran && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Kpi label="AI Answers Analysed" value={analysed} hint="AI answers found in your topic space" />
            <Kpi label="Times You're Cited" value={cited} hint={`${brand || 'Brand'} appears as a source`} accent />
            <Kpi label="Citation Rate" value={`${citeRate}%`} hint="Share of answers that cite you" />
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
                    <div className="text-[12px] font-semibold text-[#1a1a1a]">{ex.question || '—'}</div>
                  </div>
                  {ex.answer && (
                    <div className="text-[11px] text-gray-600 mt-1.5 leading-relaxed line-clamp-4">{stripMd(ex.answer)}</div>
                  )}
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

          {/* Top domains derived from all cited sources */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200 bg-[#fafafa]">
              <div className="text-[10px] font-bold uppercase text-[#F5C518]">Who AI Cites Most</div>
              <div className="text-[11px] text-gray-500">Most-cited sources across these answers — your AI-era competitors</div>
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {topDomains.length === 0 ? (
                <div className="p-6 text-center text-[11px] text-gray-400">
                  {loading ? 'Loading…' : 'Cited domains will appear here.'}
                </div>
              ) : (
                <table className="w-full text-[11px]">
                  <thead className="bg-[#fafafa] border-b border-gray-200 sticky top-0">
                    <tr className="text-left text-gray-500">
                      <th className="px-3 py-1.5 font-bold uppercase text-[9px]">#</th>
                      <th className="px-3 py-1.5 font-bold uppercase text-[9px]">Domain</th>
                      <th className="px-3 py-1.5 font-bold uppercase text-[9px] text-right">Citations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDomains.map((d, i) => (
                      <tr key={i} className={`border-b border-gray-100 ${d.ours ? 'bg-[#F5C518]/10' : ''}`}>
                        <td className="px-3 py-1.5 text-gray-300">{i + 1}</td>
                        <td className="px-3 py-1.5">
                          {d.domain}
                          {d.ours && <span className="ml-1.5 text-[9px] font-bold text-[#1a1a1a] bg-[#F5C518]/40 px-1 rounded">YOU</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold">{d.mentions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <div className="text-[10px] text-gray-400 mt-4 leading-relaxed">
          Data from DataForSEO LLM Mentions API. AI answers change frequently — results are cached for 7 days.
          A source is counted as “yours” when its domain matches the brand name or the domain you enter above.
          Use the “Who AI Cites Most” list to spot competitors that get cited where you don’t, then plan content to close that gap.
        </div>
      </div>
    </div>
  );
}

// Light markdown/link stripping so answer previews read cleanly.
function stripMd(text = '') {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // [label](url) -> label
    .replace(/\[\[\d+\]\]\([^)]*\)/g, '')       // [[1]](url) citations
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
