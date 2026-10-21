import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import * as dfs from '../lib/dataForSeo';
import {
  CATEGORIES, DEFAULT_MAX_PAGES, normaliseSite, resolveClientSite,
  startCrawl, waitForCrawl, collectCrawl, pickKeyPages, fetchCoreWebVitalsFor,
  detectIssues, healthScore, crawlStats, issuesForPrompt, AI_SYSTEM, CURRENT_PRIORITIES,
} from '../lib/siteAudit';
import toast from 'react-hot-toast';

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const PAGESPEED_KEY = import.meta.env.VITE_PAGESPEED_API_KEY;
const TRELLO_KEY = import.meta.env.VITE_TRELLO_API_KEY;
const TRELLO_TOKEN = import.meta.env.VITE_TRELLO_TOKEN;
const TRELLO_BOARD = import.meta.env.VITE_TRELLO_BOARD_ID;
const trelloConfigured = !!(TRELLO_KEY && TRELLO_TOKEN && TRELLO_BOARD);

// Trello REST helper (client-side; Trello allows cross-origin calls).
const trello = (path, params = {}, method = 'GET') => {
  const q = new URLSearchParams({ key: TRELLO_KEY, token: TRELLO_TOKEN, ...params });
  return fetch(`https://api.trello.com/1/${path}?${q}`, { method }).then(r => r.json());
};

const IMPACT_COLOR = { High: 'bg-red-100 text-red-700', Medium: 'bg-orange-100 text-orange-700', Low: 'bg-gray-100 text-gray-500' };
const EFFORT_COLOR = { Quick: 'bg-green-100 text-green-700', Medium: 'bg-yellow-100 text-yellow-700', Large: 'bg-gray-100 text-gray-600' };
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.key, c.label]));
const PAGES_SHOWN = 10;

// A crawl keeps running at DataForSEO if the tab is closed; remember its id so
// the next run picks it up instead of paying for a second crawl.
const pendingKey = (client) => `siteAuditor:pending:${client}`;
const readPending = (client) => {
  try { const p = JSON.parse(localStorage.getItem(pendingKey(client)) || 'null'); return p && Date.now() - p.started < 86400000 ? p : null; }
  catch { return null; }
};
const writePending = (client, value) => {
  try { value ? localStorage.setItem(pendingKey(client), JSON.stringify(value)) : localStorage.removeItem(pendingKey(client)); }
  catch { /* storage unavailable */ }
};

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

