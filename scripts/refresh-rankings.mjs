// Automated daily rank refresh for the Rank Tracker.
// Runs in GitHub Actions (Node 20+, global fetch). Reads tracked keywords from
// Supabase, checks each keyword's Google position via DataForSEO, and writes one
// snapshot per keyword per day — the same data the in-app "Refresh rankings"
// button produces, but hands-free.
//
// Env required:
//   SUPABASE_URL, SUPABASE_ANON_KEY, DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const DFS_LOGIN = process.env.DATAFORSEO_LOGIN;
const DFS_PASSWORD = process.env.DATAFORSEO_PASSWORD;
const LOCATION_AU = 2036;
const LANGUAGE = 'en';

if (!SUPABASE_URL || !SUPABASE_KEY || !DFS_LOGIN || !DFS_PASSWORD) {
  console.error('Missing env: need SUPABASE_URL, SUPABASE_ANON_KEY, DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD');
  process.exit(1);
}

const sb = (path, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...opts,
  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
});

const dfs = (endpoint, payload) => fetch(`https://api.dataforseo.com/v3${endpoint}`, {
  method: 'POST',
  headers: { Authorization: 'Basic ' + Buffer.from(`${DFS_LOGIN}:${DFS_PASSWORD}`).toString('base64'), 'Content-Type': 'application/json' },
  body: JSON.stringify(Array.isArray(payload) ? payload : [payload]),
}).then(r => r.json());

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
const clean = (d = '') => d.replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./, '');
const today = () => new Date().toISOString().slice(0, 10);

async function getRank(keyword, domain, device) {
  const data = await dfs('/serp/google/organic/live/advanced', {
    keyword, location_code: LOCATION_AU, language_code: LANGUAGE, device: device || 'desktop', depth: 100,
  });
  const items = (data.tasks?.[0]?.result?.[0]?.items || []).filter(i => i.type === 'organic');
  const cd = clean(domain);
  let best = null;
  for (const it of items) {
    const d = (it.domain || '').replace(/^www\./, '');
    if (d === cd || d.endsWith('.' + cd) || d.endsWith(cd)) {
      if (!best || (it.rank_absolute || 999) < best.position) best = { position: it.rank_absolute, url: it.url };
    }
  }
  return best;
}

async function getVolumes(keywords) {
  const map = {};
  for (let i = 0; i < keywords.length; i += 500) {
    const chunk = keywords.slice(i, i + 500);
    try {
      const data = await dfs('/keywords_data/google_ads/search_volume/live', { keywords: chunk, location_code: LOCATION_AU, language_code: LANGUAGE });
      (data.tasks?.[0]?.result || []).forEach(r => { map[(r.keyword || '').toLowerCase().trim()] = r.search_volume || 0; });
    } catch (e) { console.warn('volume batch failed:', e.message); }
  }
  return map;
}

async function pool(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  }
  return out;
}

async function main() {
  const day = today();
  const res = await sb('rank_tracker_keywords?select=id,client_name,keyword,target_domain,device');
  if (!res.ok) { console.error('Failed to read keywords:', await res.text()); process.exit(1); }
  const keywords = await res.json();
  if (!keywords.length) { console.log('No tracked keywords. Nothing to do.'); return; }
  console.log(`Refreshing ${keywords.length} keywords for ${day}…`);

  const volMap = await getVolumes([...new Set(keywords.map(k => k.keyword))]);

  let ok = 0, ranked = 0;
  await pool(keywords, 5, async (k) => {
    if (!k.target_domain) return;
    let position = null, url = '';
    try {
      const r = await getRank(k.keyword, k.target_domain, k.device);
      if (r) { position = r.position; url = r.url; ranked++; }
    } catch (e) { console.warn(`rank failed for "${k.keyword}":`, e.message); }
    const vol = volMap[k.keyword.toLowerCase()] ?? null;
    const est = Math.round(CTR(position) * (vol || 0));

    // One row per keyword per day: clear today's then insert.
    await sb(`rank_tracker_snapshots?client_name=eq.${encodeURIComponent(k.client_name)}&keyword=eq.${encodeURIComponent(k.keyword)}&captured_on=eq.${day}`, { method: 'DELETE' });
    const ins = await sb('rank_tracker_snapshots', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ client_name: k.client_name, keyword: k.keyword, captured_on: day, position, url, search_volume: vol, est_traffic: est }),
    });
    if (ins.ok) ok++; else console.warn('insert failed:', await ins.text());
  });

  console.log(`Done: ${ok}/${keywords.length} snapshots written, ${ranked} ranked in top 100.`);
}

main().catch(e => { console.error(e); process.exit(1); });
