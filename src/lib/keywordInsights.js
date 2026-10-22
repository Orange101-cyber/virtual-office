// Keyword Research — deterministic keyword analysis.
//
// Pure functions (no network, no React) used by the Keyword Research page:
// keyword normalisation + variant detection, intent / question / local
// classification, relevance, opportunity scoring, quick wins, SEO actions,
// topic clustering and cannibalisation detection.
//
// Rule: never invent metrics. A missing value stays null and is reported as
// missing; scores built on incomplete data are marked provisional.

// ── Text helpers ──
const STOPWORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'at', 'by', 'with', 'from', 'my', 'your', 'our', 'is', 'are', 'be', 'it', 'its', 'do', 'does', 'i', 'you', 'we', 'me', 'can', 'should', 'how', 'what', 'why', 'when', 'where', 'which', 'who', 'will', 'vs', 'versus']);
// Words that change intent but not topic (ignored when comparing topics).
const MODIFIERS = new Set(['best', 'top', 'cheap', 'cheapest', 'affordable', 'good', 'great', 'near', 'nearby', 'local', 'review', 'reviews', 'rated', 'cost', 'costs', 'price', 'prices', 'pricing', 'fee', 'fees', 'rate', 'rates', 'quote', 'quotes', 'hire', 'buy', 'book', 'online', 'free', 'guide', 'tips', 'ideas', 'list', 'example', 'examples', 'meaning', 'definition', 'checklist', 'australia', 'australian', 'au', '2024', '2025', '2026', '2027']);

