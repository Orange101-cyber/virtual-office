// Shared Rank Tracker logic — used by the browser (RankTracker.jsx) and the
// daily GitHub Actions job (scripts/refresh-rankings.mjs), so both produce
// identical snapshots. Pure functions only: no Supabase, no fetch.

// Click-through-rate curve by ORGANIC position (rank_group).
export const CTR = (pos) => {
  if (!pos) return 0;
  const t = { 1: .28, 2: .15, 3: .11, 4: .08, 5: .06, 6: .05, 7: .04, 8: .033, 9: .028, 10: .025 };
  if (pos <= 10) return t[pos];
  if (pos <= 20) return .015;
  if (pos <= 30) return .008;
  if (pos <= 50) return .004;
  if (pos <= 100) return .002;
  return 0;
};

export const estTraffic = (pos, vol) => (vol == null ? null : Math.round(CTR(pos) * vol));

export const cleanDomain = (d = '') => String(d || '').trim().toLowerCase()
  .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '');

// Exact domain or a real subdomain of it. (The old check used endsWith(), so
// "abpower.com.au" also matched "myabpower.com.au".)
export const domainMatches = (itemDomain, target) => {
  const d = cleanDomain(itemDomain), t = cleanDomain(target);
  if (!d || !t) return false;
  return d === t || d.endsWith('.' + t);
};

const domainFrom = (u = '') => {
  try { return cleanDomain(new URL(u.startsWith('http') ? u : `https://${u}`).hostname); } catch { return ''; }
};

// How many top organic domains to keep per snapshot (for competitor discovery).
export const TOP_DOMAINS_KEPT = 20;

// Parse one DataForSEO /serp/google/organic/*/advanced result into a snapshot.
//   position      — organic rank (rank_group): what Wincher/Semrush/Ahrefs report
//   rank_absolute — position counting every SERP element (AIO, PAA, maps…)
//   competitors   — { domain: { position, url } } for tracked competitors,
//                   plus the top organic domains so new competitors can be
//                   suggested (and back-filled) without extra API calls.
export function parseSerp(result, targetDomain, competitorDomains = []) {
  const all = result?.items || [];
  const typeOf = (i) => i.type || i.item_type;
  const organic = all.filter(i => typeOf(i) === 'organic');

  let best = null;
  for (const it of organic) {
    if (!domainMatches(it.domain, targetDomain)) continue;
    const pos = it.rank_group ?? it.rank_absolute;
    if (!best || pos < best.position) best = { position: pos, rank_absolute: it.rank_absolute ?? null, url: it.url, title: it.title };
  }

  // Best position per organic domain.
  const byDomain = {};
  for (const it of organic) {
    const d = cleanDomain(it.domain);
    const pos = it.rank_group ?? it.rank_absolute;
    if (!d || pos == null) continue;
    if (!byDomain[d] || pos < byDomain[d].position) byDomain[d] = { position: pos, url: it.url || '' };
  }
  const competitors = {};
  Object.entries(byDomain)
    .sort((a, b) => a[1].position - b[1].position)
    .slice(0, TOP_DOMAINS_KEPT)
    .forEach(([d, v]) => { competitors[d] = v; });
  for (const c of competitorDomains) {
    const cd = cleanDomain(c);
    if (!cd) continue;
    const hit = Object.entries(byDomain).filter(([d]) => domainMatches(d, cd)).sort((a, b) => a[1].position - b[1].position)[0];
    competitors[cd] = hit ? hit[1] : { position: null, url: '' };
  }

  // AI Overview: presence + whether we're cited + our position + the references.
  const ai = all.find(i => typeOf(i) === 'ai_overview');
  let aiCited = false, aiPos = null;
  const aiSources = [];
  if (ai) {
    (ai.references || ai.items || []).forEach((r, idx) => {
      const url = r.url || r.link || '';
      const dom = cleanDomain(r.domain || r.source || domainFrom(url));
      if (url || r.title) aiSources.push({ title: r.title || r.source || dom, url, domain: dom });
      if (!aiCited && domainMatches(dom, targetDomain)) { aiCited = true; aiPos = idx + 1; }
    });
  }

  const collect = (types, max = 8) => {
    const out = [];
    all.filter(i => types.includes(typeOf(i))).forEach(el => {
      const subs = (Array.isArray(el.items) && el.items.length) ? el.items : [el];
      subs.forEach(s => {
        const url = s.url || s.link || s.source_url || s.expanded_element?.[0]?.url || '';
        const dom = cleanDomain(s.domain || s.source || s.expanded_element?.[0]?.domain || domainFrom(url));
        const title = s.title || s.question || s.alt || s.text || s.expanded_element?.[0]?.title || dom;
        if (url || title) out.push({ title, url, domain: dom });
      });
    });
    return out.slice(0, max);
  };
  const paa = collect(['people_also_ask']);
  const local = collect(['local_pack', 'map']);
  const forums = collect(['discussions_and_forums']);
  const images = collect(['images', 'image_pack']);

  const features = {
    ai_overview: !!ai, ai_overview_cited: aiCited, ai_overview_position: aiPos, ai_overview_sources: aiSources.slice(0, 10),
    people_also_ask: paa.length > 0, paa,
    local_pack: local.length > 0, local,
    discussions_forums: forums.length > 0, forums,
    images: images.length > 0, image_sources: images,
  };

  return {
    position: best?.position ?? null,
    rank_absolute: best?.rank_absolute ?? null,
    url: best?.url || '',
    title: best?.title || '',
    features,
    competitors,
  };
}

// Build the snapshot row written to rank_tracker_snapshots.
export function snapshotRow({ client_name, keyword, captured_on, parsed, volume }) {
  const p = parsed || {};
  return {
    client_name, keyword, captured_on,
    position: p.position ?? null,
    rank_absolute: p.rank_absolute ?? null,
    url: p.url || '',
    search_volume: volume ?? null,
    est_traffic: estTraffic(p.position ?? null, volume ?? null),
    features: p.features || null,
    competitors: p.competitors || null,
  };
}
