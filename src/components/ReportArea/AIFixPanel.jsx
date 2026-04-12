import { useState } from 'react';
import { CHECKS } from '../../data/checklist';
import { downloadTemplateFile } from '../../lib/templateExport';
import * as dfs from '../../lib/dataForSeo';
import { mapCrawlToChecklist } from '../../lib/onPageAudit';
import toast from 'react-hot-toast';

// ── Writer-friendly helpers for SERP features ──
function getRecommendedFormat(f) {
  const hints = [];
  if (f.has_featured_snippet) hints.push('short, direct answer in the intro (50–60 words) formatted as a paragraph or bullet list');
  if (f.has_people_also_ask) hints.push('an FAQ section using H2 questions');
  if (f.has_video) hints.push('an embedded video');
  if (f.has_local_pack) hints.push('location-specific content (suburb, NAP, local references)');
  if (f.has_images) hints.push('multiple optimised images with descriptive alt text');
  if (f.has_knowledge_graph) hints.push('entity-rich headings that clearly name the topic');
  if (f.has_shopping) hints.push('a product comparison table with prices');
  if (f.has_top_stories) hints.push('a news-worthy angle with a recent date');
  if (hints.length === 0) return 'Standard blog post format — no special SERP features detected. Focus on depth, on-page SEO basics and matching top rankers.';
  if (hints.length === 1) return `Google wants ${hints[0]}.`;
  const last = hints.pop();
  return `Google wants ${hints.join(', ')} and ${last}.`;
}

function getMustIncludeActions(f) {
  const actions = [];
  if (f.has_people_also_ask && f.paa_questions?.length) {
    actions.push(`FAQ section with ${f.paa_questions.length} PAA question${f.paa_questions.length === 1 ? '' : 's'} as H2 headings`);
  }
  if (f.has_featured_snippet) {
    actions.push('Direct answer in your intro (50–60 words)');
    actions.push('Use a numbered list or short paragraph format');
  }
  if (f.has_local_pack) {
    actions.push('Mention the suburb/city by name in H1, intro and conclusion');
    actions.push('NAP (name, address, phone) or a Google Business Profile link');
  }
  if (f.has_knowledge_graph) {
    actions.push('Clear entity headings (who/what/where)');
  }
  if (actions.length === 0) {
    actions.push('Strong on-page SEO (title, meta, H1, image alts)');
    actions.push('Match or exceed top-ranker content depth');
  }
  return actions;
}

function getConsiderActions(f) {
  const actions = [];
  if (f.has_video) actions.push('Embed a relevant YouTube/Vimeo video');
  if (f.has_images) actions.push('Add 4–6 optimised images with alt text');
  if (f.has_top_stories) actions.push('Add a news hook or recent date reference');
  if (f.has_shopping) actions.push('Add a product comparison table');
  if (f.has_twitter) actions.push('Embed social proof / tweets');
  if (f.has_related_searches) actions.push('Cover related search terms in H2/H3 subheadings');
  if (actions.length === 0) {
    actions.push('Author bio block (E-E-A-T signals)');
    actions.push('Internal links to related content');
    actions.push('External links to authoritative sources');
  }
  return actions;
}

// Normalise related searches to strings regardless of API shape
function flattenRelated(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(r => (typeof r === 'string' ? r : (r?.title || r?.keyword || ''))).filter(Boolean);
}