export const AU_LOCATIONS = ['australia', 'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'hobart', 'darwin', 'canberra', 'gold coast', 'sunshine coast', 'newcastle', 'wollongong', 'geelong', 'townsville', 'cairns', 'toowoomba', 'ballarat', 'bendigo', 'launceston', 'mackay', 'rockhampton', 'bundaberg', 'hervey bay', 'ipswich', 'logan', 'redcliffe', 'caboolture', 'north lakes', 'moreton bay', 'west end', 'qld', 'queensland', 'nsw', 'new south wales', 'vic', 'victoria', 'wa', 'western australia', 'sa', 'south australia', 'tas', 'tasmania', 'nt', 'act'];

export function tokens(s = '') {
  return String(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

// Light stemming: enough to treat plurals and -ing forms as the same word
// (refinance / refinancing / refinances → "refinanc").
export function stem(w) {
  if (w.length <= 3 || /^\d+$/.test(w)) return w;
  if (w.endsWith('ies') && w.length > 4) w = w.slice(0, -3) + 'y';
  else if (/(ches|shes|sses|xes|zes)$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) w = w.slice(0, -1);
  if (w.endsWith('ing') && w.length > 5) w = w.slice(0, -3);
  if (w.endsWith('e') && w.length > 4) w = w.slice(0, -1);
  return w;
}

const coreStems = (kw) => [...new Set(tokens(kw).filter(t => !STOPWORDS.has(t) && !MODIFIERS.has(t)).map(stem))];

// Same key = same keyword for SEO purposes (plural, word order, stopwords).
export function variantKey(kw) {
  return [...new Set(tokens(kw).filter(t => !STOPWORDS.has(t)).map(stem))].sort().join(' ');
}

export function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export const topicSimilarity = (a, b) => jaccard(coreStems(a), coreStems(b));

// ── Dedupe: keep the variant with the most search volume, remember the rest ──
export function dedupeKeywords(list) {
  const groups = new Map();
  for (const kw of list) {
    if (!kw?.keyword) continue;
    const key = variantKey(kw.keyword);
    if (!key) continue;
    const g = groups.get(key);
    if (!g) { groups.set(key, { ...kw, variants: [] }); continue; }
    const better = (kw.search_volume || 0) > (g.search_volume || 0);
    const keep = better ? { ...kw, variants: g.variants } : g;
    const other = better ? g.keyword : kw.keyword;
    if (other.toLowerCase() !== keep.keyword.toLowerCase() && !keep.variants.includes(other)) keep.variants.push(other);
    if (keep.sources || kw.source) keep.sources = [...new Set([...(g.sources || [g.source]), kw.source].filter(Boolean))];
    groups.set(key, keep);
  }
  return [...groups.values()];
}

// ── Classification ──
export const isQuestion = (kw) => /^(how|what|why|when|where|which|who|whom|whose|can|could|do|does|did|is|are|was|should|would|will)\b/i.test(String(kw).trim()) || /\?$/.test(kw);

export function localTerms(kw, extraLocations = []) {
  const text = ` ${tokens(kw).join(' ')} `;
  const all = [...new Set([...AU_LOCATIONS, ...extraLocations.map(l => tokens(l).join(' ')).filter(Boolean)])];
  const found = all.filter(loc => text.includes(` ${loc} `));
  if (/\bnear me\b/i.test(kw)) found.push('near me');
  return found;
}

const INTENTS = ['Informational', 'Navigational', 'Commercial', 'Transactional'];
export function normaliseIntent(label) {
  const l = String(label || '').toLowerCase();
  return INTENTS.find(i => i.toLowerCase() === l) || null;
}

export function heuristicIntent(kw, extraLocations = []) {
  const k = ` ${tokens(kw).join(' ')} `;
  if (isQuestion(kw) || /\b(guide|tips|ideas|meaning|definition|examples?|checklist|steps|explained|calculator|template)\b/.test(k)) return 'Informational';
  if (/\b(login|log in|sign in|contact|phone number|website|address|opening hours)\b/.test(k)) return 'Navigational';
  if (/\b(buy|hire|book|booking|quote|quotes|order|apply|appointment|for sale|near me|get a)\b/.test(k)) return 'Transactional';
  if (/\b(best|top|reviews?|compare|comparison|vs|versus|cheap|cheapest|affordable|cost|costs|price|prices|pricing|fees?|rates?|company|companies|agency|agencies|services?|specialists?|brokers?|experts?|providers?|contractors?|lawyers?|accountants?)\b/.test(k)) return 'Commercial';
  if (localTerms(kw, extraLocations).length) return 'Commercial';
  return 'Informational';
}

export const isCommercial = (intent) => intent === 'Commercial' || intent === 'Transactional';
const intentGroup = (intent) => (isCommercial(intent) ? 'commercial' : intent === 'Navigational' ? 'navigational' : 'informational');

// ── Relevance to the client (0–1) ──
export function buildContext({ seedTopic = '', niche = '', services = '', locations = '', contentGoal = 'Both' } = {}) {
  const lines = (s) => String(s || '').split(/\n|,|;/).map(x => x.trim()).filter(Boolean);
  const locs = lines(locations);
  return {
    seedStems: coreStems(seedTopic),
    contextStems: new Set([seedTopic, niche, ...lines(services)].flatMap(coreStems)),
    locations: locs,
    contentGoal,
  };
}

export function relevance(kw, ctx) {
  const stems = coreStems(kw).filter(s => !localTerms(s, ctx.locations).length);
  if (!stems.length) return 0.5;
  const hit = stems.filter(s => ctx.contextStems.has(s)).length;
  return Math.round((hit / stems.length) * 100) / 100;
}

// Attach classification fields to a keyword row (keeps existing fields).
export function annotateKeyword(kw, ctx, dataIntent) {
  const intent = normaliseIntent(dataIntent) || normaliseIntent(kw.intent_data) || null;
  return {
    ...kw,
    intent_data: intent || kw.intent_data || null,
    intent: intent || normaliseIntent(kw.intent) || heuristicIntent(kw.keyword, ctx.locations),
    intent_source: intent ? 'DataForSEO' : normaliseIntent(kw.intent) ? (kw.intent_source || 'AI') : 'pattern',
    is_question: isQuestion(kw.keyword),
    local_terms: localTerms(kw.keyword, ctx.locations),
    relevance: relevance(kw.keyword, ctx),
  };
}

// ── Search Console ──
// Typical organic CTR by position (industry benchmark, used only to flag
// "low CTR for its position" — never shown as the keyword's own CTR).
const EXPECTED_CTR = [0, 28, 15, 10, 7, 5, 4, 3, 2.5, 2, 1.8];
export const expectedCtr = (pos) => (pos == null ? null : pos <= 10 ? EXPECTED_CTR[Math.max(1, Math.round(pos))] : pos <= 20 ? 1 : 0.5);

export function indexGsc(rows = []) {
  const map = new Map();
  for (const r of rows) map.set(variantKey(r.term), r);
  return map;
}

export function gscTrend(current, previous) {
  if (!current || !previous) return null;
  const posDelta = previous.position && current.position ? +(current.position - previous.position).toFixed(1) : null;
  const clickDelta = previous.clicks != null ? current.clicks - previous.clicks : null;
  const declining = (posDelta != null && posDelta >= 3) || (previous.clicks >= 10 && current.clicks <= previous.clicks * 0.7);
  return { posDelta, clickDelta, declining };
}

// ── Opportunity score (0–100) ──
export const SCORE_WEIGHTS = [
  { key: 'relevance', label: 'Business relevance', weight: 25 },
  { key: 'ranking', label: 'Ranking opportunity', weight: 20 },
  { key: 'demand', label: 'Search demand', weight: 20 },
  { key: 'intent', label: 'Search intent alignment', weight: 15 },
  { key: 'gsc', label: 'Current GSC performance', weight: 10 },
  { key: 'feasibility', label: 'Competition feasibility', weight: 10 },
];

export function opportunityCategory(score) {
  if (score == null) return null;
  if (score >= 80) return 'Very High';
  if (score >= 60) return 'High';
  if (score >= 40) return 'Medium';
  if (score >= 20) return 'Low';
  return 'Very Low';
}

const rankValue = (p) => (p == null ? null : p <= 3 ? 0.4 : p <= 10 ? 1 : p <= 20 ? 0.85 : p <= 50 ? 0.5 : 0.25);

// kw: annotated keyword; signals: { gsc, gscLoaded, rank, rankLoaded }
export function scoreKeyword(kw, ctx, { gsc = null, gscLoaded = false, rank = null, rankLoaded = false } = {}) {
  const goal = ctx.contentGoal || 'Both';
  const intentFit = {
    'Blog Post': { Informational: 1, Commercial: 0.6, Transactional: 0.3, Navigational: 0.1 },
    'SEO Page': { Informational: 0.3, Commercial: 1, Transactional: 1, Navigational: 0.1 },
    Both: { Informational: 0.8, Commercial: 1, Transactional: 1, Navigational: 0.1 },
  }[goal] || {};
  const pos = gsc?.position ?? rank ?? null;
  const values = {
    relevance: kw.relevance ?? null,
    ranking: pos != null ? rankValue(pos) : (gscLoaded || rankLoaded) ? 0.3 : null,
    demand: kw.search_volume == null ? null : kw.search_volume <= 0 ? 0 : Math.min(1, Math.log10(kw.search_volume + 1) / Math.log10(5001)),
    intent: intentFit[kw.intent] ?? null,
    gsc: gsc ? (gsc.impressions >= 100 && gsc.ctr < (expectedCtr(gsc.position) || 0) * 0.6 ? 1 : gsc.impressions >= 100 ? 0.6 : 0.4) : gscLoaded ? 0.2 : null,
    feasibility: kw.kd == null ? null : Math.max(0, 1 - kw.kd / 100),
  };
  const factors = SCORE_WEIGHTS.map(f => ({ ...f, value: values[f.key] == null ? null : Math.round(values[f.key] * 100) / 100 }));
  const available = factors.filter(f => f.value != null);
  const weight = available.reduce((t, f) => t + f.weight, 0);
  const missing = factors.filter(f => f.value == null).map(f => f.label);
  // Search demand and relevance are essential; without them the score means little.
  if (values.demand == null || values.relevance == null || weight < 50) {
    return { score: null, category: null, status: 'insufficient', factors, missing };
  }
  const score = Math.round(available.reduce((t, f) => t + f.value * f.weight, 0) / weight * 100);
  return { score, category: opportunityCategory(score), status: missing.length ? 'provisional' : 'complete', factors, missing };
}

export function explainScore(s) {
  if (!s) return '';
  const lines = s.factors.map(f => `${f.label} (${f.weight}%): ${f.value == null ? 'no data' : Math.round(f.value * 100)}`);
  const head = s.status === 'insufficient' ? 'Insufficient data for a score'
    : `${s.score}/100 · ${s.category}${s.status === 'provisional' ? ' · provisional (missing data re-weighted)' : ''}`;
  return [head, ...lines].join('\n');
}

// ── Quick wins + recommended actions ──
export function quickWinReasons(kw, { gsc = null, trend = null, rank = null, page = null } = {}) {
  const reasons = [];
  const pos = gsc?.position ?? rank ?? null;
  if (pos != null && pos >= 4 && pos <= 20) reasons.push(`Ranks #${Math.round(pos)} — striking distance`);
  if (gsc && gsc.impressions >= 100 && gsc.ctr < (expectedCtr(gsc.position) || 0) * 0.6) reasons.push(`${gsc.impressions.toLocaleString()} impressions but ${gsc.ctr}% CTR`);
  if (trend?.declining) reasons.push('Declining in Search Console');
  if (kw.kd != null && kw.kd <= 30 && (kw.search_volume || 0) >= 20 && (kw.relevance ?? 0) >= 0.5) reasons.push(`Low difficulty (KD ${kw.kd})`);
  if (reasons.length && isCommercial(kw.intent)) reasons.push('Commercial intent');
  if (reasons.length && page) reasons.push('Existing page can be improved');
  return reasons;
}

export const isQuickWin = (reasons) => reasons.some(r => /striking distance|CTR|Declining|Low difficulty/.test(r));

export function recommendActions(kw, { gsc = null, rank = null, page = null, trend = null, cannibal = null } = {}) {
  const out = [];
  const pos = gsc?.position ?? rank ?? null;
  if (cannibal && (cannibal.severity === 'High' || cannibal.severity === 'Medium')) out.push('Investigate potential cannibalisation');
  if (gsc && gsc.impressions >= 100 && gsc.ctr < (expectedCtr(gsc.position) || 0) * 0.6) out.push('Improve metadata (title & meta description)');
  if (pos != null && pos >= 4 && pos <= 20) {
    out.push('Optimise the existing page');
    if (pos > 10) out.push('Expand content');
    out.push('Improve internal linking');
  } else if (trend?.declining) out.push('Refresh the ranking page');
  if (!out.length) {
    if (kw.intent === 'Navigational') out.push('Brand / navigational search — make sure the matching core page (home, contact, location) ranks');
    else if (page && isCommercial(kw.intent)) out.push(page.page_category === 'service' || page.page_category === 'location' ? 'Target on the existing service page' : 'Optimise the existing page');
    else if (page) out.push('Optimise the existing page');
    else if (isCommercial(kw.intent)) out.push('Target on a service page');
    else out.push('Create a supporting article');
  }
  return [...new Set(out)];
}

// ── Existing pages ──
export function matchPage(keyword, pages = [], min = 0.75) {
  let best = null;
  for (const p of pages) {
    for (const target of [p.focus_keyword, p.new_focus_keyword].filter(Boolean)) {
      const exact = variantKey(target) === variantKey(keyword);
      const sim = exact ? 1 : topicSimilarity(target, keyword);
      if (sim >= min && (!best || sim > best.sim)) best = { page: p, sim, target };
    }
  }
  return best;
}

// ── Clustering ──
// Links keywords that share a topic (core words) and an intent group; when
// SERP results are available, Google's own overlap decides close calls.
export function serpOverlap(a, b) {
  if (!a?.length || !b?.length) return null;
  const A = new Set(a.map(u => u.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/$/, '')));
  return b.filter(u => A.has(u.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/$/, ''))).length;
}

export function clusterKeywords(keywords, { serps = {}, pages = [] } = {}) {
  const n = keywords.length;
  const parent = keywords.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => { parent[find(a)] = find(b); };
  const groups = keywords.map(k => intentGroup(k.intent));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (groups[i] !== groups[j]) continue;   // never mix informational with commercial
      const a = keywords[i].keyword, b = keywords[j].keyword;
      if (variantKey(a) === variantKey(b)) { union(i, j); continue; }
      const lex = topicSimilarity(a, b);
      const overlap = serpOverlap(serps[a.toLowerCase()], serps[b.toLowerCase()]);
      const linked = overlap == null ? lex >= 0.5 : overlap >= 3 || (overlap >= 2 && lex >= 0.34) || lex >= 0.75;
      if (linked) union(i, j);
    }
  }

  const byRoot = new Map();
  keywords.forEach((k, i) => { const r = find(i); if (!byRoot.has(r)) byRoot.set(r, []); byRoot.get(r).push(k); });

  return [...byRoot.values()].map(members => {
    const sorted = [...members].sort((a, b) => (b.search_volume || 0) - (a.search_volume || 0) || a.keyword.length - b.keyword.length);
    return describeCluster(sorted[0].keyword, sorted, pages);
  }).sort((a, b) => (b.total_sv || 0) - (a.total_sv || 0));
}

