import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useClients } from '../hooks/useClients';
import * as dfs from '../lib/dataForSeo';
import toast from 'react-hot-toast';

// AI Visibility — measures how often a client's brand shows up in AI answers
// (Google AI Overviews + ChatGPT) via DataForSEO's LLM Mentions API. This is
// the visibility Wincher can't see: whether you're cited when AI answers a query.

const PLATFORMS = [
  { id: 'google', label: 'Google AI Overviews', icon: '🔎' },
  { id: 'chat_gpt', label: 'ChatGPT', icon: '💬' },
];

export default function AIVisibility() {
  const { activeClients } = useClients();
  const [selectedClient, setSelectedClient] = useState('');
  const [brand, setBrand] = useState('');
  const [domain, setDomain] = useState('');
  const [platform, setPlatform] = useState('google');
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [examples, setExamples] = useState([]);
  const [topDomains, setTopDomains] = useState([]);
  const [error, setError] = useState('');

  const clientNames = useMemo(
    () => activeClients.map(c => c.name).sort((a, b) => a.localeCompare(b)),
    [activeClients]
  );

  const onPickClient = (name) => {
    setSelectedClient(name);
    setBrand(name); // brand defaults to the client name; user can refine
    const c = activeClients.find(x => x.name === name);
    const url = c?.website || c?.url || c?.domain || '';
    setDomain(url ? url.replace(/^https?:\/\//, '').replace(/\/$/, '') : '');
    // Reset results
    setMetrics(null); setExamples([]); setTopDomains([]); setError('');
  };

  const run = async () => {
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');
    const q = (brand || selectedClient).trim();
    if (!q) return toast.error('Pick a client or enter a brand name');

    setLoading(true);
    setError('');
    setMetrics(null); setExamples([]); setTopDomains([]);
    try {
      const [m, ex, td] = await Promise.all([
        dfs.getAiVisibilityMetrics(q, { platform, domain: domain || null }).catch(e => ({ _err: e.message })),
        dfs.getAiMentionExamples(q, { platform, limit: 10 }).catch(() => []),
        dfs.getAiTopDomains(q, { platform, limit: 15 }).catch(() => []),
      ]);
      if (m && m._err) setError(m._err);
      setMetrics(m && !m._err ? m : null);
      setExamples(Array.isArray(ex) ? ex : []);
      setTopDomains(Array.isArray(td) ? td : []);
      if (!m?._err) toast.success('AI visibility loaded');
    } catch (err) {
      setError(err.message);
      toast.error('Lookup failed: ' + err.message);
    }
    setLoading(false);
  };

  const cleanDomain = (d) => (d || '').replace(/^www\./, '');
  const isOurDomain = (d) => domain && cleanDomain(d) === cleanDomain(domain);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f8f8f6]">
      {/* Tool bar */}
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
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Brand name (as it appears in answers)</label>
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
            {domain && (
              <span className="text-[10px] text-gray-400 ml-auto">Domain: <span className="font-mono">{domain}</span></span>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-[11px] text-red-700">
            <strong>API error:</strong> {error}
            <div className="text-[10px] text-red-500 mt-1">If this is the first run, send me the exact message — the LLM Mentions response fields may need a small mapping tweak.</div>
          </div>
        )}

        {/* KPI tiles */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <Kpi label="AI Mentions" value={metrics.mentions} hint="Times the brand appears in AI answers" />
            <Kpi label="AI Search Volume" value={metrics.ai_search_volume} hint="Est. monthly AI queries in this space" />
            <Kpi label="Impressions" value={metrics.impressions} hint="Est. times shown in AI results" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
          {/* Example AI answers */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200 bg-[#fafafa]">
              <div className="text-[10px] font-bold uppercase text-[#F5C518]">Example AI Answers</div>
              <div className="text-[11px] text-gray-500">What AI says — and who it cites</div>
            </div>
            <div className="max-h-[520px] overflow-y-auto divide-y divide-gray-100">
              {examples.length === 0 ? (
                <div className="p-6 text-center text-[11px] text-gray-400">
                  {loading ? 'Loading…' : 'Run a check to see example AI answers that mention this brand.'}
                </div>
              ) : examples.map((ex, i) => (
                <div key={i} className="p-3">
                  <div className="flex items-start gap-2">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${ex.mentioned ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                      {ex.mentioned ? 'MENTIONED' : 'NOT CITED'}
                    </span>
                    <div className="text-[12px] font-semibold text-[#1a1a1a]">{ex.question || '—'}</div>
                  </div>
                  {ex.answer && (
                    <div className="text-[11px] text-gray-600 mt-1.5 leading-relaxed line-clamp-4">{ex.answer}</div>
                  )}
                  {ex.sources?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {ex.sources.slice(0, 6).map((s, j) => (
                        <a key={j} href={s.url} target="_blank" rel="noreferrer"
                          className={`text-[9px] px-1.5 py-0.5 rounded no-underline ${isOurDomain(s.domain) ? 'bg-[#F5C518]/25 text-[#1a1a1a] font-bold' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          {cleanDomain(s.domain) || s.title || 'source'}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Top domains in AI answers */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200 bg-[#fafafa]">
              <div className="text-[10px] font-bold uppercase text-[#F5C518]">Who AI Cites Most</div>
              <div className="text-[11px] text-gray-500">Your AI-era competitors for this topic</div>
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {topDomains.length === 0 ? (
                <div className="p-6 text-center text-[11px] text-gray-400">
                  {loading ? 'Loading…' : 'Top-cited domains will appear here.'}
                </div>
              ) : (
                <table className="w-full text-[11px]">
                  <thead className="bg-[#fafafa] border-b border-gray-200 sticky top-0">
                    <tr className="text-left text-gray-500">
                      <th className="px-3 py-1.5 font-bold uppercase text-[9px]">#</th>
                      <th className="px-3 py-1.5 font-bold uppercase text-[9px]">Domain</th>
                      <th className="px-3 py-1.5 font-bold uppercase text-[9px] text-right">Mentions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDomains.map((d, i) => (
                      <tr key={i} className={`border-b border-gray-100 ${isOurDomain(d.domain) ? 'bg-[#F5C518]/10' : ''}`}>
                        <td className="px-3 py-1.5 text-gray-300">{i + 1}</td>
                        <td className="px-3 py-1.5">
                          {cleanDomain(d.domain)}
                          {isOurDomain(d.domain) && <span className="ml-1.5 text-[9px] font-bold text-[#1a1a1a] bg-[#F5C518]/40 px-1 rounded">YOU</span>}
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
          Use this to spot where competitors get cited in AI answers but you don't, then plan content to close that gap.
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }) {
  const display = typeof value === 'number' ? value.toLocaleString() : (value ?? '—');
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3.5">
      <div className="text-[10px] font-bold uppercase text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-[#1a1a1a] mt-1">{display}</div>
      <div className="text-[10px] text-gray-400 mt-0.5">{hint}</div>
    </div>
  );
}
