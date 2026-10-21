// Site Auditor engine — shared by the Site Auditor page (browser) and the
// fortnightly GitHub Action (scripts/site-audit.mjs, Node 20+).
//
// Keep this file free of browser/Vite-only APIs (no import.meta.env, no
// supabase import): callers pass in a `dfs(path, payload)` function that talks
// to DataForSEO (payload undefined = GET).
//
// Flow: startCrawl → waitForCrawl → collectCrawl (+ fetchCoreWebVitals)
//       → detectIssues. Issues come from fixed rules, so the same site gives
//       the same findings every run; the AI only prioritises them.

export const DEFAULT_MAX_PAGES = 200;

export const CATEGORIES = [
  { key: 'technical',   label: 'Technical SEO' },
  { key: 'onpage',      label: 'On-page SEO' },
  { key: 'content',     label: 'Content' },
  { key: 'performance', label: 'Performance & Core Web Vitals' },
  { key: 'indexing',    label: 'Indexing & crawl' },
  { key: 'links',       label: 'Broken links & redirects' },
];

export const SEVERITY_ORDER = { High: 0, Medium: 1, Low: 2 };
const MAX_PAGES_PER_ISSUE = 200;

// ── URLs ──
export function normaliseSite(input = '') {
  let s = String(input || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch { return ''; }
}

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./i, ''); } catch { return ''; } };