async function callClaude(system, userText) {
  if (!ANTHROPIC_KEY) throw new Error('Anthropic API key not configured (VITE_ANTHROPIC_API_KEY)');
  const body = JSON.stringify({
    model: 'claude-sonnet-4-5', max_tokens: 1500, temperature: 0, system,
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

// Issues saved by the old auditor were plain strings.
const isStructured = (issues) => Array.isArray(issues) && issues.length > 0 && typeof issues[0] === 'object';

function IssueCard({ issue }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const shown = all ? issue.pages : issue.pages.slice(0, PAGES_SHOWN);
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left bg-white border-none cursor-pointer hover:bg-[#fafafa]">
        <span className="text-[10px] text-gray-400 w-3">{open ? '▾' : '▸'}</span>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${IMPACT_COLOR[issue.severity] || IMPACT_COLOR.Low}`}>{issue.severity}</span>
        <span className="text-[12px] font-semibold text-[#1a1a1a] flex-1">{issue.title}</span>
        <span className="text-[10px] text-gray-500 shrink-0">{issue.count} page{issue.count !== 1 ? 's' : ''}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 pl-9">
          <div className="text-[11px] text-gray-600 mb-1"><span className="font-semibold text-gray-500">Why it matters:</span> {issue.why}</div>
          <div className="text-[11px] text-gray-700 mb-2"><span className="font-semibold text-gray-500">How to fix:</span> {issue.fix}</div>
          <div className="text-[10px] font-bold uppercase text-gray-400 mb-1">Affected pages</div>
          <ul className="space-y-0.5">
            {shown.map((p, i) => (
              <li key={i} className="text-[11px] flex gap-2 min-w-0">
                <a href={p.url} target="_blank" rel="noreferrer" className="text-[#0079BF] truncate no-underline hover:underline">{p.url}</a>
                {p.detail && <span className="text-gray-500 shrink-0 max-w-[50%] truncate" title={p.detail}>{p.detail}</span>}
              </li>
            ))}
          </ul>
          {issue.pages.length > PAGES_SHOWN && (
            <button onClick={() => setAll(a => !a)} className="mt-1 text-[10px] text-gray-500 bg-transparent border-none cursor-pointer hover:text-[#1a1a1a] p-0">
              {all ? 'Show fewer' : `Show all ${issue.pages.length}`}
            </button>
          )}
          {issue.count > issue.pages.length && (
            <div className="text-[10px] text-gray-400 mt-1">Showing the first {issue.pages.length} of {issue.count} — export CSV for the rest of this list.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SiteAuditor() {
  const { activeClients } = useClients();
  const [client, setClient] = useState('');
  const [url, setUrl] = useState('');
  const [urlSource, setUrlSource] = useState('');   // '' | 'auto' | 'manual'
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState('');
  const [audit, setAudit] = useState(null);      // latest audit for client
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('all');

  const loadAudits = useCallback(async (name) => {
    const { data } = await supabase.from('site_audits').select('*').eq('client_name', name).order('audited_on', { ascending: false }).order('created_at', { ascending: false });
    setHistory(data || []);
    setAudit((data || [])[0] || null);
    return data || [];
  }, []);

  // Fill the website URL from what we already know about the client.
  const autoFillUrl = useCallback(async (name, audits) => {
    const [bv, rt, pages] = await Promise.all([
      supabase.from('client_brand_voice').select('website_url').eq('client_name', name),
      supabase.from('rank_tracker_keywords').select('target_domain').eq('client_name', name).limit(500),
      supabase.from('client_pages').select('url').eq('client_name', name).limit(50),
    ]);
    return resolveClientSite({
      lastAuditUrl: audits[0]?.url,
      brandVoiceUrls: (bv.data || []).map(r => r.website_url),
      rankDomains: (rt.data || []).map(r => r.target_domain),
      pageUrls: (pages.data || []).map(r => r.url),
    });
  }, []);

  useEffect(() => {
    if (!client) { setAudit(null); setHistory([]); return; }
    let cancelled = false;
    (async () => {
      const audits = await loadAudits(client);
      const site = await autoFillUrl(client, audits).catch(() => '');
      if (cancelled) return;
      // onPick clears the URL, so anything here was typed while we looked it up — keep it.
      setUrl(prev => prev || site);
      setUrlSource(s => (s === 'manual' ? s : site ? 'auto' : ''));
    })();
    return () => { cancelled = true; };
  }, [client, loadAudits, autoFillUrl]);

  const onPick = (name) => { setClient(name); setError(''); setUrl(''); setUrlSource(''); setCategory('all'); };

  const dueInfo = useMemo(() => {
    if (!audit) return null;
    const age = daysBetween(audit.audited_on, new Date().toISOString().slice(0, 10));
    return { age, due: age >= 14, inDays: 14 - age };
  }, [audit]);

  const runAudit = async () => {
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');
    const home = normaliseSite(url);
    if (!home) return toast.error('Enter the site URL');
    setRunning(true); setError('');
    try {
      let pending = readPending(client);
      if (pending && pending.url !== home) pending = null;
      let id = pending?.id;
      if (!id) {
        setStep('Starting site crawl…');
        id = await startCrawl(dfs.onPageRequest, home, { maxPages: DEFAULT_MAX_PAGES });
        writePending(client, { id, url: home, started: Date.now() });
      }

      // Core Web Vitals for the home page runs while the crawl is going.
      const homeCwv = fetchCoreWebVitalsFor([`${home}/`], { apiKey: PAGESPEED_KEY });

      const summary = await waitForCrawl(dfs.onPageRequest, id, {
        onProgress: (s) => setStep(s.finished ? 'Crawl finished…' : `Crawling… ${s.crawled}/${s.max || DEFAULT_MAX_PAGES} pages`),
      });
      setStep('Collecting results…');
      const crawl = await collectCrawl(dfs.onPageRequest, id, summary);

      setStep('Measuring Core Web Vitals…');
      const extraPages = pickKeyPages(crawl, home, 3).slice(1);
      const cwv = [...await homeCwv, ...await fetchCoreWebVitalsFor(extraPages, { apiKey: PAGESPEED_KEY })];

      const issues = detectIssues(crawl, cwv);
      const stats = crawlStats(crawl, cwv);

      setStep('Prioritising…');
      const raw = await callClaude(AI_SYSTEM(CURRENT_PRIORITIES),
        `Site: ${home}\nClient: ${client}\nPages crawled: ${stats.pages_crawled} (${stats.html_pages} live HTML pages)\n\nVerified findings (JSON):\n${JSON.stringify(issuesForPrompt(issues), null, 2)}`);
      let parsed;
      try { parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()); }
      catch { throw new Error('AI returned an unexpected format. Try again.'); }

      const tasks = (parsed.tasks || []).slice(0, 2).map(t => ({ ...t, done: false }));
      const row = {
        client_name: client, url: home, audited_on: new Date().toISOString().slice(0, 10),
        score: healthScore(crawl, issues), summary: parsed.summary || '', issues,
        tasks, raw: stats,
      };
      const { data: inserted, error: insErr } = await supabase.from('site_audits').insert(row).select().single();
      if (insErr) throw insErr;
      writePending(client, null);
      setAudit(inserted);
      setHistory(prev => [inserted, ...prev]);
      setCategory('all');
      toast.success(`Audit complete — ${issues.length} issue types across ${stats.pages_crawled} pages`);
    } catch (err) { setError(err.message); toast.error('Audit failed: ' + err.message); }
    setRunning(false); setStep('');
  };

  const issuesById = useMemo(() => Object.fromEntries((isStructured(audit?.issues) ? audit.issues : []).map(i => [i.id, i])), [audit]);

  const [pushing, setPushing] = useState(false);
  const sendToTrello = async () => {
    if (!trelloConfigured) return toast.error('Trello not set up yet — add the VITE_TRELLO_* keys');
    if (!audit?.tasks?.length) return;
    setPushing(true);
    try {
      const lists = await trello(`boards/${TRELLO_BOARD}/lists`);
      let list = (lists || []).find(l => l.name.toLowerCase() === client.toLowerCase());
      if (!list) list = await trello('lists', { name: client, idBoard: TRELLO_BOARD }, 'POST');
      if (!list?.id) throw new Error('could not find or create the client list');
      let n = 0;
      for (const t of audit.tasks) {
        const pages = (t.issue_ids || []).flatMap(id => issuesById[id]?.pages || []).slice(0, 15);
        const pageList = pages.length ? `\n\n**Pages:**\n${pages.map(p => `- ${p.url}${p.detail ? ` — ${p.detail}` : ''}`).join('\n')}` : '';
        const desc = `**Issue:** ${t.issue}\n\n**Do this:** ${t.action}${pageList}\n\n_${t.category} · ${t.impact} impact · ${t.effort} effort · Site Auditor ${audit.audited_on}_`;
        const card = await trello('cards', { idList: list.id, name: `[${t.impact}] ${t.title}`, desc }, 'POST');
        if (card?.id) n++;
      }
      toast.success(`Pushed ${n} card${n !== 1 ? 's' : ''} to Trello · list “${client}”`);
    } catch (e) { toast.error('Trello push failed: ' + e.message); }
    setPushing(false);
  };

  const toggleTask = async (idx) => {
    if (!audit) return;
    const tasks = audit.tasks.map((t, i) => i === idx ? { ...t, done: !t.done } : t);
    setAudit({ ...audit, tasks });
    await supabase.from('site_audits').update({ tasks }).eq('id', audit.id);
  };

  const exportCsv = () => {
    if (!isStructured(audit?.issues)) return;
    const rows = audit.issues.flatMap(i => i.pages.map(p => [
      CATEGORY_LABEL[i.category] || i.category, i.severity, i.title, p.url, p.detail || '', i.fix,
    ]));
    const slug = client.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    downloadCsv(`site-audit-${slug}-${audit.audited_on}.csv`, ['Category', 'Severity', 'Issue', 'Page', 'Detail', 'Recommendation'], rows);
  };

  const clientNames = useMemo(() => activeClients.map(c => c.name).sort((a, b) => a.localeCompare(b)), [activeClients]);

  const structured = isStructured(audit?.issues);
  const byCategory = useMemo(() => {
    const out = Object.fromEntries(CATEGORIES.map(c => [c.key, []]));
    if (structured) for (const i of audit.issues) (out[i.category] ||= []).push(i);
    return out;
  }, [audit, structured]);
  const severityCount = (list, sev) => list.filter(i => i.severity === sev).length;
  const visibleCats = CATEGORIES.filter(c => category === 'all' || c.key === category);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f8f8f6]">
      <div className="bg-[#1a1a1a] text-white px-4 h-9 flex items-center gap-3 shrink-0 border-t border-[#333]">
        <div className="text-xs font-semibold text-white/70">Site Auditor</div>
        <div className="text-[11px] text-white/40">Full-site crawl · issues by category · 2 tasks / fortnight</div>
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
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                Website URL {urlSource === 'auto' && <span className="normal-case font-normal text-gray-400">· filled in automatically</span>}
              </label>
              <input value={url} onChange={(e) => { setUrl(e.target.value); setUrlSource('manual'); }} placeholder="https://client.com.au"
                className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-[12px] bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518]" />
            </div>
            <button onClick={runAudit} disabled={running || !client}
              className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-4 py-1.5 text-[12px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40 whitespace-nowrap">
              {running ? (step || 'Auditing…') : audit ? '↻ Re-run Audit' : 'Run Audit'}
            </button>
          </div>
          {running && (
            <div className="mt-2 text-[10px] text-gray-500">
              Crawling up to {DEFAULT_MAX_PAGES} pages usually takes 2–10 minutes. You can leave this page — re-run later and it picks up the same crawl.
            </div>
          )}
          {!running && dueInfo && (
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
            Pick a client and run an audit. The bot crawls the whole site, lists every issue by category with the exact pages affected, and gives you the 2 highest-impact fixes to work on this fortnight.
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
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[#1a1a1a]">{audit.summary}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {audit.url} · audited {audit.audited_on}
                  {audit.raw?.engine === 'v2' && ` · ${audit.raw.pages_crawled} pages crawled`}
                </div>
              </div>
            </div>

            {/* The 2 tasks */}
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold uppercase text-[#F5C518]">Your 2 Tasks This Fortnight</div>
              <button onClick={sendToTrello} disabled={pushing || !trelloConfigured}
                title={trelloConfigured ? 'Create these 2 tasks as Trello cards' : 'Add VITE_TRELLO_* keys to enable'}
                className="bg-[#0079BF] text-white border-none rounded px-3 py-1 text-[10px] font-bold cursor-pointer hover:bg-[#026aa7] disabled:opacity-40">
                {pushing ? 'Pushing…' : '📋 Send to Trello'}
              </button>
            </div>
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
                  <div className="flex gap-1.5 mb-2 flex-wrap">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${IMPACT_COLOR[t.impact] || IMPACT_COLOR.Low}`}>{t.impact} impact</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${EFFORT_COLOR[t.effort] || EFFORT_COLOR.Medium}`}>{t.effort}</span>
                    {t.category && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{t.category}</span>}
                  </div>
                  <div className="text-[11px] text-gray-600 mb-1.5"><span className="font-semibold text-gray-500">Issue:</span> {t.issue}</div>
                  <div className="text-[11px] text-gray-700 leading-relaxed"><span className="font-semibold text-gray-500">Do this:</span> {t.action}</div>
                  {(t.issue_ids || []).some(id => issuesById[id]) && (
                    <div className="text-[10px] text-gray-400 mt-1.5">
                      Pages: {(t.issue_ids || []).reduce((n, id) => n + (issuesById[id]?.count || 0), 0)} — see the matching issues below.
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Full report, by category */}
            {structured && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-bold uppercase text-[#F5C518]">Full Report · {audit.issues.length} issue types</div>
                  <button onClick={exportCsv}
                    className="bg-white text-[#1a1a1a] border border-gray-200 rounded px-3 py-1 text-[10px] font-bold cursor-pointer hover:border-[#F5C518]">
                    ⬇ Export CSV (issue × page)
                  </button>
                </div>
                <div className="flex gap-1.5 flex-wrap mb-3">
                  {[{ key: 'all', label: 'All' }, ...CATEGORIES].map(c => {
                    const n = c.key === 'all' ? audit.issues.length : byCategory[c.key].length;
                    const active = category === c.key;
                    return (
                      <button key={c.key} onClick={() => setCategory(c.key)}
                        className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border cursor-pointer ${active ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                        {c.label} <span className={active ? 'text-white/60' : 'text-gray-400'}>{n}</span>
                      </button>
                    );
                  })}
                </div>
                {visibleCats.map(c => {
                  const list = byCategory[c.key];
                  return (
                    <div key={c.key} className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-3">
                      <div className="px-4 py-2.5 border-b border-gray-200 bg-[#fafafa] flex items-center gap-2">
                        <div className="text-[11px] font-bold text-[#1a1a1a] flex-1">{c.label}</div>
                        {list.length === 0
                          ? <span className="text-[10px] text-green-600 font-semibold">✓ No issues found</span>
                          : ['High', 'Medium', 'Low'].map(sev => severityCount(list, sev) > 0 && (
                            <span key={sev} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${IMPACT_COLOR[sev]}`}>{severityCount(list, sev)} {sev}</span>
                          ))}
                      </div>
                      {list.map(issue => <IssueCard key={issue.id} issue={issue} />)}
                    </div>
                  );
                })}
                {audit.raw?.cwv?.some(c => !c.error) && (
                  <div className="text-[10px] text-gray-400">
                    Core Web Vitals measured on: {audit.raw.cwv.filter(c => !c.error).map(c => `${c.url} (${c.source === 'field' ? 'real-user data' : 'lab test'})`).join(', ')}
                  </div>
                )}
                {audit.raw?.cwv?.length > 0 && audit.raw.cwv.every(c => c.error) && (
                  <div className="text-[10px] text-orange-600">Core Web Vitals couldn’t be measured this run (PageSpeed Insights unavailable) — re-run to include them.</div>
                )}
              </div>
            )}

            {/* Audits from the old auditor stored issues as plain text */}
            {!structured && audit.issues?.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-4">
                <div className="px-4 py-2.5 border-b border-gray-200 bg-[#fafafa]">
                  <div className="text-[10px] font-bold uppercase text-[#F5C518]">Detected Issues</div>
                  <div className="text-[11px] text-gray-500">From an older audit — re-run for the full categorised report with affected pages</div>
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
                      <tr key={h.id} className={`border-b border-gray-100 cursor-pointer hover:bg-[#fafafa] ${h.id === audit.id ? 'bg-[#F5C518]/5' : ''}`} onClick={() => { setAudit(h); setCategory('all'); }}>
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