export function recommendPageType(primary, intent, local) {
  if (intent === 'Transactional') return local ? 'Location / landing page' : 'Service / landing page';
  if (intent === 'Commercial') return local ? 'Location / service page' : 'Service page';
  if (intent === 'Navigational') return 'Existing core page (about / contact)';
  return isQuestion(primary) ? 'Blog (FAQ / how-to guide)' : 'Blog / guide';
}

// (Re)build a cluster's derived fields — also used after manual edits.
export function describeCluster(primaryKeyword, members, pages = [], extra = {}) {
  const primary = members.find(m => m.keyword === primaryKeyword) || members[0];
  const known = members.filter(m => m.kd != null);
  const page = members.map(m => matchPage(m.keyword, pages, 0.6)).filter(Boolean).sort((a, b) => b.sim - a.sim)[0] || null;
  const primaryKey = variantKey(primary.keyword);
  return {
    name: extra.name || primary.keyword.replace(/\b\w/g, c => c.toUpperCase()),
    suggested_title: extra.suggested_title || null,
    primary_keyword: primary.keyword,
    secondary_keywords: members.filter(m => m !== primary).map(m => m.keyword),
    variants: members.filter(m => m !== primary && variantKey(m.keyword) === primaryKey).map(m => m.keyword),
    keywords: members.map(m => m.keyword),
    total_sv: members.some(m => m.search_volume != null) ? members.reduce((t, m) => t + (m.search_volume || 0), 0) : null,
    avg_kd: known.length ? Math.round(known.reduce((t, m) => t + m.kd, 0) / known.length) : null,
    intent: primary.intent,
    page_type: recommendPageType(primary.keyword, primary.intent, (primary.local_terms || []).length > 0),
    target_page: page ? { title: page.page.title || page.page.focus_keyword, url: page.page.url, category: page.page.page_category } : null,
  };
}

