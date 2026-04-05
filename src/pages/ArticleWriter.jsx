import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import toast from 'react-hot-toast';

export default function ArticleWriter() {
  const { clients: dbClients } = useClients();
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [briefs, setBriefs] = useState([]);
  const [selectedBrief, setSelectedBrief] = useState(null);
  const [clientArticles, setClientArticles] = useState([]);
  const [article, setArticle] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [saveTimer, setSaveTimer] = useState(null);
  const [wordTarget, setWordTarget] = useState(1100);
  const [contentType, setContentType] = useState('Blog Post');
  const [readingLevel, setReadingLevel] = useState('grade-7');
  const [customInstructions, setCustomInstructions] = useState('');

  // Load clients
  useEffect(() => {
    const fromDb = dbClients.map(c => c.name);
    supabase.from('content_plans').select('client_name').then(({ data }) => {
      const fromPlans = data ? data.map(d => d.client_name) : [];
      const unique = [...new Set([...fromDb, ...fromPlans])].filter(Boolean).sort();
      setClients(unique);
      if (unique.length && !selectedClient) setSelectedClient(unique[0]);
    });
  }, [dbClients]);

  // Load briefs for selected client
  useEffect(() => {
    if (!selectedClient) { setBriefs([]); return; }
    supabase.from('content_briefs')
      .select('*')
      .eq('client_name', selectedClient)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setBriefs(data || []);
      });
  }, [selectedClient]);

  // Load past articles for writing style
  useEffect(() => {
    if (!selectedClient) { setClientArticles([]); return; }
    const dbClient = dbClients.find(c => c.name === selectedClient);
    if (!dbClient) { setClientArticles([]); return; }
    supabase.from('reports')
      .select('id, name, article_title, article_content')
      .eq('client_id', dbClient.id)
      .order('updated_at', { ascending: false })
      .limit(5)
      .then(({ data }) => setClientArticles(data || []));
  }, [selectedClient, dbClients]);

  // Load saved draft when selecting a brief
  useEffect(() => {
    if (selectedBrief?.draft_article) {
      setArticle(selectedBrief.draft_article);
      setLastSaved(new Date());
    } else {
      setArticle('');
      setLastSaved(null);
    }
  }, [selectedBrief?.id]);

  // Auto-save draft with debounce
  const saveDraft = async (text) => {
    if (!selectedBrief?.id || !text) return;
    setSaving(true);
    await supabase.from('content_briefs')
      .update({ draft_article: text })
      .eq('id', selectedBrief.id);
    setSaving(false);
    setLastSaved(new Date());
  };

  const handleArticleChange = (newText) => {
    setArticle(newText);
    // Debounce auto-save: save 2 seconds after user stops typing
    if (saveTimer) clearTimeout(saveTimer);
    const timer = setTimeout(() => saveDraft(newText), 2000);
    setSaveTimer(timer);
  };

  const handleGenerate = async () => {
    if (!selectedBrief) return toast.error('Select a brief first.');
    setGenerating(true);
    setArticle('');

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) { toast.error('API key not set'); setGenerating(false); return; }

    const brief = selectedBrief.brief_json;

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

    const prompt = `You are an expert SEO content writer for an Australian digital marketing agency.
Write a complete, publish-ready ${contentType === 'SEO Page' ? 'SEO landing page' : 'blog article'} based on the brief below.

CLIENT: ${selectedClient}
CONTENT TYPE: ${contentType}
TARGET WORD COUNT: ${wordTarget} words

BRIEF:
Title: ${selectedBrief.title}
Focus Keyword: ${selectedBrief.focus_keyword}
${brief.seo_title ? `SEO Title: ${brief.seo_title}` : ''}
${brief.secondary_keywords?.length ? `Secondary Keywords: ${brief.secondary_keywords.join(', ')}` : ''}
${brief.meta_description ? `Meta Description: ${brief.meta_description}` : ''}
${brief.suggested_h1 ? `H1: ${brief.suggested_h1}` : ''}

H2 STRUCTURE:
${brief.h2_structure?.map(h => `${h.h2}\n  Cover: ${h.description}`).join('\n') || 'Use appropriate H2s'}

FAQ SECTION (include with full answers):
${brief.faq_section?.map(f => `Q: ${f.question}\n  Guidance: ${f.guidance}`).join('\n') || 'Include 3-5 relevant FAQs'}

CTA: ${brief.cta_recommendation || 'Include CTA buttons at top and bottom'}
CTA LINK: ${brief.cta_links?.[0] || ''}

INTERNAL LINKS TO INCLUDE:
${brief.internal_links?.map(l => `- ${l.page}${l.url ? ` (${l.url})` : ''}`).join('\n') || 'Include 2-3 internal links'}

${styleSamples ? `
WRITING STYLE REFERENCE — Match this client's writing style closely (tone, sentence structure, vocabulary, paragraph length):

