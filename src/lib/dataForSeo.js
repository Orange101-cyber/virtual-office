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
      source: 'related',
    };
  });
  await setCached(cacheKey, result);
  return result;
}

// ── Keyword suggestions (autocomplete-based) ──
export async function getKeywordSuggestions(seed, limit = 50) {
  const cacheKey = `suggestions:${seed.toLowerCase().trim()}:${limit}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const data = await callEndpoint('/dataforseo_labs/google/keyword_suggestions/live', {
    keyword: seed,
    location_code: LOCATION_AU,
    language_code: LANGUAGE,
    include_seed_keyword: false,
    limit,
  });
  const items = data.tasks?.[0]?.result?.[0]?.items || [];
  const result = items.map(item => {
    const info = item.keyword_info || {};
    return {
      keyword: item.keyword || '',
      search_volume: info.search_volume || 0,
      cpc: info.cpc || 0,
      competition: info.competition || 0,
      kd: item.keyword_properties?.keyword_difficulty || 0,
      source: 'suggestion',
    };
  });
  await setCached(cacheKey, result);
  return result;
}

// ── Keyword ideas (Google Keyword Planner data) ──
export async function getKeywordIdeas(seeds, limit = 50) {
  const seedsArr = Array.isArray(seeds) ? seeds : [seeds];
  const cacheKey = `ideas:${seedsArr.map(s => s.toLowerCase()).sort().join('|')}:${limit}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const data = await callEndpoint('/dataforseo_labs/google/keyword_ideas/live', {
    keywords: seedsArr,
    location_code: LOCATION_AU,
    language_code: LANGUAGE,
    limit,
  });
  const items = data.tasks?.[0]?.result?.[0]?.items || [];
  const result = items.map(item => {
    const info = item.keyword_info || {};
    return {
      keyword: item.keyword || '',
      search_volume: info.search_volume || 0,
      cpc: info.cpc || 0,
      competition: info.competition || 0,
      kd: item.keyword_properties?.keyword_difficulty || 0,
      source: 'idea',
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

// ── Crawl a live URL for on-page audit ──
export async function crawlPage(url) {
  const cacheKey = `crawl:${url.toLowerCase().trim()}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const data = await callEndpoint('/on_page/instant_pages', {
    url,
    enable_javascript: true,
    enable_browser_rendering: true,
    load_resources: true,
    store_raw_html: false,
  });
  const result = data.tasks?.[0]?.result?.[0] || null;
  if (!result) return null;

  const page = result.items?.[0] || null;
  if (!page) return null;

  // Extract useful fields for the SEO Checker
  const simplified = {
    url: page.url,
    status_code: page.status_code,
    onpage_score: page.onpage_score || 0,
    meta: {
      title: page.meta?.title || '',
      description: page.meta?.description || '',
      canonical: page.meta?.canonical || '',
      charset: page.meta?.charset,
      favicon: page.meta?.favicon,
      follow: page.meta?.follow,
      generator: page.meta?.generator,
      htags: page.meta?.htags || {},
      internal_links_count: page.meta?.internal_links_count || 0,
      external_links_count: page.meta?.external_links_count || 0,
      inbound_links_count: page.meta?.inbound_links_count || 0,
      images_count: page.meta?.images_count || 0,
      images_size: page.meta?.images_size || 0,
      scripts_count: page.meta?.scripts_count || 0,
      stylesheets_count: page.meta?.stylesheets_count || 0,
      title_length: page.meta?.title?.length || 0,
      description_length: page.meta?.description?.length || 0,
      render_blocking_scripts_count: page.meta?.render_blocking_scripts_count || 0,
      render_blocking_stylesheets_count: page.meta?.render_blocking_stylesheets_count || 0,
      cumulative_layout_shift: page.meta?.cumulative_layout_shift,
      meta_keywords: page.meta?.meta_keywords,
      deprecated_tags: page.meta?.deprecated_tags,
      duplicate_meta_tags: page.meta?.duplicate_meta_tags,
      content: {
        plain_text_size: page.meta?.content?.plain_text_size || 0,
        plain_text_rate: page.meta?.content?.plain_text_rate || 0,
        plain_text_word_count: page.meta?.content?.plain_text_word_count || 0,
        automated_readability_index: page.meta?.content?.automated_readability_index,
      },
    },
    page_timing: {
      time_to_interactive: page.page_timing?.time_to_interactive || 0,
      dom_complete: page.page_timing?.dom_complete || 0,
      largest_contentful_paint: page.page_timing?.largest_contentful_paint || 0,
      first_input_delay: page.page_timing?.first_input_delay || 0,
      connection_time: page.page_timing?.connection_time || 0,
      time_to_secure_connection: page.page_timing?.time_to_secure_connection || 0,
      request_sent_time: page.page_timing?.request_sent_time || 0,
      waiting_time: page.page_timing?.waiting_time || 0,
      download_time: page.page_timing?.download_time || 0,
      duration_time: page.page_timing?.duration_time || 0,
      fetch_start: page.page_timing?.fetch_start || 0,
      fetch_end: page.page_timing?.fetch_end || 0,
    },
    checks: page.checks || {},
    total_dom_size: page.total_dom_size || 0,
    custom_js_response: page.custom_js_response || {},
    size: page.size || 0,
    encoded_size: page.encoded_size || 0,
    total_transfer_size: page.total_transfer_size || 0,
    fetch_time: page.fetch_time,
    cache_control: page.cache_control,
    fetch_timing: page.fetch_timing,
    broken_resources: page.broken_resources || false,
    broken_tests: page.broken_tests || false,
    content_encoding: page.content_encoding,
    media_type: page.media_type,
    server: page.server,
    last_modified: page.last_modified,
    resource_errors: page.resource_errors || {},
  };

  await setCached(cacheKey, simplified);
  return simplified;
}

// ── SERP Features analysis ──
export async function getSerpFeatures(keyword) {
  const cacheKey = `serp_features:${keyword.toLowerCase().trim()}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const data = await callEndpoint('/serp/google/organic/live/advanced', {
    keyword,
    location_code: LOCATION_AU,
    language_code: LANGUAGE,
    device: 'desktop',
    depth: 20,
  });
  const result = data.tasks?.[0]?.result?.[0] || null;
  if (!result) return null;

  // Extract features from items
  const items = result.items || [];
  const features = {
    has_featured_snippet: items.some(i => i.type === 'featured_snippet'),
    has_people_also_ask: items.some(i => i.type === 'people_also_ask'),
    has_related_searches: items.some(i => i.type === 'related_searches'),
    has_video: items.some(i => i.type === 'video' || i.type === 'videos'),
    has_images: items.some(i => i.type === 'images' || i.type === 'image_pack'),
    has_knowledge_graph: items.some(i => i.type === 'knowledge_graph'),
    has_local_pack: items.some(i => i.type === 'local_pack' || i.type === 'map'),
    has_shopping: items.some(i => i.type === 'shopping'),
    has_top_stories: items.some(i => i.type === 'top_stories'),
    has_twitter: items.some(i => i.type === 'twitter'),
    featured_snippet: items.find(i => i.type === 'featured_snippet'),
    paa_questions: items.filter(i => i.type === 'people_also_ask')
      .flatMap(i => (i.items || []).map(q => q.title)),
    related_searches: items.filter(i => i.type === 'related_searches')
      .flatMap(i => i.items || []),
    top_10: items.filter(i => i.type === 'organic').slice(0, 10).map(i => ({
      rank: i.rank_absolute,
      title: i.title,
      url: i.url,
      domain: i.domain,
      description: i.description,
    })),
  };

  await setCached(cacheKey, features);
  return features;
}

// ── Ranked Keywords for a URL (all keywords a page ranks for) ──
export async function getRankedKeywordsForUrl(url, limit = 50) {
  const cacheKey = `ranked:${url.toLowerCase().trim()}:${limit}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const data = await callEndpoint('/dataforseo_labs/google/ranked_keywords/live', {
    target: url,
    location_code: LOCATION_AU,
    language_code: LANGUAGE,
    limit,
    load_rank_absolute: true,
  });
  const items = data.tasks?.[0]?.result?.[0]?.items || [];
  const result = items.map(item => ({
    keyword: item.keyword_data?.keyword || '',
    rank: item.ranked_serp_element?.serp_item?.rank_absolute || null,
    url: item.ranked_serp_element?.serp_item?.url || '',
    search_volume: item.keyword_data?.keyword_info?.search_volume || 0,
    kd: item.keyword_data?.keyword_properties?.keyword_difficulty || 0,
    cpc: item.keyword_data?.keyword_info?.cpc || 0,
    traffic: item.ranked_serp_element?.etv || 0, // estimated traffic
  }));
  await setCached(cacheKey, result);
  return result;
}

// ── Search Intent classification ──
export async function getSearchIntent(keywords) {
  if (!keywords?.length) return [];
  const cacheKey = `intent:${keywords.map(k => k.toLowerCase()).sort().join('|')}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const data = await callEndpoint('/dataforseo_labs/google/search_intent/live', {
    keywords,
    language_code: LANGUAGE,
  });
  const items = data.tasks?.[0]?.result?.[0]?.items || [];
  const result = items.map(item => ({
    keyword: item.keyword || '',
    main_intent: item.keyword_intent?.label || 'informational',
    secondary_intents: item.secondary_keyword_intents?.map(i => i.label) || [],
  }));
  await setCached(cacheKey, result);
  return result;
}

// ── Domain Rank (authority) for a domain ──
export async function getDomainRank(domain) {
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  const cacheKey = `domain_rank:${cleanDomain}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  try {
    const data = await callEndpoint('/backlinks/summary/live', {
      target: cleanDomain,
      internal_list_limit: 1,
      backlinks_status_type: 'live',
    });
    const result = data.tasks?.[0]?.result?.[0];
    if (!result) return null;

    const simplified = {
      domain: cleanDomain,
      rank: result.rank || 0,
      backlinks: result.backlinks || 0,
      referring_domains: result.referring_domains || 0,
      referring_main_domains: result.referring_main_domains || 0,
    };
    await setCached(cacheKey, simplified);
    return simplified;
  } catch {
    return null;
  }
}

// ── Content gap: compare article to top 10 ranking articles ──
// Fetches the content of each top-ranking URL and returns topics covered
export async function getTopRankersContent(keyword) {
  const serp = await getSerpResults(keyword);
  if (!serp?.items) return [];

  const top5 = serp.items.slice(0, 5);
  // For each of the top 5, fetch the page content via crawlPage
  const results = await Promise.all(
    top5.map(async item => {
      try {
        const crawled = await crawlPage(item.url);
        if (!crawled) return null;
        return {
          rank: item.rank,
          title: item.title,
          url: item.url,
          domain: item.domain,
          word_count: crawled.meta?.content?.plain_text_word_count || 0,
          h1: crawled.meta?.htags?.h1 || [],
          h2: crawled.meta?.htags?.h2 || [],
          h3: crawled.meta?.htags?.h3 || [],
          internal_links: crawled.meta?.internal_links_count || 0,
          external_links: crawled.meta?.external_links_count || 0,
          images: crawled.meta?.images_count || 0,
          onpage_score: crawled.onpage_score || 0,
        };
      } catch {
        return null;
      }
    })
  );

  return results.filter(Boolean);
}

export function isConfigured() {
  return !!(LOGIN && PASSWORD);
}
