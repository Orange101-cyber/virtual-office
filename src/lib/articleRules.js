// Article Writer — brief rules and compliance checks.
//
// The AI is told the rules up front, but models drift on counts (word count,
// keyword frequency), so after generation we measure the article here, fix
// the mechanical things ourselves (exact H1, dash lists → bullets), and send a
// targeted revision request for anything still off.
//
// Article format (plain text, no markdown):
//   first line = H1, headings on their own line, blank line between blocks,
//   bullets as "• item", numbered lists as "1. item", FAQ as "Q:" / "A:".

const NUM_WORDS = { once: 1, one: 1, twice: 2, two: 2, thrice: 3, three: 3, four: 4, five: 5 };
const toNum = (s) => (s == null ? null : NUM_WORDS[String(s).toLowerCase()] ?? Number(s));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s = '') => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

export const BULLET = '•';
const BULLET_RE = /^\s*•\s+/;
const NUMBERED_RE = /^\s*\d{1,2}[.)]\s+/;
const DASH_RE = /^\s*[-–—*]\s+/;
const MARKER_RE = /\[(CTA Button|Internal Link|External Link)[^\]]*\]/gi;

export const wordsIn = (s = '') => (s.replace(MARKER_RE, ' ').match(/[A-Za-z0-9][A-Za-z0-9'’$%.,-]*/g) || []).length;

// ── Reading the brief's rules ──
// Looks in (highest priority first) the writer's extra instructions, the
// brief's keyword notes and its SEO checklist.
export function parseBriefRules({ brief = {}, focusKeyword = '', extra = '', wordTarget = 1100 } = {}) {
  const sources = [extra, brief.keyword_notes, ...(Array.isArray(brief.seo_checklist) ? brief.seo_checklist : [])]
    .filter(Boolean).map(String);
  const sentences = sources.flatMap(s => s.split(/(?<=[.;\n])\s+|\n/)).map(s => s.trim()).filter(Boolean);
  const fk = norm(focusKeyword);

  // "exactly 7 times", "2x max", "2-3 times", "twice", "no more than 3 times"
  const parseCount = (s) => {
    const m = s.match(/(exactly|only|max(?:imum)?(?:\s+of)?|up\s+to|no\s+more\s+than|at\s+most)?\s*\b(?:(\d+)(?:\s*(?:-|–|to)\s*(\d+))?\s*(?:x|times?)\b|(once|twice|thrice))\s*(max(?:imum)?|or\s+(?:less|fewer)|at\s+most)?/i);
    if (!m) return null;
    const a = m[4] ? toNum(m[4]) : Number(m[2]);
    const b = m[3] != null ? Number(m[3]) : null;
    if (b != null) return { min: a, max: b };
    const isMax = (m[1] && !/exactly/i.test(m[1])) || !!m[5];
    return isMax ? { min: 1, max: a } : { min: a, max: a };
  };
  const pctRange = (s) => {
    const m = s.match(/(\d+(?:\.\d+)?)\s*(?:%\s*)?(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*%/);
    if (!m) return null;
    return { min: Math.max(1, Math.round(wordTarget * m[1] / 100)), max: Math.round(wordTarget * m[2] / 100) };
  };
  let fkRule = null, secRule = null, fkPct = null;
  for (const s of sentences) {
    const low = norm(s);
    const isSecondary = /secondary/.test(low);
    const isFk = !isSecondary && (/\bfk\b|focus keyword/.test(low) || (fk && low.includes(fk)));
    if (isSecondary && !secRule) secRule = parseCount(low.slice(low.indexOf('secondary')));
    else if (isFk && !fkRule) {
      // Read only what follows the keyword, so digits inside it (e.g. "top 10 …") aren't taken as the count.
      const at = fk && low.includes(fk) ? low.indexOf(fk) + fk.length : 0;
      fkRule = parseCount(low.slice(at));
    }
    if (!fkPct && /density/.test(low)) fkPct = pctRange(s);
  }
  return {
    fk: fkRule || fkPct || { min: Math.max(3, Math.round(wordTarget * 0.005)), max: Math.max(5, Math.round(wordTarget * 0.01)) },
    fkSource: fkRule ? 'brief' : fkPct ? 'brief (density)' : 'default',
    secondary: secRule || { min: 1, max: 3 },
    secondarySource: secRule ? 'brief' : 'default',
  };
}

export const describeRange = ({ min, max }) => (min === max ? `exactly ${min}` : min <= 1 ? `no more than ${max}` : `${min}–${max}`);

// ── Reading the article ──
export function splitBlocks(text = '') {
  const blocks = [];
  let cur = [];
  for (const ln of text.replace(/\r/g, '').split('\n')) {
    if (ln.trim() === '') { if (cur.length) blocks.push(cur); cur = []; }
    else cur.push(ln.trim());
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

const looksLikeHeading = (s, knownHeadings) =>
  knownHeadings.has(norm(s).replace(/[:?]$/, ''))
  || /^#{1,3}\s/.test(s)
  || (s.length <= 90 && !/[.!:,;]$/.test(s) && s.split(/\s+/).length <= 14 && !/^[a-z•\d-]/.test(s) && !/^(Q|A):/i.test(s));

export function analyseArticle(text, { title = '', focusKeyword = '', secondaryKeywords = [], h2s = [], wordTarget = 1100, rules, maxParagraphWords = 70 } = {}) {
  const blocks = splitBlocks(text);
  const known = new Set(h2s.map(h => norm(h).replace(/[:?]$/, '')));
  const h1 = blocks[0]?.length === 1 ? blocks[0][0].replace(/^#+\s*/, '') : '';

  let inToc = false, inFaq = false;
  const body = [];            // text counted for keywords (no headings, no TOC)
  let totalWords = 0, faqWords = 0;
  const lists = { bullet: 0, numbered: 0, dash: 0 };
  const longParagraphs = [];

  blocks.forEach((lines, i) => {
    const joined = lines.join(' ');
    if (i === 0 && lines.length === 1) { totalWords += wordsIn(joined); return; }   // H1
    const heading = lines.length === 1 && looksLikeHeading(joined, known);
    if (heading) {
      const h = norm(joined);
      inToc = /^table of contents|^contents$|^in this article/.test(h);
      if (/^(faqs?|frequently asked questions)\b/.test(h)) inFaq = true;
      else if (inFaq && known.has(h.replace(/[:?]$/, ''))) inFaq = false;
      totalWords += wordsIn(joined);
      return;
    }
    if (inToc) return;   // a TOC is navigation, not content

    const bullets = lines.filter(l => BULLET_RE.test(l)).length;
    const numbered = lines.filter(l => NUMBERED_RE.test(l)).length;
    const dashes = lines.filter(l => DASH_RE.test(l)).length;
    if (bullets >= 2) lists.bullet++;
    if (numbered >= 2) lists.numbered++;
    if (dashes >= 1) lists.dash++;

    const w = wordsIn(joined);
    totalWords += w;
    if (inFaq) faqWords += w;
    // FAQ questions count as headings for keyword purposes
    body.push(lines.filter(l => !/^Q:/i.test(l)).join(' '));

    const isList = bullets + numbered + dashes >= Math.max(1, lines.length - 1);
    if (!isList && !inFaq && w > maxParagraphWords) longParagraphs.push({ words: w, preview: joined.slice(0, 80) });
    if (inFaq) {
      const ans = joined.replace(/^Q:.*?A:\s*/i, '');
      if (wordsIn(ans) > maxParagraphWords * 1.5) longParagraphs.push({ words: wordsIn(ans), preview: joined.slice(0, 80) });
    }
  });

  const bodyText = ` ${norm(body.join(' ').replace(MARKER_RE, ' '))} `;
  const count = (kw) => {
    const k = norm(kw);
    if (!k) return 0;
    return (bodyText.match(new RegExp(`(?<![a-z0-9])${esc(k)}(?![a-z0-9])`, 'g')) || []).length;
  };
  const fkCount = count(focusKeyword);
  const secondary = secondaryKeywords.filter(Boolean).map(kw => ({ kw, count: count(kw) }));

  const lo = Math.round(wordTarget * 0.9), hi = Math.round(wordTarget * 1.1);
  const r = rules || parseBriefRules({ focusKeyword, wordTarget });
  const checks = [];
  const add = (id, ok, label, detail, fix) => checks.push({ id, ok, label, detail, fix });

  add('title', !!title && norm(h1) === norm(title), 'H1 matches the brief title',
    h1 ? `“${h1}”` : 'No H1 found',
    `The first line (H1) must be exactly: ${title}`);
  add('words', totalWords >= lo && totalWords <= hi, `Word count ${lo}–${hi}`,
    `${totalWords} words (${totalWords - faqWords} excluding FAQ)`,
    totalWords > hi
      ? `The article is ${totalWords} words; it must be ${lo}–${hi} words in total INCLUDING the FAQ. Cut about ${totalWords - wordTarget} words: tighten every section, remove repetition and filler, and keep FAQ answers to 2–3 sentences.`
      : `The article is ${totalWords} words; it must be ${lo}–${hi} words in total including the FAQ. Add about ${wordTarget - totalWords} words of useful, specific detail spread across the sections.`);
  if (focusKeyword) add('fk', fkCount >= r.fk.min && fkCount <= r.fk.max, `Focus keyword ${describeRange(r.fk)}×`,
    `“${focusKeyword}” used ${fkCount}× in body text`,
    fkCount > r.fk.max
      ? `“${focusKeyword}” appears ${fkCount} times in the body (excluding headings); it must appear ${describeRange(r.fk)} times. Replace ${fkCount - r.fk.max} of them with natural variations or pronouns, keeping the one in the first sentence.`
      : `“${focusKeyword}” appears ${fkCount} times in the body (excluding headings); it must appear ${describeRange(r.fk)} times. Add ${r.fk.min - fkCount} more natural mention(s) in sections that don't have it yet.`);
  for (const s of secondary) {
    const ok = s.count <= r.secondary.max && (r.secondary.min <= 1 ? s.count >= 1 : s.count >= r.secondary.min);
    add(`sec:${s.kw}`, ok, `“${s.kw}” ${describeRange(r.secondary)}×`, `used ${s.count}×`,
      s.count > r.secondary.max
        ? `Secondary keyword “${s.kw}” appears ${s.count} times; it must appear ${describeRange(r.secondary)} times. Reword ${s.count - r.secondary.max} of those sentences without it.`
        : `Secondary keyword “${s.kw}” appears ${s.count} times; it must appear ${describeRange(r.secondary)} times. Work it in naturally where relevant.`);
  }
  add('lists', lists.bullet + lists.numbered >= 2 && lists.dash === 0, 'Uses bullet / numbered lists',
    `${lists.bullet} bulleted, ${lists.numbered} numbered${lists.dash ? `, ${lists.dash} dash lists` : ''}`,
    `Use at least 2–3 real lists: bullets start with "• " and steps/ranked items with "1. ", "2. " … Never start a line with a dash. Turn any section that lists factors, tips, costs or steps into a list.`);
  add('paragraphs', longParagraphs.length === 0, `No paragraph over ${maxParagraphWords} words`,
    longParagraphs.length ? `${longParagraphs.length} long paragraph(s)` : 'All short',
    `Split these long paragraphs into 2–3 sentence paragraphs or a list: ${longParagraphs.slice(0, 5).map(p => `“${p.preview}…” (${p.words} words)`).join('; ')}`);

  return { h1, totalWords, faqWords, fkCount, secondary, lists, longParagraphs, checks, passed: checks.every(c => c.ok) };
}

// Things we can fix ourselves without the AI.
export function applyMechanicalFixes(text = '', { title = '' } = {}) {
  let out = text.replace(/\r/g, '').replace(/^\s*```[a-z]*\s*$/gim, '');
  out = out.split('\n').map(l => l.replace(/^(\s*)[-–—*]\s+/, `$1${BULLET} `).replace(/^#{1,6}\s+/, '').replace(/\*\*([^*]+)\*\*/g, '$1')).join('\n');
  out = out.replace(/^\s+/, '');
  if (title) {
    const lines = out.split('\n');
    const first = lines.findIndex(l => l.trim());
    if (first >= 0) lines[first] = title.trim();
    else lines.unshift(title.trim());
    out = lines.join('\n');
  }
  return out.trim() + '\n';
}

export function revisionPrompt(article, failed) {
  return `Revise the article below so it meets every requirement. Keep everything that already works (facts, structure, H2 headings, links, CTA markers, FAQ questions, tone). Change only what is needed.

FIX THESE:
${failed.map((c, i) => `${i + 1}. ${c.fix}`).join('\n')}

FORMAT: plain text (no markdown, no **bold**, no # headings). First line is the H1. Headings on their own line. Blank line between blocks. Bullets start with "• ", numbered items with "1. ". FAQ as "Q:" and "A:" lines.

Return ONLY the full revised article — no notes or explanations.

ARTICLE:
${article}`;
}

// SEO title / meta description / slug validation (shown next to the fields).
export function seoFieldChecks({ seoTitle = '', metaDescription = '', slug = '' }, focusKeyword = '') {
  const fk = norm(focusKeyword);
  const slugFk = fk.replace(/[^a-z0-9]+/g, '-');
  return {
    seoTitle: { ok: seoTitle.length >= 30 && seoTitle.length <= 60 && (!fk || norm(seoTitle).includes(fk)), note: `${seoTitle.length}/60 chars${fk && !norm(seoTitle).includes(fk) ? ' · missing focus keyword' : ''}` },
    metaDescription: { ok: metaDescription.length >= 120 && metaDescription.length <= 155 && (!fk || norm(metaDescription).includes(fk)), note: `${metaDescription.length}/155 chars${fk && !norm(metaDescription).includes(fk) ? ' · missing focus keyword' : ''}` },
    slug: { ok: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && (!slugFk || slug.includes(slugFk)), note: /^[a-z0-9-]*$/.test(slug) ? `${slug.length} chars${slugFk && !slug.includes(slugFk) ? ' · missing focus keyword' : ''}` : 'use lowercase letters, numbers and hyphens only' },
  };
}

export const toSlug = (s = '') => s.toLowerCase().replace(/^https?:\/\/[^/]+/, '').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 75).replace(/-+$/, '');