export default function AIFixPanel({ fields, checklistState, clientName, onFieldChange, onBulkCheck }) {
  const [validating, setValidating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [keywordValidation, setKeywordValidation] = useState(null);
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState(null);
  const [analysingFeatures, setAnalysingFeatures] = useState(false);
  const [serpFeatures, setSerpFeatures] = useState(null);
  const [analysingGap, setAnalysingGap] = useState(false);
  const [gapAnalysis, setGapAnalysis] = useState(null);
  const [loadingRanked, setLoadingRanked] = useState(false);
  const [rankedKeywords, setRankedKeywords] = useState(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [intentData, setIntentData] = useState(null);
  const [loadingDA, setLoadingDA] = useState(false);
  const [daData, setDaData] = useState(null);

  // Get all failed checks
  const allItems = CHECKS.flatMap(c => c.items);
  const failedItems = allItems.filter(i => !checklistState[i.id]);
  const criticalFailed = failedItems.filter(i => i.crit);

  const handleExportTemplate = async () => {
    setExporting(true);
    try {
      await downloadTemplateFile(fields, clientName || 'Article');
      toast.success('Template exported as .docx');
    } catch (err) {
      toast.error('Export error: ' + err.message);
    }
    setExporting(false);
  };

  const handleValidateKeyword = async () => {
    if (!fields.focus_keyphrase) {
      toast.error('Enter a focus keyphrase first');
      return;
    }
    if (!dfs.isConfigured()) {
      toast.error('DataForSEO not configured');
      return;
    }
    setValidating(true);
    setKeywordValidation(null);
    try {
      const keywords = [fields.focus_keyphrase];
      if (fields.secondary_keywords) {
        fields.secondary_keywords.split(',').forEach(k => {
          const trimmed = k.trim();
          if (trimmed) keywords.push(trimmed);
        });
      }

      const metrics = await dfs.getKeywordMetrics(keywords);
      const validation = metrics.map(m => ({
        keyword: m.keyword, sv: m.search_volume, kd: m.kd, cpc: m.cpc,
        valid: m.search_volume > 0,
      }));
      setKeywordValidation(validation);
      const valid = validation.filter(v => v.valid).length;
      const total = validation.length;
      if (valid === total) toast.success(`All ${total} keywords validated`);
      else toast(`${valid}/${total} keywords have real search volume`);
    } catch (err) {
      toast.error('Validation error: ' + err.message);
    }
    setValidating(false);
  };

  // ── NEW: Live URL Audit ──
  const handleLiveAudit = async () => {
    if (!fields.url?.trim()) return toast.error('Enter a URL first — can only audit live pages');
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');

    setAuditing(true);
    setAuditResult(null);
    try {
      toast('Crawling live page...');
      const crawl = await dfs.crawlPage(fields.url.trim());
      if (!crawl) {
        toast.error('Could not crawl URL — check it is live and accessible');
        setAuditing(false);
        return;
      }

      const mapping = mapCrawlToChecklist(crawl, fields.focus_keyphrase, fields.secondary_keywords);
      setAuditResult({ crawl, mapping });

      // Auto-tick the items that passed, but only if onBulkCheck is provided
      if (onBulkCheck) {
        const passedIds = Object.entries(mapping.checks).filter(([, v]) => v === true).map(([id]) => id);
        onBulkCheck(passedIds);
      }

      const passed = Object.values(mapping.checks).filter(v => v === true).length;
      const total = Object.keys(mapping.checks).length;
      toast.success(`Audit complete — ${passed}/${total} checks verified`);
    } catch (err) {
      toast.error('Audit error: ' + err.message);
    }
    setAuditing(false);
  };

  // ── NEW: SERP Features ──
  const handleSerpFeatures = async () => {
    if (!fields.focus_keyphrase) return toast.error('Enter a focus keyphrase first');
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');

    setAnalysingFeatures(true);
    setSerpFeatures(null);
    try {
      const features = await dfs.getSerpFeatures(fields.focus_keyphrase);
      setSerpFeatures(features);
      toast.success('SERP features loaded');
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
    setAnalysingFeatures(false);
  };

  // ── NEW: Content Gap Analysis ──
  const handleContentGap = async () => {
    if (!fields.focus_keyphrase) return toast.error('Enter a focus keyphrase first');
    if (!fields.article_content) return toast.error('Article content required');
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');

    setAnalysingGap(true);
    setGapAnalysis(null);
    try {
      toast('Fetching top 5 rankers...');
      const topRankers = await dfs.getTopRankersContent(fields.focus_keyphrase);
      if (!topRankers.length) {
        toast.error('Could not fetch competitor content');
        setAnalysingGap(false);
        return;
      }

      // Count your article's stats
      const yourWordCount = fields.article_content.split(/\s+/).filter(w => w).length;
      const yourH2s = (fields.article_content.match(/^##\s+.+$/gm) || [])
        .map(h => h.replace(/^##\s+/, '').toLowerCase().trim());

      // Aggregate competitor stats
      const avgWordCount = Math.round(topRankers.reduce((s, r) => s + (r.word_count || 0), 0) / topRankers.length);
      const allCompH2s = topRankers.flatMap(r => (r.h2 || []).map(h => h.toLowerCase().trim()));
      const commonH2s = [...new Set(allCompH2s)];
      const missingH2s = commonH2s.filter(h => !yourH2s.some(yh => yh.includes(h) || h.includes(yh)));

      setGapAnalysis({
        yourWordCount,
        avgWordCount,
        wordDiff: yourWordCount - avgWordCount,
        topRankers,
        missingH2s: missingH2s.slice(0, 15),
        commonH2Count: commonH2s.length,
      });
      toast.success(`Analysed ${topRankers.length} top rankers`);
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
    setAnalysingGap(false);
  };

  // ── NEW: Ranked Keywords (for live URL) ──
  const handleRankedKeywords = async () => {
    if (!fields.url?.trim()) return toast.error('Enter a URL first');
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');

    setLoadingRanked(true);
    setRankedKeywords(null);
    try {
      const ranked = await dfs.getRankedKeywordsForUrl(fields.url.trim(), 50);
      setRankedKeywords(ranked);
      if (ranked.length === 0) {
        toast('No ranked keywords yet — page may be too new');
      } else {
        toast.success(`${ranked.length} keywords this URL ranks for`);
      }
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
    setLoadingRanked(false);
  };

  // ── NEW: Search Intent Validation ──
  const handleSearchIntent = async () => {
    if (!fields.focus_keyphrase) return toast.error('Enter a focus keyphrase first');
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');

    setLoadingIntent(true);
    setIntentData(null);
    try {
      const intents = await dfs.getSearchIntent([fields.focus_keyphrase]);
      setIntentData(intents[0] || null);
      toast.success('Search intent loaded');
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
    setLoadingIntent(false);
  };

  // ── NEW: Domain Authority Comparison ──
  const handleDAComparison = async () => {
    if (!fields.url?.trim()) return toast.error('Enter a URL first');
    if (!fields.focus_keyphrase) return toast.error('Enter a focus keyphrase first');
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');

    setLoadingDA(true);
    setDaData(null);
    try {
      let yourDomain = '';
      try { yourDomain = new URL(fields.url).hostname; } catch { yourDomain = fields.url; }

      // Get your domain rank
      const yourRank = await dfs.getDomainRank(yourDomain);

      // Get top 5 competitor domains from SERP
      const serp = await dfs.getSerpResults(fields.focus_keyphrase);
      const topDomains = [...new Set((serp?.items || []).slice(0, 5).map(i => i.domain))].filter(d => d && d !== yourDomain.replace(/^www\./, ''));

      // Get rank for each top domain
      const compRanks = await Promise.all(
        topDomains.slice(0, 5).map(d => dfs.getDomainRank(d).catch(() => null))
      );

      const validComps = compRanks.filter(Boolean);
      const avgCompRank = validComps.length > 0
        ? Math.round(validComps.reduce((s, c) => s + (c.rank || 0), 0) / validComps.length)
        : 0;
      const avgCompBacklinks = validComps.length > 0
        ? Math.round(validComps.reduce((s, c) => s + (c.backlinks || 0), 0) / validComps.length)
        : 0;

      setDaData({
        yours: yourRank,
        competitors: validComps,
        avgCompRank,
        avgCompBacklinks,
      });
      toast.success('Domain comparison loaded');
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
    setLoadingDA(false);
  };

  const intentColors = {
    informational: 'text-blue-600 bg-blue-50',
    navigational: 'text-purple-600 bg-purple-50',
    commercial: 'text-orange-500 bg-orange-50',
    transactional: 'text-green-600 bg-green-50',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden mb-4">
      <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider flex justify-between items-center">
        <span>AI Fix & Validate · Powered by DataForSEO</span>
        <span className="text-[9px] text-white/50 font-normal normal-case">
          {failedItems.length} issues · {criticalFailed.length} critical
        </span>
      </div>
      <div className="p-3.5">
        <div className="text-[10px] text-gray-400 mb-3 leading-relaxed">
          Click <b>⚡ Fix</b> next to any red item below to get a proposed fix. Use the tools below for real-data validation.
        </div>

        {/* Primary actions row */}
        <div className="flex flex-wrap gap-2 mb-2">
          <button onClick={handleLiveAudit} disabled={auditing || !fields.url?.trim()}
            className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-[5px] px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40">
            {auditing ? 'Auditing...' : '🔍 Audit Live URL'}
          </button>
          <button onClick={handleValidateKeyword} disabled={validating || !fields.focus_keyphrase}
            className="bg-transparent border border-gray-300 text-gray-700 rounded-[5px] px-3 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-[#F5C518] disabled:opacity-40">
            {validating ? 'Checking...' : '✓ Validate Keywords'}
          </button>
          <button onClick={handleSerpFeatures} disabled={analysingFeatures || !fields.focus_keyphrase}
            className="bg-transparent border border-gray-300 text-gray-700 rounded-[5px] px-3 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-[#F5C518] disabled:opacity-40">
            {analysingFeatures ? 'Loading...' : '🎯 SERP Features'}
          </button>
          <button onClick={handleContentGap} disabled={analysingGap || !fields.focus_keyphrase || !fields.article_content}
            className="bg-transparent border border-gray-300 text-gray-700 rounded-[5px] px-3 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-[#F5C518] disabled:opacity-40">
            {analysingGap ? 'Analysing...' : '📊 Content Gap'}
          </button>
        </div>

        {/* Secondary actions row */}
        <div className="flex flex-wrap gap-2 mb-3">
          <button onClick={handleRankedKeywords} disabled={loadingRanked || !fields.url?.trim()}
            className="bg-transparent border border-gray-300 text-gray-700 rounded-[5px] px-3 py-1.5 text-[10px] font-semibold cursor-pointer hover:border-[#F5C518] disabled:opacity-40">
            {loadingRanked ? 'Loading...' : '📈 Ranked Keywords'}
          </button>
          <button onClick={handleSearchIntent} disabled={loadingIntent || !fields.focus_keyphrase}
            className="bg-transparent border border-gray-300 text-gray-700 rounded-[5px] px-3 py-1.5 text-[10px] font-semibold cursor-pointer hover:border-[#F5C518] disabled:opacity-40">
            {loadingIntent ? 'Loading...' : '🎯 Search Intent'}
          </button>
          <button onClick={handleDAComparison} disabled={loadingDA || !fields.url?.trim() || !fields.focus_keyphrase}
            className="bg-transparent border border-gray-300 text-gray-700 rounded-[5px] px-3 py-1.5 text-[10px] font-semibold cursor-pointer hover:border-[#F5C518] disabled:opacity-40">
            {loadingDA ? 'Loading...' : '⚔️ DA vs Competitors'}
          </button>
          <button onClick={handleExportTemplate} disabled={exporting}
            className="bg-transparent border border-gray-300 text-gray-700 rounded-[5px] px-3 py-1.5 text-[10px] font-semibold cursor-pointer hover:border-[#F5C518] disabled:opacity-40 ml-auto">
            {exporting ? 'Generating...' : '📄 Export .docx'}
          </button>
        </div>

        {/* Keyword validation results */}
        {keywordValidation && keywordValidation.length > 0 && (
          <div className="mt-3 bg-[#f8f8f6] rounded-lg p-3">
            <div className="text-[10px] font-bold uppercase text-gray-500 mb-2">Keyword Validation</div>
            <div className="space-y-1.5">
              {keywordValidation.map((v, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[8px] font-bold ${v.valid ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                    {v.valid ? '✓' : '✗'}
                  </span>
                  <span className="flex-1 text-gray-700 truncate">{v.keyword}</span>
                  <span className="text-gray-500 text-[10px] shrink-0">SV: <b className={v.valid ? 'text-[#1a1a1a]' : 'text-red-500'}>{v.sv.toLocaleString()}</b></span>
                  {v.kd != null && <span className="text-gray-500 text-[10px] shrink-0">KD: <b className={v.kd <= 20 ? 'text-green-600' : v.kd <= 50 ? 'text-orange-500' : 'text-red-500'}>{v.kd}</b></span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live audit results */}
        {auditResult && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="text-[10px] font-bold uppercase text-green-700 mb-2">Live URL Audit Results</div>
            <div className="grid grid-cols-3 gap-2 mb-3 text-[10px]">
              <div className="bg-white rounded p-2">
                <div className="text-gray-400 uppercase font-bold">On-Page Score</div>
                <div className="text-lg font-bold text-[#1a1a1a]">{auditResult.crawl.onpage_score || 0}</div>
              </div>
              <div className="bg-white rounded p-2">
                <div className="text-gray-400 uppercase font-bold">Word Count</div>
                <div className="text-lg font-bold text-[#1a1a1a]">{auditResult.crawl.meta?.content?.plain_text_word_count || 0}</div>
              </div>
              <div className="bg-white rounded p-2">
                <div className="text-gray-400 uppercase font-bold">Links I / E</div>
                <div className="text-lg font-bold text-[#1a1a1a]">{auditResult.crawl.meta?.internal_links_count || 0} / {auditResult.crawl.meta?.external_links_count || 0}</div>
              </div>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {Object.entries(auditResult.mapping.checks).map(([id, passed]) => {
                const item = allItems.find(i => i.id === id);
                return (
                  <div key={id} className="flex items-start gap-1.5 text-[10px]">
                    <span className={passed ? 'text-green-600' : 'text-red-500'}>{passed ? '✓' : '✗'}</span>
                    <div className="flex-1">
                      <div className={passed ? 'text-gray-700' : 'text-gray-500'}>{item?.label || id}</div>
                      {auditResult.mapping.evidence?.[id] && (
                        <div className="text-[9px] text-gray-400">{auditResult.mapping.evidence[id]}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SERP Features — Writer's Playbook */}
        {serpFeatures && (
          <div className="mt-3 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3.5">
            {/* Header */}
            <div className="flex items-start justify-between mb-3 pb-2.5 border-b border-blue-200">
              <div className="min-w-0">
                <div className="text-[9px] font-bold uppercase text-blue-500 tracking-wider">SERP Writer's Playbook</div>
                <div className="text-[12px] font-bold text-[#1a1a1a] truncate">"{fields.focus_keyphrase}"</div>
              </div>
              <button
                onClick={() => setSerpFeatures(null)}
                className="text-[12px] text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer shrink-0 ml-2"
                title="Close"
              >✕</button>
            </div>

            {/* Recommended format banner */}
            <div className="bg-white border-l-4 border-blue-500 rounded p-2.5 mb-3">
              <div className="text-[9px] font-bold uppercase text-blue-600 mb-0.5">🎯 Recommended Content Format</div>
              <div className="text-[11px] text-gray-800 leading-snug">{getRecommendedFormat(serpFeatures)}</div>
            </div>

            {/* Two-column action lists */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
              <div className="bg-white rounded border border-green-200 p-2.5">
                <div className="text-[9px] font-bold uppercase text-green-600 mb-1.5">✓ Must Include</div>
                <ul className="space-y-1 text-[10px]">
                  {getMustIncludeActions(serpFeatures).map((action, i) => (
                    <li key={i} className="text-gray-700 leading-snug flex gap-1.5">
                      <span className="text-green-500 shrink-0">•</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded border border-orange-200 p-2.5">
                <div className="text-[9px] font-bold uppercase text-orange-600 mb-1.5">💡 Consider Adding</div>
                <ul className="space-y-1 text-[10px]">
                  {getConsiderActions(serpFeatures).map((action, i) => (
                    <li key={i} className="text-gray-700 leading-snug flex gap-1.5">
                      <span className="text-orange-500 shrink-0">•</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Featured snippet detail */}
            {serpFeatures.has_featured_snippet && serpFeatures.featured_snippet && (
              <div className="bg-white rounded border border-yellow-300 p-2.5 mb-3">
                <div className="text-[9px] font-bold uppercase text-yellow-600 mb-1">⭐ Featured Snippet — who owns it now</div>
                <div className="text-[11px] font-semibold text-gray-800 leading-snug">{serpFeatures.featured_snippet.title}</div>
                <div className="text-[9px] text-gray-400 mb-1 truncate">{serpFeatures.featured_snippet.domain}</div>
                {serpFeatures.featured_snippet.description && (
                  <div className="text-[10px] text-gray-600 italic bg-[#fffbeb] border border-yellow-100 rounded p-1.5 mt-1 leading-snug">
                    "{serpFeatures.featured_snippet.description}"
                  </div>
                )}
                <div className="text-[9px] text-yellow-700 mt-1.5 font-semibold">
                  → Write your intro in this same format to steal the snippet
                </div>
              </div>
            )}

            {/* PAA questions — copy to clipboard */}
            {serpFeatures.paa_questions?.length > 0 && (
              <div className="bg-white rounded border border-blue-300 p-2.5 mb-3">
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <div className="text-[9px] font-bold uppercase text-blue-600">📝 Add these {serpFeatures.paa_questions.length} questions as FAQ H2s</div>
                  <button
                    onClick={() => {
                      const text = serpFeatures.paa_questions.join('\n');
                      if (navigator.clipboard?.writeText) {
                        navigator.clipboard.writeText(text);
                        toast.success('Copied — paste into your article');
                      } else {
                        toast.error('Clipboard not available');
                      }
                    }}
                    className="text-[9px] font-bold uppercase text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-0.5 cursor-pointer hover:bg-blue-100 shrink-0"
                  >📋 Copy all</button>
                </div>
                <ol className="space-y-1 text-[10px] pl-4 list-decimal marker:text-blue-400">
                  {serpFeatures.paa_questions.map((q, i) => (
                    <li key={i} className="text-gray-700 leading-snug pl-0.5">{q}</li>
                  ))}
                </ol>
              </div>
            )}

            {/* Related searches / long-tail keywords */}
            {flattenRelated(serpFeatures.related_searches).length > 0 && (
              <div className="bg-white rounded border border-purple-200 p-2.5 mb-3">
                <div className="text-[9px] font-bold uppercase text-purple-600 mb-1.5">🔗 Related Keywords — work these into H2s / body copy</div>
                <div className="flex flex-wrap gap-1">
                  {flattenRelated(serpFeatures.related_searches).slice(0, 12).map((rs, i) => (
                    <span key={i} className="text-[10px] bg-purple-50 text-purple-700 border border-purple-100 px-1.5 py-0.5 rounded-full">
                      {rs}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Top 3 competitors */}
            {serpFeatures.top_10?.length > 0 && (
              <div className="bg-white rounded border border-gray-200 p-2.5">
                <div className="text-[9px] font-bold uppercase text-gray-500 mb-1.5">🏆 Top 3 you're competing with</div>
                <div className="space-y-1.5">
                  {serpFeatures.top_10.slice(0, 3).map((t, i) => (
                    <a
                      key={i}
                      href={t.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 text-[10px] no-underline hover:bg-gray-50 rounded px-1 py-0.5 -mx-1"
                    >
                      <span className={`font-bold shrink-0 w-5 ${i === 0 ? 'text-yellow-600' : i === 1 ? 'text-gray-500' : 'text-orange-600'}`}>
                        #{t.rank}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-gray-800 font-semibold truncate">{t.title}</div>
                        <div className="text-gray-400 truncate text-[9px]">{t.domain}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Content Gap Analysis */}
        {gapAnalysis && (
          <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg p-3">
            <div className="text-[10px] font-bold uppercase text-orange-700 mb-2">Content Gap vs Top 5 Rankers</div>
            <div className="grid grid-cols-3 gap-2 mb-3 text-[10px]">
              <div className="bg-white rounded p-2">
                <div className="text-gray-400 uppercase font-bold">Your Words</div>
                <div className="text-sm font-bold text-[#1a1a1a]">{gapAnalysis.yourWordCount.toLocaleString()}</div>
              </div>
              <div className="bg-white rounded p-2">
                <div className="text-gray-400 uppercase font-bold">Avg Top 5</div>
                <div className="text-sm font-bold text-[#1a1a1a]">{gapAnalysis.avgWordCount.toLocaleString()}</div>
              </div>
              <div className="bg-white rounded p-2">
                <div className="text-gray-400 uppercase font-bold">Gap</div>
                <div className={`text-sm font-bold ${gapAnalysis.wordDiff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {gapAnalysis.wordDiff >= 0 ? '+' : ''}{gapAnalysis.wordDiff.toLocaleString()}
                </div>
              </div>
            </div>
            {gapAnalysis.missingH2s?.length > 0 && (
              <div>
                <div className="text-[9px] font-bold uppercase text-orange-600 mb-1">Topics competitors cover that you don't:</div>
                <div className="flex flex-wrap gap-1">
                  {gapAnalysis.missingH2s.map((h, i) => (
                    <span key={i} className="text-[9px] bg-white border border-orange-200 text-gray-700 px-1.5 py-0.5 rounded">{h}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="text-[9px] text-gray-500 mt-2">
              Top rankers: {gapAnalysis.topRankers.map(r => r.domain).join(', ')}
            </div>
          </div>
        )}

        {/* Ranked Keywords */}
        {rankedKeywords && (
          <div className="mt-3 bg-purple-50 border border-purple-200 rounded-lg p-3">
            <div className="text-[10px] font-bold uppercase text-purple-700 mb-2">
              This URL ranks for {rankedKeywords.length} keywords
            </div>
            {rankedKeywords.length === 0 ? (
              <div className="text-[10px] text-gray-500">No ranked keywords found. Page may be too new or not indexed.</div>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {rankedKeywords.slice(0, 20).map((kw, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] bg-white rounded px-2 py-1">
                    <span className={`font-bold shrink-0 w-8 text-center ${kw.rank <= 3 ? 'text-green-600' : kw.rank <= 10 ? 'text-orange-500' : 'text-gray-400'}`}>
                      #{kw.rank}
                    </span>
                    <span className="flex-1 text-gray-700 truncate">{kw.keyword}</span>
                    <span className="text-gray-500 shrink-0">SV: {kw.search_volume.toLocaleString()}</span>
                    {kw.traffic > 0 && <span className="text-gray-500 shrink-0">Traffic: {Math.round(kw.traffic)}/mo</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Search Intent */}
        {intentData && (
          <div className="mt-3 bg-[#f8f8f6] border border-gray-200 rounded-lg p-3">
            <div className="text-[10px] font-bold uppercase text-gray-500 mb-2">Search Intent</div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${intentColors[intentData.main_intent] || 'bg-gray-100 text-gray-600'}`}>
                {intentData.main_intent}
              </span>
              {intentData.secondary_intents?.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {intentData.secondary_intents.map((si, i) => (
                    <span key={i} className="text-[9px] text-gray-500">+ {si}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="text-[10px] text-gray-500 mt-1">
              {intentData.main_intent === 'informational' && '→ Blog post format is correct'}
              {intentData.main_intent === 'commercial' && '→ Consider SEO Page format with service info'}
              {intentData.main_intent === 'transactional' && '→ SEO Page with clear CTA and pricing'}
              {intentData.main_intent === 'navigational' && '→ User is looking for a specific brand/site'}
            </div>
          </div>
        )}

        {/* Domain Authority Comparison */}
        {daData && (
          <div className="mt-3 bg-[#f8f8f6] border border-gray-200 rounded-lg p-3">
            <div className="text-[10px] font-bold uppercase text-gray-500 mb-2">Domain Authority vs Competitors</div>
            {daData.yours ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[11px] bg-[#F5C518]/10 rounded p-2">
                  <span className="font-bold text-[#1a1a1a] flex-1">{daData.yours.domain}</span>
                  <span className="text-[10px] text-gray-500">Rank: <b>{daData.yours.rank}</b></span>
                  <span className="text-[10px] text-gray-500">Backlinks: <b>{daData.yours.backlinks.toLocaleString()}</b></span>
                </div>
                <div className="text-[9px] font-bold uppercase text-gray-400 pt-1">Top Competitors</div>
                {daData.competitors.slice(0, 5).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] px-2">
                    <span className="flex-1 text-gray-700 truncate">{c.domain}</span>
                    <span className="text-[10px] text-gray-500">Rank: <b>{c.rank}</b></span>
                    <span className="text-[10px] text-gray-500">BL: <b>{c.backlinks.toLocaleString()}</b></span>
                  </div>
                ))}
                <div className="text-[10px] text-gray-500 mt-2 pt-2 border-t border-gray-200">
                  {daData.yours.rank >= daData.avgCompRank
                    ? '✓ Your domain authority is on par with competitors'
                    : `⚠ Your rank is ${daData.avgCompRank - daData.yours.rank} below competitor average — ranking may take longer`}
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-gray-500">Could not load domain data</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
