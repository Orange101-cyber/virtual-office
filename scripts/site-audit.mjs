// Automated fortnightly Site Auditor.
// Runs in GitHub Actions (Node 20+). For each client it finds the website,
// runs a full-site DataForSEO crawl (up to 200 pages), detects issues with the
// shared rules in src/lib/siteAudit.js, asks Claude for the 2 highest-impact
// fortnightly tasks, stores the audit in Supabase, and creates 2 Trello cards
// on the client's list.
//
// Env required:
//   SUPABASE_URL, SUPABASE_ANON_KEY
//   DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD
//   ANTHROPIC_API_KEY
//   TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID   (Trello optional — skipped if unset)
//   PAGESPEED_API_KEY                               (optional — raises the PageSpeed quota)

import {
  DEFAULT_MAX_PAGES, normaliseSite, resolveClientSite,
  startCrawl, waitForCrawl, collectCrawl, pickKeyPages, fetchCoreWebVitalsFor,
  detectIssues, healthScore, crawlStats, issuesForPrompt, AI_SYSTEM, CURRENT_PRIORITIES,
} from '../src/lib/siteAudit.js';

const {
  SUPABASE_URL, SUPABASE_ANON_KEY,
  DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD,
  ANTHROPIC_API_KEY,
  TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID,
  PAGESPEED_API_KEY,
} = process.env;

const need = { SUPABASE_URL, SUPABASE_ANON_KEY, DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD, ANTHROPIC_API_KEY };
for (const [k, v] of Object.entries(need)) if (!v) { console.error(`Missing env: ${k}`); process.exit(1); }
const trelloOn = !!(TRELLO_API_KEY && TRELLO_TOKEN && TRELLO_BOARD_ID);

const sb = (path, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...opts, headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
});
const sbRows = (path) => sb(path).then(r => (r.ok ? r.json() : [])).catch(() => []);

// payload undefined = GET (same contract as dataForSeo.onPageRequest in the app)
async function dfs(endpoint, payload) {
  const res = await fetch(`https://api.dataforseo.com/v3${endpoint}`, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64'), 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(Array.isArray(payload) ? payload : [payload]),
  });
  if (!res.ok) throw new Error(`DataForSEO ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (data.status_code !== 20000) throw new Error(data.status_message || 'DataForSEO API error');
  return data;
}

const today = () => new Date().toISOString().slice(0, 10);

async function askClaude(client, site, stats, issues) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-5-5', output_config: { effort: 'low' }, fallbacks: 'default', max_tokens: 3000, system: AI_SYSTEM(CURRENT_PRIORITIES),
      messages: [{ role: 'user', content: `Site: ${site}\nClient: ${client}\nPages crawled: ${stats.pages_crawled} (${stats.html_pages} live HTML pages)\n\nVerified findings (JSON):\n${JSON.stringify(issuesForPrompt(issues), null, 2)}` }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

async function siteFor(name) {
  const enc = encodeURIComponent(name);
  const [last, bv, rt, pages] = await Promise.all([
    sbRows(`site_audits?client_name=eq.${enc}&select=url&order=audited_on.desc&limit=1`),
    sbRows(`client_brand_voice?client_name=eq.${enc}&select=website_url`),
    sbRows(`rank_tracker_keywords?client_name=eq.${enc}&select=target_domain&limit=500`),
    sbRows(`client_pages?client_name=eq.${enc}&select=url&limit=50`),
  ]);
  return resolveClientSite({
    lastAuditUrl: last[0]?.url,
    brandVoiceUrls: bv.map(r => r.website_url),
    rankDomains: rt.map(r => r.target_domain),
    pageUrls: pages.map(r => r.url),
  });
}

// ── Trello ──
const trello = (path, params = {}, method = 'GET') => {
  const q = new URLSearchParams({ key: TRELLO_API_KEY, token: TRELLO_TOKEN, ...params });
  return fetch(`https://api.trello.com/1/${path}?${q}`, { method }).then(r => r.json());
};
let _lists = null;
async function listForClient(client) {
  if (!_lists) _lists = await trello(`boards/${TRELLO_BOARD_ID}/lists`);
  let list = (_lists || []).find(l => l.name.toLowerCase() === client.toLowerCase());
  if (!list) { list = await trello('lists', { name: client, idBoard: TRELLO_BOARD_ID }, 'POST'); _lists.push(list); }
  return list?.id;
}
async function addCards(client, tasks, issues) {
  if (!trelloOn) return 0;
  const idList = await listForClient(client);
  if (!idList) return 0;
  const byId = Object.fromEntries(issues.map(i => [i.id, i]));
  let n = 0;
  for (const t of tasks) {
    const pages = (t.issue_ids || []).flatMap(id => byId[id]?.pages || []).slice(0, 15);
    const pageList = pages.length ? `\n\n**Pages:**\n${pages.map(p => `- ${p.url}${p.detail ? ` — ${p.detail}` : ''}`).join('\n')}` : '';
    const desc = `**Issue:** ${t.issue}\n\n**Do this:** ${t.action}${pageList}\n\n_${t.category} · ${t.impact} impact · ${t.effort} effort · Site Auditor ${today()}_`;
    const card = await trello('cards', { idList, name: `[${t.impact}] ${t.title}`, desc }, 'POST');
    if (card?.id) n++;
  }
  return n;
}

