import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import { getClientContext, formatContextForPrompt } from '../lib/clientContext';
import {
  parseBriefRules, describeRange, analyseArticle, applyMechanicalFixes, revisionPrompt,
  seoFieldChecks, toSlug,
} from '../lib/articleRules';
import toast from 'react-hot-toast';
import BlogPreviewModal from '../components/BlogPreviewModal';

const MAX_PARAGRAPH_WORDS = 70;

async function callClaude(prompt, { maxTokens = 16000, effort = 'medium', system } = {}) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('API key not set');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5-5',
      max_tokens: maxTokens,
      output_config: { effort },
      fallbacks: 'default',
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const msg = await res.json();
  return (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

// Everything the brief + settings say the article must meet, in one place so
// the prompt, the auto-revision and the on-screen checklist all agree.
function articleSpec(selectedBrief, { wordTarget, customInstructions }) {
  const brief = selectedBrief?.brief_json || {};
  const target = Math.max(300, Number(wordTarget) || 1100);
  const focusKeyword = selectedBrief?.focus_keyword || '';
  return {
    title: (selectedBrief?.title || '').trim(),
    focusKeyword,
    secondaryKeywords: brief.secondary_keywords || [],
    h2s: (brief.h2_structure || []).map(h => h.h2).filter(Boolean),
    wordTarget: target,
    rules: parseBriefRules({ brief, focusKeyword, extra: customInstructions, wordTarget: target }),
    maxParagraphWords: MAX_PARAGRAPH_WORDS,
  };
}

export default function ArticleWriter() {
  const { clients: dbClients } = useClients();
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [briefs, setBriefs] = useState([]);
  const [selectedBrief, setSelectedBrief] = useState(null);
  const [clientArticles, setClientArticles] = useState([]);
  const [article, setArticle] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [wordTarget, setWordTarget] = useState(1100);
  const [contentType, setContentType] = useState('Blog Post');
  const [readingLevel, setReadingLevel] = useState('grade-7');
  const [customInstructions, setCustomInstructions] = useState('');
  const [step, setStep] = useState('');
  const [seo, setSeo] = useState({ seoTitle: '', metaDescription: '', slug: '' });
  const [seoBusy, setSeoBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const saveTimerRef = useRef(null);

  // Stable derived keys so the effects below don't re-run every render
  // (dbClients gets a new array reference each render → caused the flicker).
  const dbNames = dbClients.map(c => c.name).join('|');
  const dbClientId = dbClients.find(c => c.name === selectedClient)?.id;

  // Load clients
  useEffect(() => {
    const fromDb = dbClients.map(c => c.name);
    supabase.from('content_plans').select('client_name').then(({ data }) => {
      const fromPlans = data ? data.map(d => d.client_name) : [];
      const unique = [...new Set([...fromDb, ...fromPlans])].filter(Boolean).sort();
      setClients(unique);
      if (unique.length && !selectedClient) setSelectedClient(unique[0]);
    });
  }, [dbNames]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load briefs for selected client — merges generated briefs (content_briefs)
  // with planned items (content_plans) so anything you've briefed OR planned
  // (incl. cards moved to "Briefed") shows up. Client match is case-insensitive.
  useEffect(() => {
    if (!selectedClient) { setBriefs([]); return; }
    let cancelled = false;
    (async () => {
      const [briefRes, planRes] = await Promise.all([
        supabase.from('content_briefs').select('*').ilike('client_name', selectedClient).order('created_at', { ascending: false }),
        supabase.from('content_plans').select('*').ilike('client_name', selectedClient).order('created_at', { ascending: false }),
      ]);
      if (cancelled) return;
      const briefRows = briefRes.data || [];
      const briefedPlanIds = new Set(briefRows.map(b => b.plan_id).filter(Boolean));
      const briefTitles = new Set(briefRows.map(b => (b.title || '').toLowerCase().trim()));
      const planItems = (planRes.data || [])
        .filter(p => !briefedPlanIds.has(p.id) && !briefTitles.has((p.title || '').toLowerCase().trim()))
        .map(p => ({ id: `plan-${p.id}`, title: p.title, focus_keyword: p.focus_keyword, created_at: p.created_at, brief_json: null, _plan: true, _status: p.status }));
      setBriefs([...briefRows, ...planItems]);
    })();
    return () => { cancelled = true; };
  }, [selectedClient]);

  // Load past articles for writing style
  useEffect(() => {
    if (!selectedClient || !dbClientId) { setClientArticles([]); return; }
    supabase.from('reports')
      .select('id, name, article_title, article_content')
      .eq('client_id', dbClientId)
      .order('updated_at', { ascending: false })
      .limit(5)
      .then(({ data }) => setClientArticles(data || []));
  }, [selectedClient, dbClientId]);

  // Load saved draft when selecting a brief
  const selectBrief = (b) => {
    setSelectedBrief(b);
    setArticle(b?.draft_article || '');
    setLastSaved(b?.draft_article ? new Date() : null);
    setSeo({ seoTitle: '', metaDescription: '', slug: '' });
    setSaveError('');
  };

  // Auto-save draft with debounce (only real briefs persist a draft)
  const saveDraft = async (text) => {
    if (!selectedBrief?.id || selectedBrief._plan || !text) return false;
    setSaving(true);
    const { error } = await supabase.from('content_briefs')
      .update({ draft_article: text })
      .eq('id', selectedBrief.id);
    setSaving(false);
    if (error) { setSaveError(error.message); return false; }
    setSaveError('');
    setLastSaved(new Date());
    return true;
  };

  const handleArticleChange = (newText) => {
    setArticle(newText);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveDraft(newText), 2000);
  };

  const spec = useMemo(
    () => articleSpec(selectedBrief, { wordTarget, customInstructions }),
    [selectedBrief, wordTarget, customInstructions],
  );
  const analysis = useMemo(() => (article ? analyseArticle(article, spec) : null), [article, spec]);
  const seoChecks = useMemo(() => seoFieldChecks(seo, spec.focusKeyword), [seo, spec.focusKeyword]);

  const generateSeo = async (text) => {
    const brief = selectedBrief?.brief_json || {};
    const raw = await callClaude(`Write the SEO fields for this ${contentType === 'SEO Page' ? 'page' : 'blog article'}.

Client: ${selectedClient}
Focus keyword: ${spec.focusKeyword}
${brief.seo_title ? `Brief's suggested SEO title (improve on it if needed): ${brief.seo_title}\n` : ''}${brief.meta_description ? `Brief's suggested meta description: ${brief.meta_description}\n` : ''}${brief.suggested_slug ? `Brief's suggested URL: ${brief.suggested_slug}\n` : ''}
Rules:
- seo_title: 50–60 characters, focus keyword near the start, end with " | ${selectedClient}" if it fits within 60.
- meta_description: 140–155 characters, includes the focus keyword, summarises the article and ends with a reason to click. Australian English.
- slug: lowercase, hyphenated, 3–6 words, contains the focus keyword, no stop words, no dates, no domain or slashes.

Return ONLY JSON: {"seo_title":"","meta_description":"","slug":""}

ARTICLE:
${text.slice(0, 12000)}`, { maxTokens: 2000, effort: 'low' });
    const j = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return { seoTitle: (j.seo_title || '').trim(), metaDescription: (j.meta_description || '').trim(), slug: toSlug(j.slug || '') };
  };

  const regenerateSeo = async () => {
    if (!article) return;
    setSeoBusy(true);
    try { setSeo(await generateSeo(article)); }
    catch (e) { toast.error('SEO fields failed: ' + e.message); }
    setSeoBusy(false);
  };

  const handleGenerate = async () => {
    if (!selectedBrief) return toast.error('Select a brief first.');
    if (!import.meta.env.VITE_ANTHROPIC_API_KEY) return toast.error('API key not set');
    setGenerating(true);
    setArticle('');
    setSeo({ seoTitle: '', metaDescription: '', slug: '' });

    const brief = selectedBrief.brief_json || {};
    const { title, focusKeyword, secondaryKeywords, h2s, wordTarget: target, rules } = spec;
    const lo = Math.round(target * 0.9), hi = Math.round(target * 1.1);

    // Build writing style samples
    let styleSamples = '';
    const articlesWithContent = clientArticles.filter(a => a.article_content?.length > 100);
    if (articlesWithContent.length > 0) {
      styleSamples = articlesWithContent
        .slice(0, 3)
        .map((a, i) => `--- Style Sample ${i + 1}: "${a.article_title || a.name}" ---\n${a.article_content.substring(0, 1500)}`)
        .join('\n\n');
    }

    const readingInstructions = {
      'grade-5': 'Write at a Grade 5 reading level. Use very simple everyday words. Keep sentences under 12 words on average. Use only common vocabulary. No jargon at all. Short paragraphs of 1-2 sentences.',
      'grade-6': 'Write at a Grade 6 reading level. Use simple, clear language. Keep sentences under 15 words on average. Avoid complex words where simpler ones work. Short paragraphs of 2-3 sentences.',
      'grade-7': 'Write at a Grade 7 reading level. Use plain English that is easy to scan. Keep sentences under 18 words on average. Occasional industry terms are OK if context makes them clear. Paragraphs of 2-3 sentences.',
      'grade-8': 'Write at a Grade 8 reading level. Use clear but slightly more sophisticated language. Sentences can average 18-20 words. Industry-specific terms are fine with brief context. Paragraphs of 2-4 sentences.',
      'grade-10': 'Write at a Grade 10 reading level. Use professional language appropriate for an informed audience. Sentences can be longer and more complex. Industry terminology expected. Paragraphs of 3-4 sentences.',
      'grade-12': 'Write at a Grade 12 reading level. Use expert-level language with technical terminology. Complex sentence structures are acceptable. Assume the reader has domain knowledge. Detailed paragraphs of 3-5 sentences.',
    };

    // Word budget per part, so the model lands near the target instead of over-writing.
    const faqCount = brief.faq_section?.length || 4;
    const faqBudget = faqCount * 45;
    const sectionBudget = Math.max(80, Math.round((target - faqBudget - 170) / Math.max(1, h2s.length || 5)));
    const checklist = Array.isArray(brief.seo_checklist) ? brief.seo_checklist : [];

    try {
      setStep('Writing article…');
      const clientCtx = await getClientContext(selectedClient);
      const clientContextText = formatContextForPrompt(clientCtx);

      const prompt = `You are an expert SEO content writer for an Australian digital marketing agency.
Write a complete, publish-ready ${contentType === 'SEO Page' ? 'SEO landing page' : 'blog article'} based on the brief below. Follow the brief exactly — the numbered requirements are checked automatically after you write.

${clientContextText ? `CLIENT CONTEXT (use this to inform the article):
${clientContextText}

` : ''}CLIENT: ${selectedClient}
CONTENT TYPE: ${contentType}
${brief.overview ? `\nARTICLE GOAL: ${brief.overview}\n` : ''}
REQUIREMENTS:
1. TITLE: the first line is the H1 and must be exactly, word for word: ${title}
2. LENGTH: ${lo}–${hi} words in TOTAL, including the FAQ (target ${target}). Budget: intro ~90 words, each H2 section ~${sectionBudget} words, FAQ ~${faqBudget} words (answers of 2–3 sentences), closing ~80 words. Do not go over ${hi}.
3. FOCUS KEYWORD "${focusKeyword}": use it ${describeRange(rules.fk)} times in the body text (headings don't count). Include it in the first sentence. Count as you write.
${secondaryKeywords.length ? `4. SECONDARY KEYWORDS — use EACH one ${describeRange(rules.secondary)} times in total, never more:\n${secondaryKeywords.map(k => `   - ${k}`).join('\n')}` : '4. No secondary keywords.'}
5. SCANNABLE: no paragraph longer than 3 sentences or ${MAX_PARAGRAPH_WORDS} words. Wherever a section covers several factors, tips, costs, options or steps, use a list instead of a paragraph. Use at least 3 lists across the article.
6. LISTS: bullets start with "• " (the bullet character). Steps or ranked items use "1. ", "2. ", "3. ". Never start a line with a dash (-).

H2 STRUCTURE (use these headings, in this order):
${brief.h2_structure?.map(h => `${h.h2}\n  Cover: ${h.description}`).join('\n') || 'Use appropriate H2s'}

FAQ SECTION — heading "Frequently Asked Questions", then each as a "Q:" line followed by an "A:" line:
${brief.faq_section?.map(f => `Q: ${f.question}\n  Guidance: ${f.guidance}`).join('\n') || 'Include 3-4 relevant FAQs'}

CTA: ${brief.cta_recommendation || 'Include CTA buttons at top and bottom'}
CTA LINK: ${brief.cta_links?.[0] || ''}

INTERNAL LINKS TO INCLUDE:
${brief.internal_links?.map(l => `- ${l.page}${l.url ? ` (${l.url})` : ''}`).join('\n') || 'Include 2-3 internal links'}
${checklist.length ? `
BRIEF CHECKLIST (follow every item that applies to the article text; ignore items about images, schema or publishing):
${checklist.map(c => `- ${c}`).join('\n')}
` : ''}${brief.keyword_notes ? `\nKEYWORD NOTES FROM THE BRIEF: ${brief.keyword_notes}\n` : ''}
${styleSamples ? `
WRITING STYLE REFERENCE — Match this client's writing style closely (tone, sentence structure, vocabulary). The formatting requirements above still apply.

${styleSamples}

END OF STYLE REFERENCE
` : ''}
${customInstructions ? `ADDITIONAL INSTRUCTIONS FROM THE WRITER (these take priority over everything above):\n${customInstructions}\n` : ''}
FORMATTING:
- Plain text: no markdown, no **bold**, no # symbols
- First line: the H1 (requirement 1). Then the intro.
- "Table of Contents" heading after the intro, listing the H2s, one per line
- Each heading on its own line, with a blank line between every heading, paragraph and list
- Include [CTA Button: Book an Appraisal | Link: ${brief.cta_links?.[0] || ''}] after the intro and at the end
- Include internal links as [Internal Link: Page Name | URL]
- Include at least 1 external authority link (ABS, government source, or industry body)
- ${readingInstructions[readingLevel] || readingInstructions['grade-7']}
- DO NOT include any meta information (SEO title, meta description, slug, notes) — just the article`;

      let text = applyMechanicalFixes(await callClaude(prompt), { title });
      let result = analyseArticle(text, spec);

      // One targeted revision pass for anything the model missed.
      const failed = result.checks.filter(c => !c.ok);
      if (failed.length) {
        setStep(`Fixing ${failed.length} brief issue${failed.length > 1 ? 's' : ''} (word count, keywords, lists)…`);
        try {
          const revised = applyMechanicalFixes(await callClaude(revisionPrompt(text, failed)), { title });
          const r2 = analyseArticle(revised, spec);
          const score = (r) => r.checks.filter(c => c.ok).length;
          if (score(r2) >= score(result)) { text = revised; result = r2; }
        } catch (e) { console.warn('Revision pass failed:', e); }
      }
      setArticle(text);

      setStep('Writing SEO title, meta description & slug…');
      try { setSeo(await generateSeo(text)); }
      catch (e) { toast.error('SEO fields failed: ' + e.message); }

      // Auto-save to brief record (plan-only items have no content_briefs row)
      let saved = false;
      if (selectedBrief?.id && !selectedBrief._plan) {
        saved = await saveDraft(text);
        if (saved) setBriefs(prev => prev.map(b => b.id === selectedBrief.id ? { ...b, draft_article: text } : b));
      }
      const misses = result.checks.filter(c => !c.ok).length;
      toast.success(`Article generated${saved ? ' and saved' : ''}${misses ? ` — ${misses} brief check${misses > 1 ? 's' : ''} still need a manual touch` : ' — meets every brief check'}`);
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
    setStep('');
    setGenerating(false);
  };

  const wordCount = analysis?.totalWords ?? 0;
  const lo = Math.round(spec.wordTarget * 0.9), hi = Math.round(spec.wordTarget * 1.1);
  const wordsOk = wordCount >= lo && wordCount <= hi;
  const styleCount = clientArticles.filter(a => a.article_content?.length > 100).length;
  const seoBlock = seo.seoTitle || seo.metaDescription || seo.slug
    ? `SEO Title: ${seo.seoTitle}\nMeta Description: ${seo.metaDescription}\nURL Slug: ${seo.slug}\n\n---\n\n`
    : '';

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-[#1a1a1a]">Article Writer</h1>
          <p className="text-[11px] text-gray-400">
            AI writes full articles from your briefs, matched to each client's writing style
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
          {/* Left: Controls */}
          <div className="flex flex-col gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold mb-3">Select Brief</h2>
              <div className="space-y-3">
                <div>
                  <Label>Client</Label>
                  <select value={selectedClient} onChange={e => { setSelectedClient(e.target.value); selectBrief(null); }} className="input-field">
                    {clients.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <Label>Brief to write from</Label>
                  {briefs.length === 0 ? (
                    <div className="text-[11px] text-gray-400 bg-[#f8f8f6] rounded-lg p-3">
                      Nothing found for {selectedClient} yet. Generate a brief in the Brief Generator, or add a content item in the Content Planner — both show up here.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {briefs.map(b => (
                        <div
                          key={b.id}
                          onClick={() => selectBrief(b)}
                          className={`rounded-lg p-2.5 cursor-pointer border transition-colors ${
                            selectedBrief?.id === b.id
                              ? 'border-[#F5C518] bg-[#F5C518]/5'
                              : 'border-gray-200 hover:border-[#F5C518]/50'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <div className="text-[11px] font-medium text-[#1a1a1a] truncate flex-1">{b.title}</div>
                            {b._plan
                              ? <span className="text-[8px] font-bold uppercase bg-blue-50 text-blue-600 px-1.5 py-0 rounded-full shrink-0">{b._status || 'Planned'}</span>
                              : <span className="text-[8px] font-bold uppercase bg-[#F5C518]/20 text-[#1a1a1a] px-1.5 py-0 rounded-full shrink-0">Brief</span>}
                            {b.draft_article && (
                              <span className="text-[8px] font-bold uppercase bg-green-50 text-green-600 px-1.5 py-0 rounded-full shrink-0">Draft</span>
                            )}
                          </div>
                          <div className="text-[9px] text-gray-400 flex gap-2 mt-0.5">
                            <span>FK: {b.focus_keyword}</span>
                            <span>{new Date(b.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Content Type</Label>
                    <select value={contentType} onChange={e => setContentType(e.target.value)} className="input-field">
                      <option>Blog Post</option><option>SEO Page</option>
                    </select>
                  </div>
                  <div>
                    <Label>Target Words</Label>
                    <input type="number" value={wordTarget} onChange={e => setWordTarget(e.target.value)} className="input-field" />
                  </div>
                </div>

                <div>
                  <Label>Reading Level</Label>
                  <select value={readingLevel} onChange={e => setReadingLevel(e.target.value)} className="input-field">
                    <option value="grade-5">Grade 5 — Very Easy (everyday language, short sentences)</option>
                    <option value="grade-6">Grade 6 — Easy (simple words, clear structure)</option>
                    <option value="grade-7">Grade 7 — Standard (recommended for most blogs)</option>
                    <option value="grade-8">Grade 8 — Moderate (slightly more complex)</option>
                    <option value="grade-10">Grade 10 — Advanced (professional audience)</option>
                    <option value="grade-12">Grade 12 — Expert (technical/industry language)</option>
                  </select>
                  <div className="text-[9px] text-gray-400 mt-0.5">
                    {readingLevel === 'grade-5' && 'Best for: general public, older demographics, accessibility'}
                    {readingLevel === 'grade-6' && 'Best for: consumer blogs, broad audiences'}
                    {readingLevel === 'grade-7' && 'Best for: most SEO content, property, finance blogs'}
                    {readingLevel === 'grade-8' && 'Best for: informed audiences, B2B light'}
                    {readingLevel === 'grade-10' && 'Best for: professional services, B2B, technical topics'}
                    {readingLevel === 'grade-12' && 'Best for: expert audiences, whitepapers, research-heavy'}
                  </div>
                </div>

                <div>
                  <Label>Additional Instructions (optional)</Label>
                  <textarea
                    value={customInstructions}
                    onChange={e => setCustomInstructions(e.target.value)}
                    rows={3}
                    placeholder="e.g. Focus more on first home buyers, use a warmer tone, mention specific suburbs..."
                    className="input-field resize-y"
                  />
                </div>

                {/* Style reference status */}
                <div className={`rounded-lg px-3 py-2 text-[10px] ${
                  styleCount > 0
                    ? 'bg-green-50 border border-green-200 text-green-700'
                    : 'bg-gray-50 border border-gray-200 text-gray-500'
                }`}>
                  {styleCount > 0
                    ? `✓ ${styleCount} past articles loaded — will match ${selectedClient}'s writing style`
                    : `No past articles for ${selectedClient}. Upload in SEO Checker for style matching.`
                  }
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={generating || !selectedBrief}
                  className="btn-primary w-full py-3 text-sm"
                >
                  {generating ? (step || 'Writing article…') : 'Write Article'}
                </button>
              </div>
            </div>

            {/* Brief preview */}
            {selectedBrief?.brief_json && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Brief Preview</h3>
                <div className="text-[11px] text-gray-700 space-y-1.5">
                  <div><span className="text-gray-400">H1 (brief title):</span> {selectedBrief.title}</div>
                  <div className="text-[10px] text-gray-500">
                    <span className="text-gray-400">Keywords:</span> “{spec.focusKeyword}” {describeRange(spec.rules.fk)}×
                    {spec.secondaryKeywords.length > 0 && <> · secondary {describeRange(spec.rules.secondary)}× each</>}
                    {' · '}{lo.toLocaleString()}–{hi.toLocaleString()} words
                  </div>
                  {selectedBrief.brief_json.secondary_keywords?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedBrief.brief_json.secondary_keywords.map((kw, i) => (
                        <span key={i} className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0 rounded-full">{kw}</span>
                      ))}
                    </div>
                  )}
                  {selectedBrief.brief_json.h2_structure?.map((h, i) => (
                    <div key={i} className="text-[10px] text-gray-500 border-l-2 border-gray-200 pl-2">{h.h2}</div>
                  ))}
                  {selectedBrief.brief_json.faq_section?.length > 0 && (
                    <div className="text-[9px] text-gray-400 mt-1">{selectedBrief.brief_json.faq_section.length} FAQs included</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right: Article output */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            {!article && !generating ? (
              <div className="flex flex-col items-center justify-center h-80 text-center text-gray-400">
                <div className="text-4xl mb-3 opacity-20">✍️</div>
                <p className="text-sm font-medium text-gray-500">Select a brief and click Write Article</p>
                <p className="text-[11px] mt-1 max-w-sm">
                  The AI will write a full, publish-ready article based on the brief structure,
                  keywords, and your client's writing style from past articles.
                </p>
              </div>
            ) : generating ? (
              <div className="flex flex-col items-center justify-center h-80 text-gray-500">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-[#F5C518] rounded-full animate-spin mb-4" />
                <p className="text-sm font-medium">{step || 'Writing article…'}</p>
                <p className="text-[11px] text-gray-400 mt-1">Usually 1–3 minutes: write, check against the brief, fix, then SEO fields</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-[#1a1a1a]">{selectedBrief?.title}</h2>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {wordCount.toLocaleString()} words ({(wordCount - (analysis?.faqWords || 0)).toLocaleString()} excl. FAQ) · {selectedClient}
                      {styleCount > 0 && ' · Style matched'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowPreview(true)}
                      className="btn-primary text-[10px]"
                      style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}
                    >
                      🎨 Preview as Blog
                    </button>
                    <button
                      onClick={() => { navigator.clipboard.writeText(article); toast.success('Article copied!'); }}
                      className="btn-secondary text-[10px]"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => {
                        const blob = new Blob([seoBlock + article], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${(selectedBrief?.title || 'Article').replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50)}.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="btn-secondary text-[10px]"
                    >
                      Download .txt
                    </button>
                    <button
                      onClick={async () => { if (await saveDraft(article)) toast.success('Draft saved!'); else toast.error('Draft not saved — see the note under the article'); }}
                      disabled={saving}
                      className="btn-secondary text-[10px]"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleGenerate}
                      disabled={generating}
                      className="btn-primary text-[10px]"
                    >
                      Regenerate
                    </button>
                  </div>
                </div>

                {/* Word count bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-gray-400">Word Count (incl. FAQ) · target {lo.toLocaleString()}–{hi.toLocaleString()}</span>
                    <span className={wordsOk ? 'text-green-600 font-semibold' : 'text-orange-500 font-semibold'}>
                      {wordCount.toLocaleString()} / {spec.wordTarget.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min((wordCount / spec.wordTarget) * 100, 100)}%`,
                        backgroundColor: wordsOk ? '#27ae60' : '#e67e22',
                      }}
                    />
                  </div>
                </div>

                {/* Brief compliance — re-checks live as you edit */}
                {analysis && (
                  <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-[#fafafa] border-b border-gray-200 flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex-1">Brief Checks</span>
                      <span className={`text-[10px] font-semibold ${analysis.passed ? 'text-green-600' : 'text-orange-500'}`}>
                        {analysis.checks.filter(c => c.ok).length}/{analysis.checks.length} passed
                      </span>
                    </div>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 p-3">
                      {analysis.checks.map(c => (
                        <li key={c.id} className="text-[11px] flex gap-1.5 min-w-0" title={c.ok ? '' : c.fix}>
                          <span className={c.ok ? 'text-green-600' : 'text-orange-500'}>{c.ok ? '✓' : '✗'}</span>
                          <span className="text-gray-700 shrink-0">{c.label}</span>
                          <span className="text-gray-400 truncate">· {c.detail}</span>
                        </li>
                      ))}
                    </ul>
                    {(spec.rules.fkSource === 'default' || spec.rules.secondarySource === 'default') && (
                      <div className="px-3 pb-2 text-[9px] text-gray-400">
                        {spec.rules.fkSource === 'default' && 'No focus-keyword count in the brief — using ~0.5–1% of the word target. '}
                        {spec.rules.secondarySource === 'default' && 'No secondary-keyword limit in the brief — using up to 3× each. '}
                        Add e.g. “focus keyword 7x, secondary keywords 2x max” to the brief or Additional Instructions to change this.
                      </div>
                    )}
                  </div>
                )}

                {/* SEO fields */}
                <div className="mb-4 border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex-1">SEO Title · Meta Description · URL Slug</span>
                    <button onClick={() => { navigator.clipboard.writeText(seoBlock.replace(/\n\n---\n\n$/, '')); toast.success('SEO fields copied!'); }}
                      disabled={!seoBlock} className="btn-secondary text-[10px] !py-1">Copy</button>
                    <button onClick={regenerateSeo} disabled={seoBusy || generating} className="btn-secondary text-[10px] !py-1">
                      {seoBusy ? 'Writing…' : seoBlock ? '↻ Regenerate' : 'Generate'}
                    </button>
                  </div>
                  {[
                    { key: 'seoTitle', label: 'SEO Title', rows: 1 },
                    { key: 'metaDescription', label: 'Meta Description', rows: 2 },
                    { key: 'slug', label: 'URL Slug', rows: 1 },
                  ].map(f => (
                    <div key={f.key} className="mb-1.5 last:mb-0">
                      <div className="flex justify-between text-[9px] mb-0.5">
                        <span className="font-bold uppercase tracking-wider text-gray-400">{f.label}</span>
                        {seo[f.key] && <span className={seoChecks[f.key].ok ? 'text-green-600' : 'text-orange-500'}>{seoChecks[f.key].note}</span>}
                      </div>
                      <textarea rows={f.rows} value={seo[f.key]} placeholder={seoBusy ? 'Writing…' : 'Generated with the article'}
                        onChange={e => setSeo(s => ({ ...s, [f.key]: f.key === 'slug' ? e.target.value.toLowerCase().replace(/\s+/g, '-') : e.target.value }))}
                        className="input-field resize-none" />
                    </div>
                  ))}
                </div>

                {/* Article content — editable */}
                <div className="relative">
                  <textarea
                    value={article}
                    onChange={e => handleArticleChange(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg p-5 text-[13px] text-gray-700 leading-[1.8] font-sans resize-y focus:outline-none focus:border-[#F5C518] min-h-[500px]"
                    style={{ height: '700px' }}
                  />
                  <div className="absolute bottom-2 right-3 text-[9px] text-gray-400">
                    {saving ? 'Saving...' : lastSaved ? `Auto-saved ${lastSaved.toLocaleTimeString()}` : ''}
                  </div>
                </div>
                {saveError && (
                  <div className="mt-1 text-[10px] text-orange-600">
                    Draft not saved to the database ({saveError}). Copy or download the article before leaving this page.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .input-field { width: 100%; border: 1px solid #e5e7eb; border-radius: 5px; padding: 6px 8px; font-size: 12px; background: #f8f8f6; outline: none; }
        .input-field:focus { border-color: #F5C518; background: white; }
        .btn-primary { background: #F5C518; color: #1a1a1a; border: none; border-radius: 5px; padding: 6px 14px; font-weight: 700; cursor: pointer; }
        .btn-primary:hover { background: #e6b800; }
        .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-secondary { background: transparent; border: 1px solid #e5e7eb; color: #6b7280; border-radius: 5px; padding: 6px 14px; cursor: pointer; }
        .btn-secondary:hover { border-color: #F5C518; color: #1a1a1a; }
      `}</style>

      <BlogPreviewModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        article={article}
        title={selectedBrief?.title}
        client={selectedClient}
      />
    </div>
  );
}

function Label({ children }) {
  return <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{children}</label>;
}