${styleSamples}

END OF STYLE REFERENCE
` : ''}

${customInstructions ? `ADDITIONAL INSTRUCTIONS:\n${customInstructions}\n` : ''}

FORMATTING RULES:
- Write the full article in plain text (no markdown)
- Start with the H1 heading on its own line
- Include "Table of Contents" section after intro
- Each H2 heading on its own line, followed by 2-4 paragraphs
- Include [CTA Button: Book an Appraisal | Link: ${brief.cta_links?.[0] || ''}] after the intro and at the end
- Include internal links as [Internal Link: Page Name | URL]
- Include at least 1 external authority link (ABS, government source, or industry body)
- Include the FAQ section with Q: and A: format
- Focus keyword density of 1-2%
- Use all secondary keywords naturally throughout
- ${readingInstructions[readingLevel] || readingInstructions['grade-7']}
- Short paragraphs (2-4 sentences max)
- ${wordTarget}+ words total
- DO NOT include any meta information, just the article body content`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const msg = await res.json();
      const generatedText = msg.content[0].text;
      setArticle(generatedText);
      // Auto-save to brief record
      if (selectedBrief?.id) {
        await supabase.from('content_briefs')
          .update({ draft_article: generatedText })
          .eq('id', selectedBrief.id);
        setLastSaved(new Date());
        // Update local state so brief shows it has a draft
        setBriefs(prev => prev.map(b => b.id === selectedBrief.id ? { ...b, draft_article: generatedText } : b));
      }
      toast.success('Article generated and saved!');
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
    setGenerating(false);
  };

  const wordCount = article ? article.split(/\s+/).length : 0;
  const styleCount = clientArticles.filter(a => a.article_content?.length > 100).length;

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
                  <select value={selectedClient} onChange={e => { setSelectedClient(e.target.value); setSelectedBrief(null); setArticle(''); }} className="input-field">
                    {clients.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <Label>Brief to write from</Label>
                  {briefs.length === 0 ? (
                    <div className="text-[11px] text-gray-400 bg-[#f8f8f6] rounded-lg p-3">
                      No briefs found for {selectedClient}. Generate one in the Brief Generator first.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {briefs.map(b => (
                        <div
                          key={b.id}
                          onClick={() => setSelectedBrief(b)}
                          className={`rounded-lg p-2.5 cursor-pointer border transition-colors ${
                            selectedBrief?.id === b.id
                              ? 'border-[#F5C518] bg-[#F5C518]/5'
                              : 'border-gray-200 hover:border-[#F5C518]/50'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <div className="text-[11px] font-medium text-[#1a1a1a] truncate flex-1">{b.title}</div>
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
                  {generating ? 'Writing article...' : 'Write Article'}
                </button>
              </div>
            </div>

            {/* Brief preview */}
            {selectedBrief?.brief_json && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Brief Preview</h3>
                <div className="text-[11px] text-gray-700 space-y-1.5">
                  {selectedBrief.brief_json.suggested_h1 && (
                    <div><span className="text-gray-400">H1:</span> {selectedBrief.brief_json.suggested_h1}</div>
                  )}
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
                <p className="text-sm font-medium">Writing article...</p>
                <p className="text-[11px] text-gray-400 mt-1">This may take 30-90 seconds for a full article</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-[#1a1a1a]">{selectedBrief?.title}</h2>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {wordCount.toLocaleString()} words · {selectedClient}
                      {styleCount > 0 && ' · Style matched'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { navigator.clipboard.writeText(article); toast.success('Article copied!'); }}
                      className="btn-secondary text-[10px]"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => {
                        const blob = new Blob([article], { type: 'text/plain' });
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
                      onClick={() => { saveDraft(article); toast.success('Draft saved!'); }}
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
                    <span className="text-gray-400">Word Count</span>
                    <span className={wordCount >= wordTarget ? 'text-green-600 font-semibold' : 'text-orange-500 font-semibold'}>
                      {wordCount.toLocaleString()} / {Number(wordTarget).toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min((wordCount / wordTarget) * 100, 100)}%`,
                        backgroundColor: wordCount >= wordTarget ? '#27ae60' : '#e67e22',
                      }}
                    />
                  </div>
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
    </div>
  );
}

function Label({ children }) {
  return <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{children}</label>;
}
