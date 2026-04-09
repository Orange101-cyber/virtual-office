import { supabase } from './supabase';

const LOGIN = import.meta.env.VITE_DATAFORSEO_LOGIN;
const PASSWORD = import.meta.env.VITE_DATAFORSEO_PASSWORD;
const BASE_URL = 'https://api.dataforseo.com/v3';
const LOCATION_AU = 2036; // Australia
const LANGUAGE = 'en';
const CACHE_DAYS = 7;

function authHeader() {
  if (!LOGIN || !PASSWORD) throw new Error('DataForSEO credentials not configured');
  return 'Basic ' + btoa(`${LOGIN}:${PASSWORD}`);
}

async function callEndpoint(path, payload) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(Array.isArray(payload) ? payload : [payload]),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DataForSEO error ${res.status}: ${text.substring(0, 200)}`);
  }
  const data = await res.json();
  if (data.status_code !== 20000) {
    throw new Error(data.status_message || 'DataForSEO API error');
  }
  return data;
}

// ── Cache helpers ──
async function getCached(key) {
  try {
    const { data } = await supabase
      .from('keyword_metrics').select('*').eq('cache_key', key).single();
    if (!data) return null;
    const ageDays = (Date.now() - new Date(data.fetched_at).getTime()) / 86400000;
    if (ageDays > CACHE_DAYS) return null;
    return data.data;
  } catch { return null; }
}

async function setCached(key, data) {
  try {
    await supabase.from('keyword_metrics').upsert({
      cache_key: key, data, fetched_at: new Date().toISOString(),
    }, { onConflict: 'cache_key' });
  } catch (err) {
    console.warn('Cache write failed:', err);
  }
}

// ── Search volume for one or more keywords ──
export async function getSearchVolume(keywords) {
  if (!keywords?.length) return [];
  const cacheKey = `sv:${keywords.map(k => k.toLowerCase()).sort().join('|')}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const data = await callEndpoint('/keywords_data/google_ads/search_volume/live', {
    keywords,
    location_code: LOCATION_AU,
    language_code: LANGUAGE,
  });
  const result = (data.tasks?.[0]?.result || []).map(item => ({
    keyword: item.keyword,
    search_volume: item.search_volume || 0,
    cpc: item.cpc || 0,
    competition: item.competition || 0,
    competition_index: item.competition_index || 0,
  }));
  await setCached(cacheKey, result);
  return result;
}

// ── Keyword difficulty ──
export async function getKeywordDifficulty(keywords) {
  if (!keywords?.length) return [];
  const cacheKey = `kd:${keywords.map(k => k.toLowerCase()).sort().join('|')}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const data = await callEndpoint('/dataforseo_labs/google/bulk_keyword_difficulty/live', {
    keywords,
    location_code: LOCATION_AU,
    language_code: LANGUAGE,
  });
  const items = data.tasks?.[0]?.result?.[0]?.items || [];
  const result = items.map(item => ({
    keyword: item.keyword,
    kd: item.keyword_difficulty || 0,
  }));
  await setCached(cacheKey, result);
  return result;
}

// ── Combined: SV + KD + CPC in one call ──
export async function getKeywordMetrics(keywords) {
  if (!keywords?.length) return [];
  const [svData, kdData] = await Promise.all([
    getSearchVolume(keywords).catch(() => []),
    getKeywordDifficulty(keywords).catch(() => []),
  ]);

  const kdMap = {};
  kdData.forEach(k => { kdMap[k.keyword.toLowerCase()] = k.kd; });

  return svData.map(item => ({
    ...item,
    kd: kdMap[item.keyword.toLowerCase()] ?? null,
  }));
}

// ── Related keyword ideas ──
export async function getRelatedKeywords(seed, limit = 30) {
  const cacheKey = `related:${seed.toLowerCase().trim()}:${limit}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const data = await callEndpoint('/dataforseo_labs/google/related_keywords/live', {
    keyword: seed,
    location_code: LOCATION_AU,
    language_code: LANGUAGE,
    depth: 2,
    limit,
  });
  const items = data.tasks?.[0]?.result?.[0]?.items || [];
  const result = items.map(item => {
    const info = item.keyword_data?.keyword_info || {};
    return {
      keyword: item.keyword_data?.keyword || '',
      search_volume: info.search_volume || 0,
      cpc: info.cpc || 0,
      competition: info.competition || 0,
      kd: item.keyword_data?.keyword_properties?.keyword_difficulty || 0,
    };
  });
  await setCached(cacheKey, result);
  return result;
}

// ── SERP results for a keyword (top 10) ──
export async function getSerpResults(keyword) {
  const cacheKey = `serp:${keyword.toLowerCase().trim()}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const data = await callEndpoint('/serp/google/organic/live/advanced', {
    keyword,
    location_code: LOCATION_AU,
    language_code: LANGUAGE,
    device: 'desktop',
    depth: 10,
  });
  const result = data.tasks?.[0]?.result?.[0] || null;
  if (result) {
    const simplified = {
      items: (result.items || []).filter(i => i.type === 'organic').map(i => ({
        rank: i.rank_absolute,
        title: i.title,
        url: i.url,
        domain: i.domain,
        description: i.description,
      })),
      paa: (result.items || []).filter(i => i.type === 'people_also_ask').flatMap(i =>
        (i.items || []).map(q => ({
          question: q.title,
          answer: q.expanded_element?.[0]?.description || '',
        }))
      ),
      total_count: result.total_count,
    };
    await setCached(cacheKey, simplified);
    return simplified;
  }
  return null;
}

// ── Check if a domain ranks for a keyword ──
export async function checkDomainRanking(keyword, domain) {
  const serp = await getSerpResults(keyword);
  if (!serp?.items) return null;
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./, '');
  const match = serp.items.find(item => {
    const itemDomain = (item.domain || '').replace(/^www\./, '');
    return itemDomain === cleanDomain || itemDomain.endsWith(cleanDomain);
  });
  return match ? { rank: match.rank, url: match.url, title: match.title } : null;
}

// ── Backlinks summary for a URL ──
export async function getBacklinksSummary(url) {
  const cacheKey = `bl:${url.toLowerCase().trim()}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const data = await callEndpoint('/backlinks/summary/live', {
    target: url,
    internal_list_limit: 10,
    backlinks_status_type: 'live',
  });
  const result = data.tasks?.[0]?.result?.[0] || null;
  if (result) {
    const simplified = {
      backlinks: result.backlinks || 0,
      referring_domains: result.referring_domains || 0,
      referring_main_domains: result.referring_main_domains || 0,
      rank: result.rank || 0,
      first_seen: result.first_seen,
      last_seen: result.last_seen,
    };
    await setCached(cacheKey, simplified);
    return simplified;
  }
  return null;
}

// ── People Also Ask questions ──
export async function getPeopleAlsoAsk(keyword) {
  const serp = await getSerpResults(keyword);
  return serp?.paa || [];
}

export function isConfigured() {
  return !!(LOGIN && PASSWORD);
}
