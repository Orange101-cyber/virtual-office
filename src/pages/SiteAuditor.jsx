import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import * as dfs from '../lib/dataForSeo';
import toast from 'react-hot-toast';

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

// Current Google / SEO priorities the auditor should weigh. Editable — update
// this list when Google ships a notable core/spam/helpful-content update.
const CURRENT_PRIORITIES = `
- Helpful, people-first content (Helpful Content signals): thin, AI-spun, or
  purely SEO-driven pages get suppressed. Depth, first-hand experience, clear answers.
- E-E-A-T: demonstrate Experience, Expertise, Authoritativeness, Trust — author
  info, credentials, real business details, citations.
- Spam policies: no doorway pages, scaled low-value content, sneaky redirects,
  keyword stuffing, expired-domain abuse.
- Core Web Vitals / page experience: LCP < 2.5s, CLS < 0.1, fast mobile.
- AI Overviews: clear direct answers, FAQ blocks, structured data — win citations.
- Technical hygiene: one H1, unique titles/meta, canonicals, no broken links,
  crawlable, indexable, HTTPS, image alt text, internal linking.
`;

const IMPACT_COLOR = { High: 'bg-red-100 text-red-700', Medium: 'bg-orange-100 text-orange-700', Low: 'bg-gray-100 text-gray-500' };
const EFFORT_COLOR = { Quick: 'bg-green-100 text-green-700', Medium: 'bg-yellow-100 text-yellow-700', Large: 'bg-gray-100 text-gray-600' };
const cleanUrl = (u = '') => u.trim().replace(/\/$/, '');
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

async function callClaude(system, userText) {
  if (!ANTHROPIC_KEY) throw new Error('Anthropic API key not configured (VITE_ANTHROPIC_API_KEY)');
  const body = JSON.stringify({
    model: 'claude-sonnet-4-5', max_tokens: 1500, system,
    messages: [{ role: 'user', content: userText }],
  });
  const RETRY = [429, 500, 502, 503, 529];
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body,
      });
      if (res.ok) { const j = await res.json(); return j.content?.filter(b => b.type === 'text').map(b => b.text).join('\n') || ''; }
      const e = await res.json().catch(() => ({}));
      lastErr = new Error(`API error ${res.status}: ${e?.error?.message || ''}`);
      if (!RETRY.includes(res.status) || attempt === 3) throw lastErr;
    } catch (err) {
      if (err === lastErr) throw err;
      lastErr = new Error('Network error contacting the AI — try again.');
      if (attempt === 3) throw lastErr;
    }
    await new Promise(r => setTimeout(r, Math.min(1000 * 2 ** attempt, 6000)));
  }
  throw lastErr;
}

// Compact per-page signals from a DataForSEO crawl.
function pageSignals(url, c) {
  if (!c) return { url, error: 'could not crawl' };
  const m = c.meta || {};
  const problems = Object.entries(c.checks || {}).filter(([, v]) => v === true).map(([k]) => k);
  return {
    url,
    status: c.status_code,
    onpage_score: c.onpage_score,
    title: m.title, title_len: m.title_length,
    meta_description: m.description, desc_len: m.description_length,
    h1_count: (m.htags?.h1 || []).length,
    h2_count: (m.htags?.h2 || []).length,
    word_count: m.content?.plain_text_word_count,
    readability: m.content?.automated_readability_index,
    images: m.images_count,
    internal_links: m.internal_links_count,
    external_links: m.external_links_count,
    lcp_ms: c.page_timing?.largest_contentful_paint,
    cls: m.cumulative_layout_shift,
    render_blocking_scripts: m.render_blocking_scripts_count,
    broken_resources: c.broken_resources,
    duplicate_title: m.duplicate_meta_tags,
    // DataForSEO "checks" flags that were true (these are usually issues/notes)
    flags: problems.slice(0, 40),
  };
}

const SYSTEM = `You are a senior technical SEO consultant auditing a client's website for an Australian digital agency (Campaigns You Love). You are given real crawl data plus the current Google priorities.

Your job: pick the TWO highest-impact things the team should do in the next fortnight to improve this site's SEO. Be specific to what the crawl actually shows — no generic advice. Each task must be something the content/comms team can action.

Current Google priorities to weigh:
${CURRENT_PRIORITIES}

Return ONLY valid JSON, no markdown fences, in this exact shape:
{
  "score": <overall 0-100 health estimate>,
  "summary": "<one sentence on the site's SEO health>",
  "issues": ["<concise issue>", "... up to 6 most important"],
  "tasks": [
    {
      "title": "<short action title>",
      "issue": "<the specific problem found, referencing the data>",
      "action": "<exactly what to do, step by step, concrete>",
      "impact": "High|Medium|Low",
      "effort": "Quick|Medium|Large",
      "category": "Technical|Content|On-page|Speed|Links|Trust"
    }
  ]
}
The "tasks" array MUST contain exactly 2 items — the two that will move the needle most.`;