async function main() {
  const res = await sb('clients?select=name,archived');
  if (!res.ok) { console.error('read clients failed:', await res.text()); process.exit(1); }
  const clients = (await res.json()).filter(c => c.archived !== true);

  // 1. Start every crawl up front — they run in parallel at DataForSEO.
  const jobs = [];
  for (const c of clients) {
    const home = normaliseSite(await siteFor(c.name));
    if (!home) { console.log(`- ${c.name}: no website found, skipped`); continue; }
    try {
      const id = await startCrawl(dfs, home, { maxPages: DEFAULT_MAX_PAGES });
      jobs.push({ name: c.name, home, id });
      console.log(`… ${c.name}: crawling ${home}`);
    } catch (e) { console.warn(`✗ ${c.name}: could not start crawl — ${e.message}`); }
  }

  // 2. Finish each one.
  let audited = 0, cards = 0;
  for (const job of jobs) {
    try {
      const summary = await waitForCrawl(dfs, job.id, { intervalMs: 15000, timeoutMs: 60 * 60000 });
      const crawl = await collectCrawl(dfs, job.id, summary);
      const cwv = await fetchCoreWebVitalsFor(pickKeyPages(crawl, job.home, 3), { apiKey: PAGESPEED_API_KEY });
      const issues = detectIssues(crawl, cwv);
      const stats = crawlStats(crawl, cwv);
      const parsed = await askClaude(job.name, job.home, stats, issues);
      const tasks = (parsed.tasks || []).slice(0, 2).map(t => ({ ...t, done: false }));
      const score = healthScore(crawl, issues);

      const ins = await sb('site_audits', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          client_name: job.name, url: job.home, audited_on: today(),
          score, summary: parsed.summary || '', issues, tasks, raw: stats,
        }),
      });
      if (!ins.ok) { console.warn(`  insert failed for ${job.name}:`, await ins.text()); continue; }
      audited++;
      const added = await addCards(job.name, tasks, issues);
      cards += added;
      console.log(`✓ ${job.name}: score ${score}, ${stats.pages_crawled} pages, ${issues.length} issue types, 2 tasks${trelloOn ? `, ${added} Trello cards` : ''}`);
    } catch (e) {
      console.warn(`✗ ${job.name}: ${e.message}`);
    }
  }
  console.log(`\nDone: ${audited} sites audited${trelloOn ? `, ${cards} Trello cards created` : ' (Trello not configured)'}.`);
}

main().catch(e => { console.error(e); process.exit(1); });
