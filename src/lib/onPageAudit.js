// Maps DataForSEO crawl results to the SEO Checker's checklist items
// Auto-ticks technical items that can be verified from a live page

/**
 * Takes a crawled page (from dfs.crawlPage) and the article's focus keyword,
 * and returns an object of { check_id: true/false } for items we can verify.
 */
export function mapCrawlToChecklist(crawl, focusKeyphrase = '', secondaryKeywords = '') {
  if (!crawl) return {};

  const meta = crawl.meta || {};
  const checks = crawl.checks || {};
  const content = meta.content || {};
  const timing = crawl.page_timing || {};
  const fk = (focusKeyphrase || '').toLowerCase().trim();
  const secKws = (secondaryKeywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);

  // Extract heading tags
  const h1s = meta.htags?.h1 || [];
  const h2s = meta.htags?.h2 || [];
  const h3s = meta.htags?.h3 || [];
  const allHeadings = [...h1s, ...h2s, ...h3s];

  // Title checks
  const titleLower = (meta.title || '').toLowerCase();
  const descLower = (meta.description || '').toLowerCase();
  const canonicalLower = (meta.canonical || '').toLowerCase();

  const result = {};
  const evidence = {};

  // ── Meta & Technical ──
  if (fk) {
    result.meta_title_kw = titleLower.includes(fk);
    evidence.meta_title_kw = `Title: "${meta.title || '(none)'}"`;

    result.meta_desc_kw = descLower.includes(fk);
    evidence.meta_desc_kw = `Meta desc: "${meta.description || '(none)'}"`;

    result.meta_slug = canonicalLower.includes(fk.replace(/\s+/g, '-')) || canonicalLower.includes(fk.replace(/\s+/g, ''));
    evidence.meta_slug = `URL: ${meta.canonical || crawl.url}`;
  }

  const titleLen = meta.title?.length || 0;
  result.meta_title_len = titleLen > 0 && titleLen <= 60;
  evidence.meta_title_len = `Title is ${titleLen} chars`;

  const descLen = meta.description?.length || 0;
  result.meta_desc_len = descLen >= 140 && descLen <= 160;
  evidence.meta_desc_len = `Meta desc is ${descLen} chars`;

  // Schema markup — checks.canonical or structured_data indicators
  if (checks.no_structured_data !== undefined) {
    result.meta_schema = !checks.no_structured_data;
    evidence.meta_schema = result.meta_schema ? 'Structured data detected' : 'No structured data found';
  }

  // ── Content & Keywords ──
  if (fk && h1s.length) {
    result.kw_h1 = h1s.some(h => h.toLowerCase().includes(fk));
    evidence.kw_h1 = `H1: "${h1s[0] || '(none)'}"`;
  }

  // Word count
  const wordCount = content.plain_text_word_count || 0;
  result.kw_wordcount = wordCount >= 1000;
  evidence.kw_wordcount = `${wordCount} words`;

  // Table of contents — look for H2 with "table of contents" or "contents"
  result.kw_toc = h2s.some(h => /table of contents|contents/i.test(h));
  evidence.kw_toc = result.kw_toc ? 'TOC heading found' : 'No TOC heading detected';

  // FAQ section — look for H2 with "faq" or "frequently asked"
  result.kw_faq = h2s.some(h => /faq|frequently asked/i.test(h));
  evidence.kw_faq = result.kw_faq ? 'FAQ section found' : 'No FAQ section detected';

  // Secondary keywords — check if any appear in headings
  if (secKws.length && allHeadings.length) {
    const headingsText = allHeadings.join(' ').toLowerCase();
    result.kw_secondary = secKws.some(k => headingsText.includes(k));
    evidence.kw_secondary = result.kw_secondary ? 'Secondary kws found in headings' : 'Secondary kws not in headings';
  }

  // ── Headings & Structure ──
  result.h_one_h1 = h1s.length === 1;
  evidence.h_one_h1 = `Found ${h1s.length} H1 tag(s)`;

  result.h_has_h2 = h2s.length >= 2;
  evidence.h_has_h2 = `Found ${h2s.length} H2 tag(s)`;

  if (fk && (h2s.length || h3s.length)) {
    const h2h3Text = [...h2s, ...h3s].join(' ').toLowerCase();
    // Check for keyword variations (looser match — any word from fk)
    const fkWords = fk.split(/\s+/).filter(w => w.length > 3);
    result.h_kw_in_h = fkWords.some(w => h2h3Text.includes(w));
    evidence.h_kw_in_h = result.h_kw_in_h ? 'Keyword variation found in H2/H3' : 'No keyword variations in H2/H3';
  }

  // ── Images & Media ──
  const imgCount = meta.images_count || 0;
  result.img_hero = imgCount >= 1;
  evidence.img_hero = `${imgCount} image(s) found`;

  if (checks.no_image_alt !== undefined) {
    result.img_alts = !checks.no_image_alt;
    evidence.img_alts = result.img_alts ? 'All images have alt text' : 'Some images missing alt text';
  }

  // Average image size check
  const avgImageSize = imgCount > 0 ? (meta.images_size || 0) / imgCount : 0;
  result.img_filesize = avgImageSize > 0 && avgImageSize < 200 * 1024;
  evidence.img_filesize = `Avg image size: ${Math.round(avgImageSize / 1024)}KB`;

  // WebP detection (we don't have direct access but can check in URLs if we had them)
  // Leave img_webp unchecked since instant_pages doesn't give per-image format

  // ── Internal & External Links ──
  const internalCount = meta.internal_links_count || 0;
  const externalCount = meta.external_links_count || 0;
  result.link_internal = internalCount >= 2;
  evidence.link_internal = `${internalCount} internal links`;

  result.link_external = externalCount >= 1;
  evidence.link_external = `${externalCount} external links`;

  // Broken links
  result.link_nobroke = !crawl.broken_resources && !checks.broken_links;
  evidence.link_nobroke = result.link_nobroke ? 'No broken links detected' : 'Broken links detected';

  // ── E-E-A-T & Credibility ──
  // Published date — check if page has structured data with datePublished or meta tags
  // This is approximated — look for time/date patterns in H2/H3 or meta
  // We'll be conservative and only auto-tick if we can confirm

  // ── UX & Engagement ──
  // Mobile-friendly
  if (checks.is_mobile_optimized !== undefined) {
    result.ux_mobile = checks.is_mobile_optimized;
    evidence.ux_mobile = result.ux_mobile ? 'Mobile optimised' : 'Not mobile optimised';
  }

  // Page speed / performance
  const lcp = timing.largest_contentful_paint || 0;
  // We don't have a specific "page speed" checklist item, but we could note it in evidence

  // ── Final QA ──
  // Live URL working (not 404)
  result.qa_url = crawl.status_code === 200;
  evidence.qa_url = `HTTP ${crawl.status_code}`;

  // ── Search Console items ──
  // These require manual verification in GSC

  return { checks: result, evidence };
}

/**
 * Returns a summary of what was checked
 */
export function getAuditSummary(mapping) {
  if (!mapping || !mapping.checks) return { total: 0, passed: 0, failed: 0 };
  const entries = Object.entries(mapping.checks);
  return {
    total: entries.length,
    passed: entries.filter(([, v]) => v === true).length,
    failed: entries.filter(([, v]) => v === false).length,
    ids: entries.map(([id]) => id),
  };
}