export default function SiteAuditor() {
  const { activeClients } = useClients();
  const [client, setClient] = useState('');
  const [url, setUrl] = useState('');
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState('');
  const [audit, setAudit] = useState(null);      // latest audit for client
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');

  const loadAudits = useCallback(async (name) => {
    const { data } = await supabase.from('site_audits').select('*').eq('client_name', name).order('audited_on', { ascending: false });
    setHistory(data || []);
    setAudit((data || [])[0] || null);
  }, []);

  useEffect(() => { if (client) loadAudits(client); else { setAudit(null); setHistory([]); } }, [client, loadAudits]);

  const onPick = (name) => {
    setClient(name); setError('');
    const c = activeClients.find(x => x.name === name);
    setUrl(cleanUrl(c?.website || c?.url || c?.domain || ''));
  };

  const dueInfo = useMemo(() => {
    if (!audit) return null;
    const age = daysBetween(audit.audited_on, new Date().toISOString().slice(0, 10));
    return { age, due: age >= 14, inDays: 14 - age };
  }, [audit]);

  const runAudit = async () => {
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');
    const home = cleanUrl(url);
    if (!home) return toast.error('Enter the site URL');
    setRunning(true); setError('');
    try {
      // Gather a few key pages: homepage + up to 4 bucket-list pages.
      setStep('Finding key pages…');
      const { data: pages } = await supabase.from('client_pages').select('url').eq('client_name', client).limit(20);
      const extra = (pages || []).map(p => cleanUrl(p.url)).filter(u => u && u.startsWith('http') && u !== home).slice(0, 4);
      const targets = [home.startsWith('http') ? home : `https://${home}`, ...extra];

      setStep(`Crawling ${targets.length} pages…`);
      const crawls = await Promise.all(targets.map(async (u) => {
        try { return pageSignals(u, await dfs.crawlPage(u)); } catch { return { url: u, error: 'crawl failed' }; }
      }));

      setStep('Analysing & prioritising…');
      const raw = await callClaude(SYSTEM, `Site: ${home}\nClient: ${client}\n\nCrawl data (JSON):\n${JSON.stringify(crawls, null, 2)}`);
      let parsed;
      try { parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()); }
      catch { throw new Error('AI returned an unexpected format. Try again.'); }

      const tasks = (parsed.tasks || []).slice(0, 2).map(t => ({ ...t, done: false }));
      const row = {
        client_name: client, url: home, audited_on: new Date().toISOString().slice(0, 10),
        score: parsed.score ?? null, summary: parsed.summary || '', issues: parsed.issues || [],
        tasks, raw: crawls,
      };
      const { data: inserted, error: insErr } = await supabase.from('site_audits').insert(row).select().single();
      if (insErr) throw insErr;
      setAudit(inserted);
      setHistory(prev => [inserted, ...prev]);
      toast.success('Audit complete — 2 tasks ready');
    } catch (err) { setError(err.message); toast.error('Audit failed: ' + err.message); }
    setRunning(false); setStep('');
  };

  const toggleTask = async (idx) => {
    if (!audit) return;
    const tasks = audit.tasks.map((t, i) => i === idx ? { ...t, done: !t.done } : t);
    setAudit({ ...audit, tasks });
    await supabase.from('site_audits').update({ tasks }).eq('id', audit.id);
  };

  const clientNames = useMemo(() => activeClients.map(c => c.name).sort((a, b) => a.localeCompare(b)), [activeClients]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f8f8f6]">
      <div className="bg-[#1a1a1a] text-white px-4 h-9 flex items-center gap-3 shrink-0 border-t border-[#333]">
        <div className="text-xs font-semibold text-white/70">Site Auditor</div>
        <div className="text-[11px] text-white/40">Proactive SEO fixes · 2 tasks / fortnight</div>
        <Link to="/seo-tools" className="ml-auto text-[10px] text-gray-400 hover:text-[#F5C518] no-underline">← SEO Tools</Link>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Controls */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr_auto] gap-3 items-end">
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Client</label>
              <select value={client} onChange={(e) => onPick(e.target.value)}
                className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-[12px] bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518]">
                <option value="">— select a client —</option>
                {clientNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Website URL</label>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://client.com.au"
                className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-[12px] bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518]" />
            </div>
            <button onClick={runAudit} disabled={running || !client}
              className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-4 py-1.5 text-[12px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40 whitespace-nowrap">
              {running ? (step || 'Auditing…') : audit ? '↻ Re-run Audit' : 'Run Audit'}
            </button>
          </div>
          {dueInfo && (
            <div className="mt-2 text-[10px]">
              {dueInfo.due
                ? <span className="text-orange-600 font-semibold">⏰ Fortnightly audit is due (last run {dueInfo.age} days ago)</span>
                : <span className="text-gray-400">Last audited {dueInfo.age} day{dueInfo.age !== 1 ? 's' : ''} ago · next due in {dueInfo.inDays} days</span>}
            </div>
          )}
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-[11px] text-red-700"><strong>Error:</strong> {error}</div>}

        {!audit && !running && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-[12px] text-gray-500">
            Pick a client and run an audit. The bot crawls the site, finds the real issues, and gives you the 2 highest-impact fixes to work on this fortnight.
          </div>
        )}

        {audit && (
          <>
            {/* Health summary */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 flex items-center gap-4">
              <div className="text-center shrink-0">
                <div className={`text-3xl font-bold ${audit.score >= 80 ? 'text-green-600' : audit.score >= 50 ? 'text-orange-500' : 'text-red-500'}`}>{audit.score ?? '—'}</div>
                <div className="text-[9px] font-bold uppercase text-gray-400">Health</div>
              </div>
              <div>
                <div className="text-[13px] font-semibold text-[#1a1a1a]">{audit.summary}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{audit.url} · audited {audit.audited_on}</div>
              </div>
            </div>

            {/* The 2 tasks */}
            <div className="text-[10px] font-bold uppercase text-[#F5C518] mb-2">Your 2 Tasks This Fortnight</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {(audit.tasks || []).map((t, i) => (
                <div key={i} className={`bg-white border rounded-lg p-4 ${t.done ? 'border-green-300 opacity-70' : 'border-gray-200'}`}>
                  <div className="flex items-start gap-2 mb-2">
                    <button onClick={() => toggleTask(i)}
                      className={`w-5 h-5 rounded border shrink-0 mt-0.5 cursor-pointer flex items-center justify-center text-[11px] ${t.done ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-gray-300'}`}>
                      {t.done ? '✓' : ''}
                    </button>
                    <div className={`text-[13px] font-bold text-[#1a1a1a] flex-1 ${t.done ? 'line-through' : ''}`}>{t.title}</div>
                  </div>
                  <div className="flex gap-1.5 mb-2">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${IMPACT_COLOR[t.impact] || IMPACT_COLOR.Low}`}>{t.impact} impact</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${EFFORT_COLOR[t.effort] || EFFORT_COLOR.Medium}`}>{t.effort}</span>
                    {t.category && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{t.category}</span>}
                  </div>
                  <div className="text-[11px] text-gray-600 mb-1.5"><span className="font-semibold text-gray-500">Issue:</span> {t.issue}</div>
                  <div className="text-[11px] text-gray-700 leading-relaxed"><span className="font-semibold text-gray-500">Do this:</span> {t.action}</div>
                </div>
              ))}
            </div>

            {/* Detected issues */}
            {audit.issues?.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-4">
                <div className="px-4 py-2.5 border-b border-gray-200 bg-[#fafafa]">
                  <div className="text-[10px] font-bold uppercase text-[#F5C518]">All Detected Issues</div>
                  <div className="text-[11px] text-gray-500">Full list from the crawl — the 2 tasks above are the priorities</div>
                </div>
                <ul className="p-4 space-y-1.5">
                  {audit.issues.map((iss, i) => (
                    <li key={i} className="text-[11px] text-gray-600 flex gap-2"><span className="text-orange-400">•</span>{iss}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* History */}
            {history.length > 1 && (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-200 bg-[#fafafa]">
                  <div className="text-[10px] font-bold uppercase text-[#F5C518]">Audit History</div>
                </div>
                <table className="w-full text-[11px]">
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className={`border-b border-gray-100 cursor-pointer hover:bg-[#fafafa] ${h.id === audit.id ? 'bg-[#F5C518]/5' : ''}`} onClick={() => setAudit(h)}>
                        <td className="px-3 py-1.5 text-gray-500">{h.audited_on}</td>
                        <td className="px-3 py-1.5"><span className={`font-bold ${h.score >= 80 ? 'text-green-600' : h.score >= 50 ? 'text-orange-500' : 'text-red-500'}`}>{h.score ?? '—'}</span></td>
                        <td className="px-3 py-1.5 text-gray-600 truncate max-w-md">{h.summary}</td>
                        <td className="px-3 py-1.5 text-right text-gray-400">{(h.tasks || []).filter(t => t.done).length}/{(h.tasks || []).length} done</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
