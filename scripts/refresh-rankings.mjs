// Automated daily rank refresh for the Rank Tracker.
// Runs in GitHub Actions (Node 20+, global fetch).
//
//  1. Reads ALL tracked keywords + competitors from Supabase (paged — the API
//     returns at most 1,000 rows per request, which used to silently drop
//     about half the keywords).
//  2. Checks each unique keyword ONCE (a keyword tracked by two clients, or
//     twice by the same client, is fetched once), using DataForSEO's Standard
//     queue (task_post → tasks_ready → task_get). It's much cheaper than the Live
//     endpoint and fine for an unattended job.
//  3. Upserts one snapshot per keyword per day (needs supabase/rank_tracker_v2.sql).
//     Open Rank Tracker pages update live as rows land.
//
// Env required:
//   SUPABASE_URL, SUPABASE_ANON_KEY, DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD
// Optional:
//   ONLY_CLIENT   — refresh just this client (exact name)
//   MAX_WAIT_MIN  — how long to wait for queued SERPs (default 100)

import { parseSerp, snapshotRow, cleanDomain } from '../src/lib/rankParse.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const DFS_LOGIN = process.env.DATAFORSEO_LOGIN;
const DFS_PASSWORD = process.env.DATAFORSEO_PASSWORD;
const ONLY_CLIENT = process.env.ONLY_CLIENT || '';
const MAX_WAIT_MIN = Number(process.env.MAX_WAIT_MIN || 100);
const LOCATION_AU = 2036;
const LANGUAGE = 'en';
const DEPTH = 100;

const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'].filter(k => !process.env[k]);
if (missing.length) {
  console.error(`::error::Missing env: ${missing.join(', ')}. Add DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD under GitHub → Settings → Secrets and variables → Actions.`);
  process.exit(1);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

const sb = (path, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...opts,
  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
});

// Read every row of a table, 1,000 at a time.
async function sbAll(table, select, { optional = false } = {}) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const res = await sb(`${table}?select=${select}&order=id`, { headers: { Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } });
    if (!res.ok) {
      const t = await res.text();
      if (optional) { console.warn(`(skipping ${table}: ${t.slice(0, 120)})`); return []; }
      throw new Error(`Failed to read ${table}: ${t}`);
    }
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

const dfsAuth = 'Basic ' + Buffer.from(`${DFS_LOGIN}:${DFS_PASSWORD}`).toString('base64');
async function dfs(endpoint, payload, method = 'POST') {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`https://api.dataforseo.com/v3${endpoint}`, {
        method,
        headers: { Authorization: dfsAuth, 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify(Array.isArray(payload) ? payload : [payload]) : undefined,
      });
      const j = await res.json();
      if (j.status_code === 40200) throw Object.assign(new Error('DataForSEO: insufficient balance (40200)'), { fatal: true });
      if (j.status_code === 40100 || res.status === 401) throw Object.assign(new Error('DataForSEO: bad login/password (40100)'), { fatal: true });
      return j;
    } catch (e) {
      if (e.fatal || attempt >= 4) throw e;
      await sleep(2000 * attempt);
    }
  }
}

async function getVolumes(keywords) {
  const map = {};
  for (let i = 0; i < keywords.length; i += 1000) {
    const chunk = keywords.slice(i, i + 1000);
    try {
      const data = await dfs('/keywords_data/google_ads/search_volume/live', { keywords: chunk, location_code: LOCATION_AU, language_code: LANGUAGE });
      (data.tasks?.[0]?.result || []).forEach(r => {
        // Keep null when Google has no data (was turned into 0 before, which looked like "no searches").
        map[(r.keyword || '').toLowerCase().trim()] = r.search_volume ?? null;
      });
    } catch (e) {
      if (e.fatal) throw e;
      console.warn('volume batch failed:', e.message);
    }
  }
  return map;
}

