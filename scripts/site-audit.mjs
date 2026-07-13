// Automated fortnightly Site Auditor.
// Runs in GitHub Actions (Node 20+). For each client with a website it crawls
// the site (DataForSEO), asks Claude for the 2 highest-impact fortnightly tasks,
// stores the audit in Supabase, and creates 2 Trello cards on the client's list.
//
// Env required:
//   SUPABASE_URL, SUPABASE_ANON_KEY
//   DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD
//   ANTHROPIC_API_KEY
//   TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID   (Trello optional — skipped if unset)

const {
  SUPABASE_URL, SUPABASE_ANON_KEY,
  DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD,
  ANTHROPIC_API_KEY,
  TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID,
} = process.env;

const LOCATION_AU = 2036, LANGUAGE = 'en';
const need = { SUPABASE_URL, SUPABASE_ANON_KEY, DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD, ANTHROPIC_API_KEY };
for (const [k, v] of Object.entries(need)) if (!v) { console.error(`Missing env: ${k}`); process.exit(1); }
const trelloOn = !!(TRELLO_API_KEY && TRELLO_TOKEN && TRELLO_BOARD_ID);

const sb = (path, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...opts, headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
});
const dfs = (endpoint, payload) => fetch(`https://api.dataforseo.com/v3${endpoint}`, {
  method: 'POST',
  headers: { Authorization: 'Basic ' + Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64'), 'Content-Type': 'application/json' },
  body: JSON.stringify(Array.isArray(payload) ? payload : [payload]),
}).then(r => r.json());

const cleanUrl = (u = '') => u.trim().replace(/\/$/, '');
const today = () => new Date().toISOString().slice(0, 10);

const CURRENT_PRIORITIES = `
- Helpful, people-first content (thin/AI-spun/SEO-only pages get suppressed).
- E-E-A-T: Experience, Expertise, Authoritativeness, Trust.
- Spam policies: no doorway pages, scaled low-value content, keyword stuffing.
- Core Web Vitals: LCP < 2.5s, CLS < 0.1, fast mobile.
- AI Overviews: clear direct answers, FAQ blocks, structured data.
- Technical hygiene: one H1, unique titles/meta, canonicals, no broken links,
  crawlable, indexable, HTTPS, image alt text, internal linking.`;

const SYSTEM = `You are a senior technical SEO consultant auditing a client's website for an Australian agency. Given real crawl data + current Google priorities, pick the TWO highest-impact things to do in the next fortnight. Be specific to what the crawl shows — no generic advice; each task must be actionable by a content/comms team.
Current Google priorities:${CURRENT_PRIORITIES}
Return ONLY valid JSON (no fences):
{"score":<0-100>,"summary":"<one sentence>","issues":["<up to 6>"],"tasks":[{"title":"","issue":"","action":"","impact":"High|Medium|Low","effort":"Quick|Medium|Large","category":"Technical|Content|On-page|Speed|Links|Trust"}]}
The "tasks" array MUST contain exactly 2 items.`;

async function crawl(url) {
  const data = await dfs('/on_page/instant_pages', { url, enable_javascript: true, enable_browser_rendering: true });
  const page = data.tasks?.[0]?.result?.[0]?.items?.[0];
  if (!page) return { url, error: 'could not crawl' };
  const m = page.meta || {};
  const flags = Object.entries(page.checks || {}).filter(([, v]) => v === true).map(([k]) => k);
  return {
    url, status: page.status_code, onpage_score: page.onpage_score,
    title: m.title, title_len: m.title?.length, meta_description: m.description, desc_len: m.description?.length,
    h1_count: (m.htags?.h1 || []).length, h2_count: (m.htags?.h2 || []).length,
    word_count: m.content?.plain_text_word_count, images: m.images_count,
    internal_links: m.internal_links_count, external_links: m.external_links_count,
    lcp_ms: page.page_timing?.largest_contentful_paint, cls: m.cumulative_layout_shift,
    broken_resources: page.broken_resources, flags: flags.slice(0, 40),
  };
}

async function askClaude(client, site, crawls) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5', max_tokens: 1500, system: SYSTEM,
      messages: [{ role: 'user', content: `Site: ${site}\nClient: ${client}\n\nCrawl data:\n${JSON.stringify(crawls, null, 2)}` }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  return JSON.parse(text.replace(/```json|```/g, '').trim());
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
async function addCards(client, tasks) {
  if (!trelloOn) return 0;
  const idList = await listForClient(client);
  if (!idList) return 0;
  let n = 0;
  for (const t of tasks) {
    const desc = `**Issue:** ${t.issue}\n\n**Do this:** ${t.action}\n\n_${t.category} · ${t.impact} impact · ${t.effort} effort · Site Auditor ${today()}_`;
    const card = await trello('cards', { idList, name: `[${t.impact}] ${t.title}`, desc }, 'POST');
    if (card?.id) n++;
  }
  return n;
}

async function main() {
  const res = await sb('clients?select=name,website,url,domain,archived');
  if (!res.ok) { console.error('read clients failed:', await res.text()); process.exit(1); }
  const clients = (await res.json()).filter(c => c.archived !== true);

  let audited = 0, cards = 0;
  for (const c of clients) {
    let site = cleanUrl(c.website || c.url || c.domain || '');
    if (!site) {
      // fall back to a domain from the client's bucket-list pages
      const p = await sb(`client_pages?client_name=eq.${encodeURIComponent(c.name)}&select=url&limit=1`).then(r => r.json()).catch(() => []);
      const u = p?.[0]?.url || '';
      if (u) { try { site = new URL(u.startsWith('http') ? u : `https://${u}`).origin; } catch { /* skip */ } }
    }
    if (!site) { console.log(`- ${c.name}: no URL, skipped`); continue; }
    const home = site.startsWith('http') ? site : `https://${site}`;
    try {
      const pages = await sb(`client_pages?client_name=eq.${encodeURIComponent(c.name)}&select=url&limit=10`).then(r => r.json()).catch(() => []);
      const extra = (pages || []).map(p => cleanUrl(p.url)).filter(u => u && u.startsWith('http') && cleanUrl(u) !== cleanUrl(home)).slice(0, 3);
      const targets = [home, ...extra];
      const crawls = [];
      for (const u of targets) { try { crawls.push(await crawl(u)); } catch { crawls.push({ url: u, error: 'crawl failed' }); } }

      const parsed = await askClaude(c.name, home, crawls);
      const tasks = (parsed.tasks || []).slice(0, 2).map(t => ({ ...t, done: false }));

      const ins = await sb('site_audits', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          client_name: c.name, url: home, audited_on: today(),
          score: parsed.score ?? null, summary: parsed.summary || '', issues: parsed.issues || [], tasks, raw: crawls,
        }),
      });
      if (!ins.ok) { console.warn(`  insert failed for ${c.name}:`, await ins.text()); continue; }
      audited++;
      const added = await addCards(c.name, tasks);
      cards += added;
      console.log(`✓ ${c.name}: score ${parsed.score}, 2 tasks${trelloOn ? `, ${added} Trello cards` : ''}`);
    } catch (e) {
      console.warn(`✗ ${c.name}: ${e.message}`);
    }
  }
  console.log(`\nDone: ${audited} sites audited${trelloOn ? `, ${cards} Trello cards created` : ' (Trello not configured)'}.`);
}

main().catch(e => { console.error(e); process.exit(1); });
