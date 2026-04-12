// Each check has a `scope`:
//   'writing'   = writer's responsibility (content, keywords, headings, meta copy, links, CTAs)
//   'technical' = post-publish admin/tech/UX work (schema, WebP, GSC, indexing, mobile, final QA)

export const CHECKS = [
  {
    cat: 'Meta & Technical',
    items: [
      { id: 'meta_title_kw', label: 'SEO title includes focus keyphrase', auto: true, crit: true, scope: 'writing' },
      { id: 'meta_title_len', label: 'SEO title is under 60 characters', auto: true, scope: 'writing' },
      { id: 'meta_desc_kw', label: 'Meta description includes focus keyphrase', auto: true, crit: true, scope: 'writing' },
      { id: 'meta_desc_len', label: 'Meta description is 140–160 characters', auto: true, scope: 'writing' },
      { id: 'meta_slug', label: 'URL slug includes focus keyphrase', auto: true, crit: true, scope: 'writing' },
      { id: 'meta_schema', label: 'Schema markup added (Article or LocalBusiness)', crit: true, isNew: true, note: 'Add via Yoast or RankMath', scope: 'technical' },
      { id: 'meta_faq_schema', label: 'FAQ schema present (if FAQ section exists)', isNew: true, scope: 'technical' },
    ],
  },
  {
    cat: 'Content & Keywords',
    items: [
      { id: 'kw_h1', label: 'H1 contains focus keyphrase', auto: true, crit: true, scope: 'writing' },
      { id: 'kw_first100', label: 'Focus keyphrase in first 100 words', auto: true, crit: true, scope: 'writing' },
      { id: 'kw_density', label: 'Keyword density is 1–2%', auto: true, note: 'Double-check manually with an external tool', scope: 'writing' },
      { id: 'kw_secondary', label: 'All secondary keywords used in body', auto: true, scope: 'writing' },
      { id: 'kw_variations', label: 'Keyword variations used (not just exact match)', auto: true, scope: 'writing' },
      { id: 'kw_wordcount', label: 'Word count is 1,000+ words', auto: true, scope: 'writing' },
      { id: 'kw_toc', label: 'Table of Contents with jump links present', auto: true, isNew: true, scope: 'writing' },
      { id: 'kw_faq', label: 'FAQ section with at least 3 Q&As', auto: true, crit: true, isNew: true, note: 'Helps win Google featured snippets', scope: 'writing' },
    ],
  },
  {
    cat: 'Headings & Structure',
    items: [
      { id: 'h_one_h1', label: 'Only one H1 on the page', auto: true, crit: true, scope: 'writing' },
      { id: 'h_has_h2', label: 'H2s used for main sections', auto: true, scope: 'writing' },
      { id: 'h_kw_in_h', label: 'At least one H2/H3 contains a keyword variation', auto: true, scope: 'writing' },
      { id: 'h_intro', label: 'Intro paragraph is strong before first heading', scope: 'writing' },
    ],
  },
  {
    cat: 'Images & Media',
    items: [
      { id: 'img_hero', label: 'Hero/header image present', auto: true, scope: 'writing' },
      { id: 'img_alts', label: 'All images have descriptive alt text', auto: true, crit: true, scope: 'writing' },
      { id: 'img_kw_alt', label: 'At least one alt tag includes focus keyphrase', auto: true, scope: 'writing' },
      { id: 'img_webp', label: 'Images are WebP format', auto: true, note: 'Reduces file size, improves Core Web Vitals', scope: 'technical' },
      { id: 'img_filename', label: 'Image filenames include keyword', scope: 'writing' },
      { id: 'img_filesize', label: 'Images compressed under 200KB each', scope: 'technical' },
    ],
  },
  {
    cat: 'Internal & External Links',
    items: [
      { id: 'link_internal', label: 'Minimum 2 internal links to relevant pages', auto: true, crit: true, isNew: true, scope: 'writing' },
      { id: 'link_service', label: 'Links to a service/suburb page (not just homepage)', isNew: true, scope: 'writing' },
      { id: 'link_external', label: 'At least 1 external authority link', auto: true, note: 'ABS, REIQ, CoreLogic, Domain etc.', scope: 'writing' },
      { id: 'link_cta_top', label: 'CTA button present early in article', auto: true, scope: 'writing' },
      { id: 'link_cta_bot', label: 'CTA button at end of article', auto: true, crit: true, scope: 'writing' },
      { id: 'link_nobroke', label: 'All links tested — no 404 errors', scope: 'technical' },
    ],
  },
  {
    cat: 'E-E-A-T & Credibility',
    items: [
      { id: 'eeat_author', label: 'Author name visible on the post', auto: true, isNew: true, scope: 'technical' },
      { id: 'eeat_date', label: 'Published date visible', auto: true, scope: 'technical' },
      { id: 'eeat_location', label: 'Location references throughout', auto: true, scope: 'writing' },
      { id: 'eeat_data', label: 'Statistic or data point referenced with a link', auto: true, scope: 'writing' },
      { id: 'eeat_bio', label: 'Author bio with credentials visible', isNew: true, scope: 'technical' },
    ],
  },
  {
    cat: 'UX & Engagement',
    items: [
      { id: 'ux_mobile', label: 'Mobile display checked and correct', scope: 'technical' },
      { id: 'ux_related', label: 'Related posts / Read next section at end', isNew: true, scope: 'technical' },
      { id: 'ux_social', label: 'Social sharing buttons on the post', isNew: true, scope: 'technical' },
      { id: 'ux_scannable', label: 'Content is scannable (short paragraphs, clear headings)', scope: 'writing' },
    ],
  },
  {
    cat: 'Social & Outreach',
    items: [
      { id: 'social_fb', label: 'Facebook post copy written', scope: 'writing' },
      { id: 'social_ig', label: 'Instagram post copy written', scope: 'writing' },
      { id: 'social_hash', label: 'Hashtags included in social posts', scope: 'writing' },
      { id: 'social_graph', label: 'Social graphic created and in Airtable', scope: 'technical' },
    ],
  },
  {
    cat: 'Search Console',
    items: [
      { id: 'gsc_submit', label: 'URL submitted for indexing in GSC', crit: true, note: 'GSC → URL Inspection → Enter URL → Request Indexing', scope: 'technical' },
      { id: 'gsc_sitemap', label: 'Sitemap up to date and submitted in GSC', note: 'GSC → Sitemaps → confirm no errors', scope: 'technical' },
      { id: 'gsc_noerrors', label: 'No crawl errors for this URL in GSC', note: 'GSC → Pages → check URL is not in any error group', scope: 'technical' },
      { id: 'gsc_indexed', label: 'Confirmed indexed (check 24–72hrs after submit)', crit: true, note: 'GSC → URL Inspection → should show "URL is on Google"', scope: 'technical' },
      { id: 'gsc_week1', label: 'Week 1–2 check done — numbers logged below', scope: 'technical' },
      { id: 'gsc_week4', label: 'Week 4 check done — compared to week 1', scope: 'technical' },
      { id: 'gsc_queries', label: 'Top queries reviewed for new keyword opportunities', note: 'GSC → Performance → filter by page → Queries tab', scope: 'technical' },
      { id: 'gsc_ctr', label: 'CTR reviewed — if under 3%, update title/meta desc', note: 'Low CTR with decent impressions = title or meta needs work', scope: 'technical' },
    ],
  },
  {
    cat: 'Final QA',
    items: [
      { id: 'qa_url', label: 'Live URL working (no 404)', crit: true, scope: 'technical' },
      { id: 'qa_buttons', label: 'All CTA buttons working correctly', scope: 'technical' },
      { id: 'qa_header', label: 'Page header/hero complete and accurate', scope: 'technical' },
      { id: 'qa_redirect', label: 'Redirect set up (if old URL existed)', scope: 'technical' },
      { id: 'qa_airtable', label: 'Airtable entry updated and confirmed', scope: 'technical' },
      { id: 'qa_cannib', label: 'Cannibalization check done (right panel)', crit: true, scope: 'writing' },
    ],
  },
];

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Helper to get items filtered by scope
export function getItemsByScope(scope) {
  return CHECKS.flatMap(c => c.items).filter(i => i.scope === scope);
}

// Helper to calculate score for a specific scope
export function calcScopeScore(checklistState, scope) {
  const items = getItemsByScope(scope);
  const total = items.length;
  if (!total) return { passed: 0, total: 0, pct: 0 };
  const passed = items.filter(i => checklistState[i.id]).length;
  return { passed, total, pct: Math.round((passed / total) * 100) };
}