// Pick the client's site from what we already store. First match wins:
// the URL used for the last audit, Brand Voice website, Rank Tracker target
// domain (most common), then the origin of the client's bucket-list pages.
export function resolveClientSite({ lastAuditUrl, brandVoiceUrls = [], rankDomains = [], pageUrls = [] } = {}) {
  const mostCommon = (list) => {
    const counts = {};
    for (const v of list.map(normaliseSite).filter(Boolean)) counts[v] = (counts[v] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  };
  return normaliseSite(lastAuditUrl)
    || mostCommon(brandVoiceUrls)
    || mostCommon(rankDomains)
    || mostCommon(pageUrls.filter(u => /^https?:\/\//i.test(u || '')))
    || '';
}

// ── DataForSEO OnPage crawl ──
function taskResult(data, what) {
  const task = data?.tasks?.[0];
  if (!task) throw new Error(`DataForSEO: no task returned for ${what}`);
  if (task.status_code >= 40000) throw new Error(`DataForSEO ${what}: ${task.status_message}`);
  return task;
}

export async function startCrawl(dfs, site, { maxPages = DEFAULT_MAX_PAGES } = {}) {
  const home = normaliseSite(site);
  if (!home) throw new Error('No valid site URL');
  const data = await dfs('/on_page/task_post', {
    target: hostOf(home),
    start_url: `${home}/`,
    max_crawl_pages: maxPages,
    load_resources: true,          // needed for broken images/scripts and page size
    enable_javascript: false,      // full-site JS rendering is ~10x the cost
    enable_www_redirect_check: true,
    respect_sitemap: false,
    calculate_keyword_density: false,
    store_raw_html: false,
  });
  const task = taskResult(data, 'task_post');
  if (!task.id) throw new Error('DataForSEO did not return a crawl id');
  return task.id;
}

export async function getCrawlStatus(dfs, id) {
  const task = taskResult(await dfs(`/on_page/summary/${id}`), 'summary');
  const r = task.result?.[0] || {};
  return {
    finished: r.crawl_progress === 'finished',
    crawled: r.crawl_status?.pages_crawled ?? 0,
    queued: r.crawl_status?.pages_in_queue ?? 0,
    max: r.crawl_status?.max_crawl_pages ?? 0,
    summary: r,
  };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function waitForCrawl(dfs, id, { onProgress, intervalMs = 10000, timeoutMs = 30 * 60000 } = {}) {
  const start = Date.now();
  for (;;) {
    const st = await getCrawlStatus(dfs, id).catch(() => null);
    if (st) {
      onProgress?.(st);
      if (st.finished) return st.summary;
    }
    if (Date.now() - start > timeoutMs) throw new Error('Crawl is taking too long — try again later (it keeps running at DataForSEO).');
    await sleep(intervalMs);
  }
}

async function listAll(dfs, path, body, max = 1000) {
  const items = [];
  for (let offset = 0; offset < max; offset += 1000) {
    const task = taskResult(await dfs(path, { ...body, limit: Math.min(1000, max - offset), offset }), path);
    const r = task.result?.[0];
    items.push(...(r?.items || []));
    if (!r || items.length >= (r.total_items_count ?? 0) || !(r.items || []).length) break;
  }
  return items;
}

export async function collectCrawl(dfs, id, summary) {
  const settle = (p) => p.catch(() => []);
  const [pages, brokenLinks, redirectChains, nonIndexable] = await Promise.all([
    listAll(dfs, '/on_page/pages', { id }, 2000),
    settle(listAll(dfs, '/on_page/links', { id, filters: [['is_broken', '=', true]] }, 1000)),
    settle(listAll(dfs, '/on_page/redirect_chains', { id }, 500)),
    settle(listAll(dfs, '/on_page/non_indexable', { id }, 1000)),
  ]);
  return { id, summary: summary || {}, pages, brokenLinks, redirectChains, nonIndexable };
}

// Key pages for Core Web Vitals: home + the shallowest healthy HTML pages.
export function pickKeyPages(crawl, home, n = 3) {
  const ok = (crawl.pages || [])
    .filter(p => p.status_code === 200 && (p.resource_type || 'html') === 'html')
    .sort((a, b) => (a.click_depth ?? 99) - (b.click_depth ?? 99));
  const urls = [`${normaliseSite(home)}/`, ...ok.map(p => p.url)];
  const seen = new Set();
  return urls.filter(u => { const k = u.replace(/\/$/, ''); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, n);
}

// ── Core Web Vitals via Google PageSpeed Insights (free; key optional) ──
export async function fetchCoreWebVitals(url, { apiKey, strategy = 'mobile' } = {}) {
  const q = new URLSearchParams({ url, strategy, category: 'performance' });
  if (apiKey) q.set('key', apiKey);
  const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`);
  if (!res.ok) throw new Error(`PageSpeed ${res.status}`);
  const j = await res.json();
  const field = j.loadingExperience?.metrics || {};
  const audits = j.lighthouseResult?.audits || {};
  const hasField = !!field.LARGEST_CONTENTFUL_PAINT_MS;
  return {
    url,
    source: hasField ? 'field' : 'lab',   // field = real Chrome users (CrUX); lab = Lighthouse test
    performance: j.lighthouseResult?.categories?.performance?.score != null
      ? Math.round(j.lighthouseResult.categories.performance.score * 100) : null,
    lcp_ms: hasField ? field.LARGEST_CONTENTFUL_PAINT_MS.percentile : audits['largest-contentful-paint']?.numericValue ?? null,
    cls: hasField ? (field.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?? 0) / 100 : audits['cumulative-layout-shift']?.numericValue ?? null,
    inp_ms: field.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
    tbt_ms: audits['total-blocking-time']?.numericValue ?? null,
  };
}

export async function fetchCoreWebVitalsFor(urls, opts) {
  const out = [];
  for (const u of urls) {
    try { out.push(await fetchCoreWebVitals(u, opts)); }
    catch (e) { out.push({ url: u, error: e.message }); }
  }
  return out;
}

// ── Rules ──
// Each rule: id, category, severity, title, why, fix, and how to find the
// affected pages (with an optional per-page detail).
const isHtml200 = (p) => p.status_code === 200 && (p.resource_type || 'html') === 'html';
const words = (p) => p.meta?.content?.plain_text_word_count ?? null;
const h1s = (p) => p.meta?.htags?.h1 || [];
const chk = (key) => (p) => p.checks?.[key] === true;
const trim = (s = '', n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const PAGE_RULES = [
  // Technical
  { id: 'http_pages', category: 'technical', severity: 'High', title: 'Pages served over HTTP (not HTTPS)',
    why: 'Google treats HTTPS as a ranking signal and browsers flag HTTP pages as "Not secure".',
    fix: 'Serve every page over HTTPS and 301-redirect each HTTP URL to its HTTPS version.',
    test: (p) => isHtml200(p) && chk('is_http')(p) },
  { id: 'server_errors', category: 'technical', severity: 'High', title: 'Pages returning server errors (5xx)',
    why: 'Server errors stop Google crawling and indexing the page, and visitors see an error.',
    fix: 'Check the server/hosting error logs for these URLs and fix the cause (plugin conflict, timeouts, memory limits).',
    test: chk('is_5xx_code'), detail: (p) => `HTTP ${p.status_code}` },
  { id: 'mixed_content', category: 'technical', severity: 'Medium', title: 'HTTPS pages linking to HTTP URLs',
    why: 'Mixed content weakens security signals and can trigger browser warnings.',
    fix: 'Update these links (and any images/scripts) to their https:// versions.',
    test: chk('https_to_http_links') },
  { id: 'no_schema', category: 'technical', severity: 'Low', title: 'No structured data (schema markup)',
    why: 'Schema helps Google understand the page and is used for rich results and AI Overviews.',
    fix: 'Add relevant schema (Organization/LocalBusiness on the home page, Service, FAQPage, Article, BreadcrumbList) via the SEO plugin.',
    test: (p) => isHtml200(p) && p.checks?.has_micromarkup === false },
  { id: 'schema_errors', category: 'technical', severity: 'Low', title: 'Structured data has errors',
    why: 'Invalid schema is ignored by Google, so the page loses rich-result eligibility.',
    fix: 'Test these URLs in Google’s Rich Results Test and fix the reported errors.',
    test: chk('has_micromarkup_errors') },
  { id: 'meta_refresh', category: 'technical', severity: 'Low', title: 'Meta refresh redirects',
    why: 'Meta refresh redirects are slow and pass less ranking value than a server redirect.',
    fix: 'Replace the meta refresh with a 301 redirect on the server.',
    test: chk('has_meta_refresh_redirect') },
  { id: 'no_doctype_charset', category: 'technical', severity: 'Low', title: 'Missing doctype or character encoding',
    why: 'Browsers may render the page in quirks mode or show garbled characters.',
    fix: 'Make sure the theme outputs <!DOCTYPE html> and <meta charset="utf-8"> on every page.',
    test: (p) => isHtml200(p) && (chk('no_doctype')(p) || chk('no_encoding_meta_tag')(p)) },
  { id: 'unfriendly_url', category: 'technical', severity: 'Low', title: 'URLs that are not SEO-friendly',
    why: 'Long URLs or ones with parameters/odd characters are harder to read, share and rank.',
    fix: 'Use short, lowercase, hyphenated slugs that describe the page; 301-redirect the old URL if you change it.',
    test: (p) => isHtml200(p) && p.checks?.seo_friendly_url === false },

  // On-page
  { id: 'no_title', category: 'onpage', severity: 'High', title: 'Missing page title',
    why: 'The title is the strongest on-page ranking signal and the headline shown in Google.',
    fix: 'Write a unique 50–60 character title with the page’s main keyword near the start.',
    test: (p) => isHtml200(p) && chk('no_title')(p) },
  { id: 'duplicate_title', category: 'onpage', severity: 'Medium', title: 'Duplicate page titles',
    why: 'Pages with the same title compete with each other and Google may pick the wrong one.',
    fix: 'Give each page a unique title describing its specific topic.',
    test: (p) => isHtml200(p) && (p.duplicate_title === true || chk('duplicate_title_tag')(p)),
    detail: (p) => `“${trim(p.meta?.title || '')}”` },
  { id: 'title_length', category: 'onpage', severity: 'Low', title: 'Title too long or too short',
    why: 'Long titles are cut off in Google; very short ones waste ranking and click-through potential.',
    fix: 'Rewrite titles to 50–60 characters.',
    test: (p) => isHtml200(p) && (chk('title_too_long')(p) || chk('title_too_short')(p)),
    detail: (p) => `${(p.meta?.title || '').length} chars: “${trim(p.meta?.title || '')}”` },
  { id: 'no_description', category: 'onpage', severity: 'Medium', title: 'Missing meta description',
    why: 'Google writes its own snippet, which usually lowers click-through rate.',
    fix: 'Write a unique 140–160 character description that summarises the page and includes a call to action.',
    test: (p) => isHtml200(p) && chk('no_description')(p) },
  { id: 'duplicate_description', category: 'onpage', severity: 'Low', title: 'Duplicate meta descriptions',
    why: 'Repeated descriptions make pages look alike in search results.',
    fix: 'Write a unique description for each page.',
    test: (p) => isHtml200(p) && p.duplicate_description === true,
    detail: (p) => `“${trim(p.meta?.description || '')}”` },
  { id: 'description_length', category: 'onpage', severity: 'Low', title: 'Meta description too long or too short',
    why: 'Descriptions over ~160 characters are cut off; under ~70 give searchers too little reason to click.',
    fix: 'Rewrite descriptions to 140–160 characters.',
    test: (p) => { const n = (p.meta?.description || '').length; return isHtml200(p) && n > 0 && (n > 160 || n < 70); },
    detail: (p) => `${(p.meta?.description || '').length} chars` },
  { id: 'no_h1', category: 'onpage', severity: 'Medium', title: 'Missing H1 heading',
    why: 'The H1 tells Google and visitors what the page is about.',
    fix: 'Add one H1 per page containing the main keyword (usually the page heading).',
    test: (p) => isHtml200(p) && (chk('no_h1_tag')(p) || h1s(p).length === 0) },
  { id: 'multiple_h1', category: 'onpage', severity: 'Low', title: 'More than one H1 heading',
    why: 'Several H1s blur the page’s main topic.',
    fix: 'Keep one H1 and change the others to H2/H3.',
    test: (p) => isHtml200(p) && h1s(p).length > 1, detail: (p) => `${h1s(p).length} H1s` },
  { id: 'no_image_alt', category: 'onpage', severity: 'Medium', title: 'Images missing alt text',
    why: 'Alt text is used by Google Images and screen readers; missing alt is an accessibility issue.',
    fix: 'Add short, descriptive alt text to each image (in the WordPress media library or page builder).',
    test: (p) => isHtml200(p) && chk('no_image_alt')(p) },

  // Content
  { id: 'thin_content', category: 'content', severity: 'Medium', title: 'Thin content (under 300 words)',
    why: 'Pages with little unique text rarely rank and can drag down how Google rates the site (helpful content).',
    fix: 'Expand with genuinely useful content (aim for 600+ words on service pages: who it’s for, process, pricing factors, FAQs), or merge/noindex pages that don’t need to rank.',
    test: (p) => isHtml200(p) && words(p) != null && words(p) < 300 && !p.checks?.is_redirect,
    detail: (p) => `${words(p)} words` },
  { id: 'duplicate_content', category: 'content', severity: 'Medium', title: 'Duplicate or near-duplicate content',
    why: 'Google filters duplicates, so only one version can rank and the rest waste crawl budget.',
    fix: 'Rewrite these pages so each is unique, or point the copies to the main version with a canonical tag.',
    test: (p) => isHtml200(p) && p.duplicate_content === true },
  { id: 'low_readability', category: 'content', severity: 'Low', title: 'Hard-to-read content',
    why: 'Dense, complex text lowers engagement.',
    fix: 'Use shorter sentences and paragraphs, subheadings, and bullet points.',
    test: (p) => isHtml200(p) && chk('low_readability_rate')(p) },
  { id: 'placeholder_text', category: 'content', severity: 'High', title: 'Placeholder (lorem ipsum) text',
    why: 'Unfinished pages look unprofessional and are low-quality signals.',
    fix: 'Replace the placeholder text with real content, or unpublish the page.',
    test: chk('lorem_ipsum') },
  { id: 'low_text_ratio', category: 'content', severity: 'Low', title: 'Low text-to-code ratio',
    why: 'Pages that are mostly code/markup with little visible text are often thin or bloated.',
    fix: 'Add useful text content and remove unused page-builder sections/scripts.',
    test: (p) => isHtml200(p) && chk('low_content_rate')(p) },

  // Performance (crawl-based; Core Web Vitals come from PageSpeed below)
  { id: 'slow_pages', category: 'performance', severity: 'Medium', title: 'Slow-loading pages',
    why: 'Slow pages lose visitors and hurt page experience signals.',
    fix: 'Compress/resize images (WebP), enable caching and a CDN, and remove unused plugins and scripts.',
    test: (p) => isHtml200(p) && chk('high_loading_time')(p),
    detail: (p) => (p.page_timing?.duration_time ? `${(p.page_timing.duration_time / 1000).toFixed(1)}s load` : '') },
  { id: 'slow_server', category: 'performance', severity: 'Medium', title: 'Slow server response (TTFB)',
    why: 'A slow server delays everything else and directly worsens LCP.',
    fix: 'Enable page caching, upgrade hosting if needed, and check for slow database queries/plugins.',
    test: (p) => isHtml200(p) && chk('high_waiting_time')(p),
    detail: (p) => (p.page_timing?.waiting_time ? `${p.page_timing.waiting_time} ms` : '') },
  { id: 'render_blocking', category: 'performance', severity: 'Low', title: 'Render-blocking scripts or styles',
    why: 'Blocking resources delay the first paint and LCP.',
    fix: 'Defer non-critical JavaScript, inline critical CSS, and load the rest asynchronously (e.g. via a caching/optimisation plugin).',
    test: (p) => isHtml200(p) && chk('has_render_blocking_resources')(p) },
  { id: 'large_pages', category: 'performance', severity: 'Medium', title: 'Very large pages',
    why: 'Heavy pages are slow on mobile data.',
    fix: 'Compress images and video, lazy-load media below the fold, and remove unused scripts.',
    test: (p) => isHtml200(p) && (chk('large_page_size')(p) || chk('size_greater_than_3mb')(p)),
    detail: (p) => (p.total_transfer_size ? `${Math.round(p.total_transfer_size / 1024)} KB` : '') },
  { id: 'no_compression', category: 'performance', severity: 'Low', title: 'No text compression (gzip/brotli)',
    why: 'Uncompressed HTML/CSS/JS takes longer to download.',
    fix: 'Turn on gzip or brotli compression at the host or CDN.',
    test: (p) => isHtml200(p) && chk('no_content_encoding')(p) },

  // Indexing & crawl
  { id: 'canonical_problems', category: 'indexing', severity: 'Medium', title: 'Canonical tag problems',
    why: 'A canonical pointing to a redirect, a broken page or a chain confuses Google about which URL to index.',
    fix: 'Point each canonical tag directly at the final, working (200) URL — usually the page itself.',
    test: (p) => ['canonical_to_redirect', 'canonical_to_broken', 'recursive_canonical', 'canonical_chain'].some(k => chk(k)(p)),
    detail: (p) => ['canonical_to_redirect', 'canonical_to_broken', 'recursive_canonical', 'canonical_chain'].filter(k => chk(k)(p)).join(', ').replace(/_/g, ' ') },
  { id: 'orphan_pages', category: 'indexing', severity: 'Low', title: 'Orphan pages (no internal links)',
    why: 'Pages nothing links to are hard for Google to find and get little ranking value.',
    fix: 'Link to these pages from relevant pages or menus, or remove them if unneeded.',
    test: chk('is_orphan_page') },
  { id: 'deep_pages', category: 'indexing', severity: 'Low', title: 'Pages buried deep in the site (4+ clicks)',
    why: 'Pages far from the home page are crawled less often and seen as less important.',
    fix: 'Link to these pages from the menu, hub pages or the home page so they are within 3 clicks.',
    test: (p) => isHtml200(p) && (p.click_depth ?? 0) >= 4, detail: (p) => `${p.click_depth} clicks deep` },

  // Broken links & redirects
  { id: 'broken_pages', category: 'links', severity: 'High', title: 'Broken pages (4xx)',
    why: 'Links to missing pages waste link value and frustrate visitors.',
    fix: '301-redirect each broken URL to the most relevant live page, and update the links pointing to it.',
    test: chk('is_4xx_code'), detail: (p) => `HTTP ${p.status_code}` },
  { id: 'broken_resources', category: 'links', severity: 'Medium', title: 'Pages with broken images, scripts or files',
    why: 'Missing resources break the page layout or features.',
    fix: 'Re-upload or remove the missing images/files and fix their URLs.',
    test: (p) => isHtml200(p) && p.broken_resources === true },
  { id: 'links_to_redirects', category: 'links', severity: 'Low', title: 'Internal links pointing to redirects',
    why: 'Each redirect hop slows crawling and leaks a little link value.',
    fix: 'Update these links to point straight at the final URL.',
    test: (p) => isHtml200(p) && chk('has_links_to_redirects')(p) },
];

function makeIssue(rule, pages) {
  return {
    id: rule.id, category: rule.category, severity: rule.severity,
    title: rule.title, why: rule.why, fix: rule.fix,
    count: pages.length,
    pages: pages.slice(0, MAX_PAGES_PER_ISSUE),
  };
}

export function detectIssues(crawl, cwv = []) {
  const pages = crawl.pages || [];
  const s = crawl.summary || {};
  const dc = s.domain_info?.checks || {};
  const home = s.domain_info?.name ? `https://${s.domain_info.name}/` : '(site)';
  const issues = [];

  for (const rule of PAGE_RULES) {
    const hit = pages.filter(p => { try { return rule.test(p); } catch { return false; } })
      .map(p => ({ url: p.url, detail: rule.detail ? rule.detail(p) || undefined : undefined }))
      .sort((a, b) => a.url.localeCompare(b.url));
    if (hit.length) issues.push(makeIssue(rule, hit));
  }

  // Site-wide checks (from the crawl summary)
  const site = (id, category, severity, title, why, fix, detail) =>
    issues.push(makeIssue({ id, category, severity, title, why, fix }, [{ url: home, detail }]));
  if (dc.ssl === false || s.domain_info?.ssl_info?.valid_certificate === false)
    site('ssl', 'technical', 'High', 'SSL certificate missing or invalid',
      'Visitors get a security warning and Google may not index the HTTPS site.',
      'Install or renew a valid SSL certificate (most hosts offer free Let’s Encrypt).');
  if (dc.test_https_redirect === false)
    site('no_https_redirect', 'technical', 'Medium', 'HTTP does not redirect to HTTPS',
      'Two versions of the site are reachable, splitting ranking signals.',
      'Add a site-wide 301 redirect from http:// to https://.');
  if (dc.test_www_redirect === false || dc.test_canonicalization === false)
    site('www_canonicalization', 'technical', 'Medium', 'www and non-www versions both load',
      'Google may see two copies of every page.',
      'Pick one version (www or non-www) and 301-redirect the other to it.');
  if (dc.test_page_not_found === false)
    site('soft_404', 'indexing', 'Medium', 'Missing pages don’t return a 404 (soft 404s)',
      'Google may index junk URLs that show an error but return 200 OK.',
      'Make sure non-existent URLs return a real 404 status code.');
  if (dc.sitemap === false)
    site('no_sitemap', 'indexing', 'Medium', 'No XML sitemap found',
      'A sitemap helps Google discover and recrawl every important page.',
      'Generate a sitemap (Yoast/Rank Math do this), reference it in robots.txt, and submit it in Search Console.');
  if (dc.robots_txt === false)
    site('no_robots', 'indexing', 'Low', 'No robots.txt file',
      'robots.txt tells crawlers what to skip and where the sitemap is.',
      'Add a robots.txt that allows crawling and lists the sitemap URL.');
  if (dc.start_page_deny_flag === true)
    site('home_blocked', 'indexing', 'High', 'Home page is blocked from crawling',
      'robots.txt or a noindex is stopping Google from crawling the home page.',
      'Remove the Disallow/noindex rule affecting the home page (check “Discourage search engines” in WordPress → Settings → Reading).');

  // Non-indexable pages (noindex, robots.txt, canonicalised elsewhere)
  const nonIdx = (crawl.nonIndexable || []).filter(n => n.url);
  if (nonIdx.length) {
    issues.push(makeIssue({ id: 'non_indexable', category: 'indexing', severity: 'Medium',
      title: 'Pages Google can’t index',
      why: 'These pages are excluded by noindex, robots.txt or a canonical pointing elsewhere — fine if intended, a problem if they should rank.',
      fix: 'Check each one: if it should appear in Google, remove the noindex/robots rule or fix the canonical; otherwise leave it.' },
    nonIdx.map(n => ({ url: n.url, detail: String(n.reason || '').replace(/_/g, ' ') || undefined }))));
  }

  // Broken links — show the page that contains the link and where it points
  const broken = crawl.brokenLinks || [];
  const internal = broken.filter(l => l.direction === 'internal' || hostOf(l.link_to) === hostOf(l.link_from));
  const external = broken.filter(l => !internal.includes(l));
  const linkRows = (list) => list.map(l => ({
    url: l.link_from || l.page_from,
    detail: `→ ${l.link_to || l.page_to}${l.page_to_status_code ? ` (HTTP ${l.page_to_status_code})` : ''}`,
  }));
  if (internal.length) issues.push(makeIssue({ id: 'broken_internal_links', category: 'links', severity: 'High',
    title: 'Broken internal links',
    why: 'Links to missing pages on your own site waste link value and lead visitors to errors.',
    fix: 'On each page listed, update or remove the link — or 301-redirect the missing target to the right page.' }, linkRows(internal)));
  if (external.length) issues.push(makeIssue({ id: 'broken_external_links', category: 'links', severity: 'Medium',
    title: 'Broken external links',
    why: 'Links to dead external sites look neglected and hurt user trust.',
    fix: 'Update each link to a working source or remove it.' }, linkRows(external)));

  // Redirect chains and loops
  const chains = crawl.redirectChains || [];
  if (chains.length) {
    issues.push(makeIssue({ id: 'redirect_chains', category: 'links', severity: 'Medium',
      title: 'Redirect chains and loops',
      why: 'Multiple redirect hops slow pages and Google may stop following them; loops make pages unreachable.',
      fix: 'Point the first URL straight at the final destination (one 301), and fix any loops.' },
    chains.map(c => {
      const hops = c.chain || [];
      return { url: hops[0]?.from_url || '', detail: `${c.is_redirect_loop ? 'LOOP: ' : ''}${hops.map(h => h.to_url).join(' → ')}` };
    }).filter(r => r.url)));
  }

  // Core Web Vitals (Google thresholds)
  const measured = cwv.filter(c => !c.error);
  const cwvRule = (id, severity, title, test, detail, why, fix) => {
    const hit = measured.filter(test).map(c => ({ url: c.url, detail: `${detail(c)} (${c.source === 'field' ? 'real users' : 'lab test'})` }));
    if (hit.length) issues.push(makeIssue({ id, category: 'performance', severity, title, why, fix }, hit));
  };
  cwvRule('cwv_lcp', 'High', 'Largest Contentful Paint over 2.5s', c => c.lcp_ms > 2500,
    c => `LCP ${(c.lcp_ms / 1000).toFixed(1)}s`,
    'LCP is a Core Web Vital: how long the main content takes to appear. Google’s target is under 2.5s.',
    'Optimise the hero image (WebP, correct size, preload, no lazy-load on it), improve server response time, and defer render-blocking scripts.');
  cwvRule('cwv_cls', 'Medium', 'Layout shift (CLS) over 0.1', c => c.cls > 0.1,
    c => `CLS ${Number(c.cls).toFixed(2)}`,
    'CLS is a Core Web Vital: content jumping around as the page loads. Google’s target is under 0.1.',
    'Set width/height on images and embeds, reserve space for banners/ads, and avoid inserting content above existing content.');
  cwvRule('cwv_inp', 'Medium', 'Slow interactions (INP) over 200ms', c => c.inp_ms > 200,
    c => `INP ${c.inp_ms}ms`,
    'INP is a Core Web Vital: how fast the page responds to taps and clicks. Google’s target is under 200ms.',
    'Reduce heavy JavaScript (sliders, chat widgets, trackers), break up long tasks, and remove unused plugins.');
  cwvRule('cwv_score', 'Medium', 'Low mobile performance score', c => c.performance != null && c.performance < 50,
    c => `score ${c.performance}/100`,
    'PageSpeed’s mobile score under 50 means the page is slow for most mobile visitors.',
    'Work through the PageSpeed Insights “Opportunities” for this URL — usually images, unused JS/CSS and caching.');

  return issues.sort((a, b) =>
    (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) || (b.count - a.count) || a.id.localeCompare(b.id));
}

// Deterministic 0–100 health score: DataForSEO's on-page score for the
// crawl, falling back to a penalty-based estimate.
export function healthScore(crawl, issues) {
  const s = crawl.summary?.page_metrics?.onpage_score;
  if (typeof s === 'number') return Math.round(s);
  const penalty = issues.reduce((t, i) => t + ({ High: 8, Medium: 4, Low: 1 }[i.severity] || 0), 0);
  return Math.max(0, 100 - penalty);
}

export function crawlStats(crawl, cwv = []) {
  const pages = crawl.pages || [];
  return {
    engine: 'v2',
    task_id: crawl.id,
    pages_crawled: crawl.summary?.crawl_status?.pages_crawled ?? pages.length,
    max_crawl_pages: crawl.summary?.crawl_status?.max_crawl_pages ?? null,
    html_pages: pages.filter(isHtml200).length,
    cms: crawl.summary?.domain_info?.cms || null,
    cwv,
  };
}

// Compact issue list for the AI prompt (counts + a few example URLs).
export function issuesForPrompt(issues) {
  return issues.map(i => ({
    id: i.id, category: i.category, severity: i.severity, title: i.title, pages_affected: i.count,
    examples: i.pages.slice(0, 5).map(p => (p.detail ? `${p.url} — ${p.detail}` : p.url)),
  }));
}

export const AI_SYSTEM = (priorities) => `You are a senior technical SEO consultant for an Australian digital agency (Campaigns You Love). You are given the findings of a full-site crawl. The findings are already verified — do not invent new issues and do not dispute them.

Your job: write a one-sentence health summary, and pick the TWO tasks that will move the needle most in the next fortnight. Base each task on one or more finding ids. Weigh severity, how many pages are affected, and whether the affected pages are important (home/service pages over blog tags).

Current Google priorities to weigh:
${priorities}

Return ONLY valid JSON, no markdown fences, in this exact shape:
{
  "summary": "<one sentence on the site's SEO health>",
  "tasks": [
    {
      "title": "<short action title>",
      "issue_ids": ["<finding id>", "..."],
      "issue": "<the specific problem, with numbers and example URLs from the findings>",
      "action": "<exactly what to do, step by step, concrete>",
      "impact": "High|Medium|Low",
      "effort": "Quick|Medium|Large",
      "category": "Technical SEO|On-page SEO|Content|Performance & Core Web Vitals|Indexing & crawl|Broken links & redirects"
    }
  ]
}
The "tasks" array MUST contain exactly 2 items.`;

export const CURRENT_PRIORITIES = `
- Helpful, people-first content: thin, AI-spun or purely SEO-driven pages get suppressed.
- E-E-A-T: Experience, Expertise, Authoritativeness, Trust — author info, real business details.
- Spam policies: no doorway pages, scaled low-value content, sneaky redirects, keyword stuffing.
- Core Web Vitals / page experience: LCP < 2.5s, CLS < 0.1, INP < 200ms, fast mobile.
- AI Overviews: clear direct answers, FAQ blocks, structured data.
- Technical hygiene: one H1, unique titles/meta, canonicals, no broken links, crawlable,
  indexable, HTTPS, image alt text, internal linking.`;