// ── Cannibalisation ──
// Evidence sources: bucket-list pages that target the same keyword, and
// several URLs from the client's domain ranking for it (DataForSEO). GSC
// CSV exports don't include query→page pairs, so GSC adds page performance
// only. Several URLs ranking is not automatically cannibalisation.
const normUrl = (u = '') => String(u).toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');

export function detectCannibalisation({ keywords = [], pages = [], ranked = null, gscPages = [] }) {
  const pageByUrl = new Map(pages.filter(p => p.url).map(p => [normUrl(p.url), p]));
  const gscByUrl = new Map(gscPages.map(r => [normUrl(r.term), r]));
  const rankedByKey = new Map();
  for (const r of ranked || []) {
    if (!r.url) continue;
    const k = variantKey(r.keyword);
    if (!rankedByKey.has(k)) rankedByKey.set(k, new Map());
    const urls = rankedByKey.get(k);
    const u = normUrl(r.url);
    if (!urls.has(u) || urls.get(u).rank > r.rank) urls.set(u, { url: r.url, rank: r.rank });
  }

  // Candidate keywords: research keywords, every bucket-list target, and any
  // query the domain ranks for with more than one URL.
  const targets = new Map();
  for (const k of keywords) if (!targets.has(variantKey(k.keyword))) targets.set(variantKey(k.keyword), { keyword: k.keyword, intent: k.intent });
  for (const p of pages) for (const t of [p.focus_keyword, p.new_focus_keyword].filter(Boolean)) {
    const key = variantKey(t);
    if (!targets.has(key)) targets.set(key, { keyword: t, intent: heuristicIntent(t) });
  }
  for (const r of ranked || []) {
    const key = variantKey(r.keyword);
    if (!targets.has(key) && (rankedByKey.get(key)?.size || 0) >= 2) targets.set(key, { keyword: r.keyword, intent: heuristicIntent(r.keyword) });
  }

  const issues = [];
  for (const [key, t] of targets) {
    const urls = new Map();
    // Pages targeting the same keyword (exact variant), or a very close one
    for (const p of pages) {
      if (!p.url) continue;
      const best = Math.max(...[p.focus_keyword, p.new_focus_keyword].filter(Boolean).map(x => (variantKey(x) === key ? 1 : topicSimilarity(x, t.keyword))), 0);
      if (best >= 0.75) urls.set(normUrl(p.url), { url: p.url, targets: true, exactTarget: best === 1, page: p });
    }
    for (const [u, r] of rankedByKey.get(key) || []) {
      urls.set(u, { ...(urls.get(u) || { url: r.url, page: pageByUrl.get(u) || null }), rank: r.rank });
    }
    if (urls.size < 2) continue;

    const list = [...urls.values()].map(x => {
      const g = gscByUrl.get(normUrl(x.url));
      return { ...x, clicks: g?.clicks ?? null, impressions: g?.impressions ?? null };
    });
    const rankedUrls = list.filter(x => x.rank != null);
    const top20 = rankedUrls.filter(x => x.rank <= 20);
    const targeting = list.filter(x => x.targets);
    const exactTargeting = list.filter(x => x.exactTarget);
    const cats = new Set(list.map(x => x.page?.page_category).filter(Boolean));
    const mixedTypes = cats.has('blog') && (cats.has('service') || cats.has('location') || cats.has('landing'));

    let severity;
    if (top20.length >= 2 && (targeting.length >= 1 || top20.filter(x => x.rank <= 10).length >= 2)) severity = 'High';
    else if (exactTargeting.length >= 2 || (top20.length >= 2)) severity = 'Medium';
    else if (rankedUrls.length >= 2 || targeting.length >= 2) severity = 'Low';
    else severity = 'Insufficient Data';
    // A blog and a service page can legitimately share a topic with different intents.
    if (mixedTypes && severity === 'High') severity = 'Medium';
    if (ranked == null && targeting.length >= 2 && exactTargeting.length < 2) severity = 'Insufficient Data';

    const wantType = isCommercial(t.intent) ? ['service', 'location', 'landing'] : ['blog'];
    const preferred = [...list].sort((a, b) =>
      (a.rank ?? 999) - (b.rank ?? 999)
      || (wantType.includes(b.page?.page_category) ? 1 : 0) - (wantType.includes(a.page?.page_category) ? 1 : 0)
      || (b.exactTarget ? 1 : 0) - (a.exactTarget ? 1 : 0)
      || (b.clicks || 0) - (a.clicks || 0))[0];

    const actions = [];
    if (mixedTypes) actions.push('Keep both pages if they serve distinct intents — differentiate the blog’s target keyword and link it to the preferred page');
    if (severity === 'High' || severity === 'Medium') {
      actions.push(`Optimise the preferred page (${preferred.url}) for “${t.keyword}”`);
      if (!mixedTypes) actions.push('Differentiate target keywords on the other page(s)');
      actions.push('Internal links with this anchor text should point to the preferred page');
      if (severity === 'High' && !mixedTypes) actions.push('If the pages say substantially the same thing, consolidate them and 301-redirect the weaker URL (review first)');
    } else if (severity === 'Low') actions.push('Monitor — minor overlap, no strong evidence of harmful competition');
    else actions.push('Not enough evidence yet — check Search Console (query → page) before acting');

    issues.push({
      keyword: t.keyword, intent: t.intent, severity,
      competing: list.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)).map(x => ({ url: x.url, rank: x.rank ?? null, targets: !!x.targets, clicks: x.clicks, impressions: x.impressions, category: x.page?.page_category || null })),
      preferred_url: preferred.url,
      actions,
      evidence: [
        targeting.length >= 2 ? `${targeting.length} bucket-list pages target it` : null,
        rankedUrls.length >= 2 ? `${rankedUrls.length} URLs rank for it (${rankedUrls.map(x => `#${x.rank}`).join(', ')})` : null,
      ].filter(Boolean),
    });
  }
  const order = { High: 0, Medium: 1, Low: 2, 'Insufficient Data': 3 };
  issues.sort((a, b) => order[a.severity] - order[b.severity] || (b.evidence.length - a.evidence.length) || a.keyword.length - b.keyword.length);
  // Same set of competing URLs = one issue; list the other keywords on it.
  const merged = new Map();
  for (const i of issues) {
    const key = i.competing.map(c => normUrl(c.url)).sort().join('|');
    const first = merged.get(key);
    if (first) first.related_keywords.push(i.keyword);
    else merged.set(key, { ...i, related_keywords: [] });
  }
  return [...merged.values()];
}