// Queue SERP tasks (100 per request), then collect results as they become ready.
async function fetchSerps(jobs) {
  const results = new Map();          // jobKey -> result
  const pending = new Map();          // taskId -> jobKey
  for (let i = 0; i < jobs.length; i += 100) {
    const chunk = jobs.slice(i, i + 100);
    const res = await dfs('/serp/google/organic/task_post', chunk.map(j => ({
      keyword: j.keyword, location_code: LOCATION_AU, language_code: LANGUAGE,
      device: j.device, depth: DEPTH, tag: j.key,
    })));
    (res.tasks || []).forEach((t, idx) => {
      if (t.status_code === 20100 && t.id) pending.set(t.id, t.data?.tag || chunk[idx].key);
      else console.warn(`task_post failed for "${chunk[idx].keyword}": ${t.status_code} ${t.status_message}`);
    });
  }
  console.log(`Queued ${pending.size}/${jobs.length} SERP tasks.`);

  const collect = async (id) => {
    const r = await dfs(`/serp/google/organic/task_get/advanced/${id}`, null, 'GET');
    const t = r.tasks?.[0];
    if (t?.status_code === 20000) { results.set(pending.get(id), t.result?.[0] || null); pending.delete(id); return true; }
    if (t && t.status_code >= 40000 && t.status_code !== 40602) { // 40602 = still in queue
      console.warn(`task ${id} failed: ${t.status_code} ${t.status_message}`);
      results.set(pending.get(id), null); pending.delete(id); return true;
    }
    return false;
  };

  const deadline = Date.now() + MAX_WAIT_MIN * 60000;
  while (pending.size && Date.now() < deadline) {
    await sleep(20000);
    const ready = await dfs('/serp/google/organic/tasks_ready', null, 'GET');
    const ids = (ready.tasks?.[0]?.result || []).map(t => t.id).filter(id => pending.has(id));
    for (let i = 0; i < ids.length; i += 20) await Promise.all(ids.slice(i, i + 20).map(id => collect(id).catch(e => console.warn(e.message))));
    console.log(`  … ${results.size}/${jobs.length} collected`);
  }
  // Final sweep: ask for anything still outstanding directly.
  for (const id of [...pending.keys()]) await collect(id).catch(() => {});
  if (pending.size) console.warn(`::warning::${pending.size} SERP tasks were not ready within ${MAX_WAIT_MIN} min — those keywords are skipped today.`);
  return results;
}

async function upsertSnapshots(rows) {
  let ok = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const res = await sb('rank_tracker_snapshots?on_conflict=client_name,keyword,captured_on', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk),
    });
    if (res.ok) ok += chunk.length;
    else {
      const t = await res.text();
      if (/42P10|PGRST204|rank_absolute|competitors|position_type/.test(t)) {
        console.error('::error::Database is missing the v2 changes — run supabase/rank_tracker_v2.sql first. ' + t);
        process.exit(1);
      }
      console.warn('upsert failed:', t.slice(0, 300));
    }
  }
  return ok;
}

async function main() {
  const day = today();
  let keywords = await sbAll('rank_tracker_keywords', 'id,client_name,keyword,target_domain,device');
  if (ONLY_CLIENT) keywords = keywords.filter(k => k.client_name === ONLY_CLIENT);
  const competitorsRows = await sbAll('rank_tracker_competitors', 'id,client_name,domain', { optional: true });
  if (!keywords.length) { console.log('No tracked keywords. Nothing to do.'); return; }

  const compByClient = {};
  competitorsRows.forEach(c => { (compByClient[c.client_name] ||= []).push(c.domain); });

  // One snapshot per (client, keyword) per day; skip keywords with no domain.
  const seen = new Set();
  const tracked = [];
  let noDomain = 0;
  for (const k of keywords) {
    if (!k.target_domain) { noDomain++; continue; }
    const id = `${k.client_name}\u0000${k.keyword}`;
    if (seen.has(id)) continue;
    seen.add(id); tracked.push(k);
  }

  // One SERP per unique (keyword, device), shared across clients.
  const jobKey = (k) => `${(k.device || 'desktop')}|${k.keyword.toLowerCase().trim()}`;
  const jobs = [...new Map(tracked.map(k => [jobKey(k), { key: jobKey(k), keyword: k.keyword.trim(), device: k.device || 'desktop' }])).values()];
  console.log(`${day}: ${keywords.length} tracked rows → ${tracked.length} keyword/client pairs → ${jobs.length} unique SERPs. ${noDomain ? `(${noDomain} skipped: no target domain)` : ''}`);

  const volMap = await getVolumes([...new Set(jobs.map(j => j.keyword))]);
  const serps = await fetchSerps(jobs);

  const rows = [];
  let ranked = 0;
  for (const k of tracked) {
    if (!serps.has(jobKey(k))) continue; // not collected — don't overwrite with a blank
    const parsed = parseSerp(serps.get(jobKey(k)), cleanDomain(k.target_domain), compByClient[k.client_name] || []);
    if (parsed.position != null) ranked++;
    rows.push({ ...snapshotRow({ client_name: k.client_name, keyword: k.keyword, captured_on: day, parsed, volume: volMap[k.keyword.toLowerCase().trim()] ?? null }), position_type: 'organic' });
  }
  const ok = await upsertSnapshots(rows);
  console.log(`Done: ${ok}/${tracked.length} snapshots written, ${ranked} ranked in top ${DEPTH}.`);
  if (ok < tracked.length * 0.9) process.exitCode = 1; // make a bad run show red in GitHub Actions
}

main().catch(e => { console.error('::error::' + e.message); process.exit(1); });
