import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import toast from 'react-hot-toast';

const BRIEF_PROMPT = ({ client, contentType, isRefresh, title, focusKeyword, secondaryKeywords, existingUrl, wordCount, context, ctaUrl, styleSamples }) => `You are an SEO content strategist working for a digital marketing agency in Australia.
Your job is to write structured content briefs for blog posts and SEO pages.
Always write for Australian audiences. Use plain English at a Grade 6 reading level.
Avoid jargon. Format your output as valid JSON. Never pad content. Be specific and practical.

Generate a full content brief for:
Client: ${client}
Content Type: ${contentType}
New or Refresh: ${isRefresh ? 'REFRESH' : 'NEW'}
Article Title: ${title}
Focus Keyword: ${focusKeyword}
Secondary Keywords: ${secondaryKeywords || 'generate 3-4 related long-tail variations'}
${existingUrl ? `Existing URL: ${existingUrl}` : ''}
${ctaUrl ? `CTA Link: ${ctaUrl}` : ''}
Target Word Count: ${wordCount}
${context ? `Additional Context: ${context}` : ''}
${styleSamples ? `
WRITING STYLE REFERENCE — Below are excerpts from previous articles written for this client. Match this writing style, tone, sentence structure, and vocabulary level closely:

${styleSamples}

END OF STYLE REFERENCE — Use the above as a guide for tone, structure, and vocabulary when generating the brief and any content suggestions.
` : ''}
Return this exact JSON structure:
{
  "seo_title": "SEO-optimised page title under 60 chars including the focus keyword | Client Name",
  "content_type_label": "${isRefresh ? 'BLOG - REFRESH' : 'BLOG - NEW'}",
  "secondary_keywords": ["long tail keyword 1", "long tail keyword 2", "long tail keyword 3"],
  "keyword_notes": "Brief note on keyword density target (1-2%) and usage guidance",
  "meta_description": "Compelling meta description under 155 characters including the focus keyword",
  "suggested_slug": "https://example.com/suggested-url-slug/",
  "needs_redirect": ${isRefresh},
  "cta_links": ["${ctaUrl || 'https://clientsite.com/contact/'}"],
  "overview": "2-3 sentence summary of article goal, target audience, and search intent",
  "suggested_h1": "One recommended H1 containing the focus keyword",
  "h2_structure": [
    {"h2": "Heading text containing keyword variation", "description": "One-line description of what each section should cover"}
  ],
  "faq_section": [
    {"question": "Question targeting People Also Ask?", "guidance": "Brief note on how to answer for featured snippet"}
  ],
  "internal_links": [
    {"page": "Page title or description", "url": "suggested URL path", "reason": "Why to link here"}
  ],
  "cta_recommendation": "Suggested CTA button text and placement (top and bottom of article)",
  "social_posts": {
    "facebook": "Full Facebook post copy with emoji, CTA link, and 5-7 hashtags",
    "instagram": "Full Instagram post copy with CTA to link in bio and 5-7 hashtags"
  },
  "seo_checklist": [
    "FK in H1",
    "FK in first 100 words",
    "FK in at least one H2",
    "Keyword density 1-2%",
    "All secondary keywords used in body",
    "Meta description under 155 chars with FK",
    "URL slug includes FK words",
    "Table of Contents with jump links",
    "FAQ section with 3+ questions",
    "At least 2 internal links",
    "At least 1 external authority link",
    "CTA button at top and bottom",
    "FAQ schema markup added",
    "Author bio present",
    "Images compressed, WebP format, alt text with FK",
    "Word count meets target of ${wordCount}"
  ]
}`;

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2 pb-1 border-b border-gray-100">{title}</h3>
      {children}
    </div>
  );
}

export default function BriefGenerator() {
  const { clients: dbClients } = useClients();
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({
    client: '', contentType: 'Blog Post', isRefresh: false,
    title: '', focusKeyword: '', secondaryKeywords: '',
    existingUrl: '', ctaUrl: '',
    wordCount: 1100, context: '',
  });
  const [brief, setBrief] = useState(null);
  const [draftArticle, setDraftArticle] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState([]);
  const [clientPlans, setClientPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [clientArticles, setClientArticles] = useState([]);
  const [styleLoaded, setStyleLoaded] = useState(false);

  useEffect(() => {
    const fromDb = dbClients.map(c => c.name);
    supabase.from('content_plans').select('client_name').then(({ data }) => {
      const fromPlans = data ? data.map(d => d.client_name) : [];
      const unique = [...new Set([...fromDb, ...fromPlans])].filter(Boolean).sort();
      setClients(unique);
      if (unique.length && !form.client) setForm(f => ({ ...f, client: unique[0] }));
    });
    supabase.from('content_briefs').select('id, client_name, title, focus_keyword, created_at')
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => setHistory(data || []));
  }, [dbClients]);

  // Load past articles for writing style reference
  useEffect(() => {
    if (!form.client) { setClientArticles([]); setStyleLoaded(false); return; }
    const dbClient = dbClients.find(c => c.name === form.client);
    if (!dbClient) { setClientArticles([]); setStyleLoaded(false); return; }
    supabase.from('reports')
      .select('id, name, article_title, article_content, focus_keyphrase')
      .eq('client_id', dbClient.id)
      .order('updated_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setClientArticles(data || []);
        setStyleLoaded(true);
      });
  }, [form.client, dbClients]);

  useEffect(() => {
    if (!form.client) { setClientPlans([]); return; }
    supabase.from('content_plans').select('id, title, focus_keyword, status')
      .eq('client_name', form.client).order('created_at', { ascending: false })
      .then(({ data }) => setClientPlans(data || []));
  }, [form.client]);

  const handleGenerate = async () => {
    if (!form.title || !form.focusKeyword) return toast.error('Title and Focus Keyword are required.');
    setGenerating(true);
    setBrief(null);
    setSaved(false);

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) { toast.error('VITE_ANTHROPIC_API_KEY not set'); setGenerating(false); return; }

    // Build writing style samples from past articles (first 500 chars each, up to 3)
    let styleSamples = '';
    if (clientArticles.length > 0) {
      const samples = clientArticles
        .filter(a => a.article_content && a.article_content.length > 100)
        .slice(0, 3)
        .map((a, i) => `--- Article ${i + 1}: "${a.article_title || a.name}" ---\n${a.article_content.substring(0, 800)}`)
        .join('\n\n');
      if (samples) styleSamples = samples;
    }

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
          max_tokens: 2500,
          system: 'You are an SEO content strategist. Return ONLY valid JSON with no markdown fences.',
          messages: [{ role: 'user', content: BRIEF_PROMPT({ ...form, styleSamples }) }],
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const msg = await res.json();
      const parsed = JSON.parse(msg.content[0].text);
      setBrief(parsed);
      toast.success('Brief generated!');
    } catch (err) {
      toast.error('Error generating brief: ' + err.message);
    }
    setGenerating(false);
  };

  const handleSave = async () => {
    if (!brief) return;

    let planId = selectedPlanId;

    // If no plan linked, create one in content_plans automatically
    if (!planId) {
      const currentQ = `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`;
      const { data: newPlan, error: planError } = await supabase.from('content_plans').insert({
        client_name: form.client,
        quarter: currentQ,
        content_type: form.contentType === 'SEO Page' ? 'SEO Page' : 'Blog',
        title: form.title,
        is_refresh: form.isRefresh,
        focus_keyword: form.focusKeyword,
        status: 'Briefed',
        notes: 'Auto-created from Brief Generator',
      }).select().single();

      if (!planError && newPlan) {
        planId = newPlan.id;
        toast.success('Added to Content Planner');
      }
    } else {
      // Update existing plan status to Briefed
      await supabase.from('content_plans').update({ status: 'Briefed', updated_at: new Date().toISOString() }).eq('id', planId);
    }

    // Save the brief
    const payload = {
      client_name: form.client, title: form.title,
      focus_keyword: form.focusKeyword, brief_json: brief,
    };
    if (planId) payload.plan_id = planId;
    const { error } = await supabase.from('content_briefs').insert(payload);

    if (!error) {
      setSaved(true);
      toast.success('Brief saved!');
      supabase.from('content_briefs').select('id, client_name, title, focus_keyword, created_at')
        .order('created_at', { ascending: false }).limit(10)
        .then(({ data }) => setHistory(data || []));
    } else {
      toast.error('Error saving brief');
    }
  };

  const handleLoadBrief = async (id) => {
    const { data } = await supabase.from('content_briefs').select('*').eq('id', id).single();
    if (data) {
      setBrief(data.brief_json);
      setForm(f => ({ ...f, client: data.client_name || f.client, title: data.title || '', focusKeyword: data.focus_keyword || '' }));
    }
  };

  const handleGenerateDraft = async () => {
    if (!brief) return toast.error('Generate a brief first.');
    setGeneratingDraft(true);
    setDraftArticle('');

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) { toast.error('API key not set'); setGeneratingDraft(false); return; }

    let styleSamples = '';
    if (clientArticles.length > 0) {
      const samples = clientArticles
        .filter(a => a.article_content && a.article_content.length > 100)
        .slice(0, 3)
        .map((a, i) => `--- Article ${i + 1}: "${a.article_title || a.name}" ---\n${a.article_content.substring(0, 1200)}`)
        .join('\n\n');
      if (samples) styleSamples = samples;
    }

    const draftPrompt = `You are an SEO content writer for an Australian digital marketing agency.
Write a full blog article based on the brief below. Match the writing style of the client's previous articles.

BRIEF:
Title: ${form.title}
H1: ${brief.suggested_h1}
Focus Keyword: ${form.focusKeyword}
Secondary Keywords: ${brief.secondary_keywords?.join(', ')}
Target Word Count: ${form.wordCount}
H2 Structure:
${brief.h2_structure?.map(h => `- ${h.h2}: ${h.description}`).join('\n')}
FAQ Section:
${brief.faq_section?.map(f => `Q: ${f.question}`).join('\n')}
CTA: ${brief.cta_recommendation}
CTA Link: ${form.ctaUrl || brief.cta_links?.[0] || ''}

${styleSamples ? `WRITING STYLE REFERENCE (match this tone, sentence length, vocabulary level):
${styleSamples}
END OF STYLE REFERENCE` : ''}

RULES:
- Write for Australian audiences in plain English
- Include the focus keyword naturally at 1-2% density
- Include all secondary keywords naturally
- Use the H2 structure provided
- Include a Table of Contents at the top
- Include the FAQ section with full answers
- Include [CTA Button: Book an Appraisal | Link: ${form.ctaUrl || ''}] after the intro and at the end
- Include at least 2 internal link placeholders marked as [Internal Link: description]
- Include at least 1 external authority link
- Write ${form.wordCount}+ words
- DO NOT use markdown formatting — write in plain text with headings on their own lines`;

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
          max_tokens: 4096,
          messages: [{ role: 'user', content: draftPrompt }],
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const msg = await res.json();
      setDraftArticle(msg.content[0].text);
      toast.success('Draft article generated!');
    } catch (err) {
      toast.error('Error generating draft: ' + err.message);
    }
    setGeneratingDraft(false);
  };

  const handleCopy = () => {
    if (!brief) return;
    let text = `${form.client} - ${form.contentType} - ${form.isRefresh ? 'REFRESH' : 'NEW'}: ${form.title}\n`;
    text += `${'='.repeat(50)}\n\n`;
    text += `Content Type: ${brief.content_type_label || (form.isRefresh ? 'BLOG - REFRESH' : 'BLOG - NEW')}\n\n`;
    text += `SEO Title\n${brief.seo_title}\n\n`;
    text += `Keywords List\n${brief.secondary_keywords?.join('\n')}\n\n`;
    text += `Main Keywords / Focus Keyphrase\n${form.focusKeyword}\n`;
    if (brief.keyword_notes) text += `${brief.keyword_notes}\n`;
    text += `\nMeta Description\n${brief.meta_description}\n\n`;
    text += `Slug URL\n${brief.suggested_slug}\n`;
    if (brief.needs_redirect) text += `Redirect needed: Yes\n`;
    text += `\nCTA Links\n${brief.cta_links?.join('\n')}\n\n`;
    text += `${'─'.repeat(40)}\n\nOVERVIEW\n${brief.overview}\n\n`;
    text += `SUGGESTED H1\n${brief.suggested_h1}\n\n`;
    text += `H2 STRUCTURE\n${brief.h2_structure?.map(h => `${h.h2}\n  ${h.description}`).join('\n\n')}\n\n`;
    text += `FAQ SECTION\n${brief.faq_section?.map(f => `Q: ${f.question}\n  ${f.guidance}`).join('\n\n')}\n\n`;
    text += `INTERNAL LINKS\n${brief.internal_links?.map(l => `- ${l.page}${l.url ? ` (${l.url})` : ''}: ${l.reason}`).join('\n')}\n\n`;
    text += `CTA RECOMMENDATION\n${brief.cta_recommendation}\n\n`;
    text += `${'─'.repeat(40)}\n\nSOCIAL POST TEXT\n\nFACEBOOK\n${brief.social_posts?.facebook || ''}\n\nINSTAGRAM\n${brief.social_posts?.instagram || ''}\n\n`;
    text += `${'─'.repeat(40)}\n\nSEO CHECKLIST\n${brief.seo_checklist?.map(c => `[ ] ${c}`).join('\n')}\n`;
    navigator.clipboard.writeText(text);
    toast.success('Brief copied to clipboard!');
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold text-[#1a1a1a]">Content Brief Generator</h1>
            <p className="text-[11px] text-gray-400">AI-powered structured briefs matching the CYL template</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          {/* Left: Input form + History */}
          <div className="flex flex-col gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold mb-3">Brief Input</h2>
              <div className="space-y-3">
                <div>
                  <Label>Client</Label>
                  <select value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} className="input-field">
                    {clients.map(c => <option key={c}>{c}</option>)}
                    <option value="">Other</option>
                  </select>
                </div>
                {clientPlans.length > 0 && (
                  <div>
                    <Label>Link to Content Plan (optional)</Label>
                    <select value={selectedPlanId} onChange={e => {
                      setSelectedPlanId(e.target.value);
                      const plan = clientPlans.find(p => p.id === e.target.value);
                      if (plan) setForm(f => ({ ...f, title: plan.title || f.title, focusKeyword: plan.focus_keyword || f.focusKeyword }));
                    }} className="input-field">
                      <option value="">— No link —</option>
                      {clientPlans.map(p => <option key={p.id} value={p.id}>[{p.status}] {p.title}</option>)}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Content Type</Label>
                    <select value={form.contentType} onChange={e => setForm(f => ({ ...f, contentType: e.target.value, wordCount: e.target.value === 'Blog Post' ? 1100 : 800 }))} className="input-field">
                      <option>Blog Post</option><option>SEO Page</option>
                    </select>
                  </div>
                  <div>
                    <Label>Target Words</Label>
                    <input type="number" value={form.wordCount} onChange={e => setForm(f => ({ ...f, wordCount: e.target.value }))} className="input-field" />
                  </div>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                  <input type="checkbox" checked={form.isRefresh} onChange={e => setForm(f => ({ ...f, isRefresh: e.target.checked }))} className="accent-[#F5C518]" />
                  This is a REFRESH / UPDATE (not new)
                </label>
                <div><Label>Article Title</Label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Real Estate West End: 6 Facts..." className="input-field" /></div>
                <div><Label>Focus Keyword</Label><input value={form.focusKeyword} onChange={e => setForm(f => ({ ...f, focusKeyword: e.target.value }))} placeholder="e.g. real estate west end" className="input-field" /></div>
                <div><Label>Secondary Keywords (comma-separated)</Label><input value={form.secondaryKeywords} onChange={e => setForm(f => ({ ...f, secondaryKeywords: e.target.value }))} placeholder="e.g. real estate west end qld, west end real estate" className="input-field" /></div>
                {form.isRefresh && (
                  <div><Label>Existing URL</Label><input value={form.existingUrl} onChange={e => setForm(f => ({ ...f, existingUrl: e.target.value }))} placeholder="https://..." className="input-field" /></div>
                )}
                <div><Label>CTA Link URL</Label><input value={form.ctaUrl} onChange={e => setForm(f => ({ ...f, ctaUrl: e.target.value }))} placeholder="e.g. https://lukeokelly.com.au/contact/" className="input-field" /></div>
                <div><Label>Additional Context (optional)</Label><textarea value={form.context} onChange={e => setForm(f => ({ ...f, context: e.target.value }))} rows={2} placeholder="Tone, audience, special notes..." className="input-field resize-y" /></div>
                {/* Style reference status */}
                {styleLoaded && (
                  <div className={`rounded-lg px-3 py-2 text-[10px] ${
                    clientArticles.filter(a => a.article_content?.length > 100).length > 0
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-gray-50 border border-gray-200 text-gray-500'
                  }`}>
                    {clientArticles.filter(a => a.article_content?.length > 100).length > 0
                      ? `✓ ${clientArticles.filter(a => a.article_content?.length > 100).length} past articles loaded — AI will match ${form.client}'s writing style`
                      : `No past articles found for ${form.client}. Upload articles in SEO Checker to enable style matching.`
                    }
                  </div>
                )}
                <button onClick={handleGenerate} disabled={generating} className="btn-primary w-full py-2.5">
                  {generating ? 'Generating brief...' : 'Generate Brief'}
                </button>
              </div>
            </div>

            {history.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Recent Briefs</h3>
                {history.map(h => (
                  <div key={h.id} onClick={() => handleLoadBrief(h.id)} className="py-1.5 border-b border-gray-100 last:border-0 cursor-pointer hover:text-[#F5C518] text-[11px]">
                    <div className="font-medium text-gray-700 truncate">{h.title}</div>
                    <div className="text-[9px] text-gray-400">{h.client_name} · {new Date(h.created_at).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Brief output */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            {!brief && !generating ? (
              <div className="flex flex-col items-center justify-center h-64 text-center text-gray-400">
                <div className="text-3xl mb-2 opacity-30">📝</div>
                <p className="text-sm">Fill in the form and click Generate Brief</p>
                <p className="text-[11px] mt-1">The AI will create a structured brief matching your CYL template.</p>
              </div>
            ) : generating ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <div className="w-6 h-6 border-2 border-gray-200 border-t-[#F5C518] rounded-full animate-spin mb-3" />
                <p className="text-sm">Generating brief...</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold">Generated Brief</h2>
                  <div className="flex gap-2">
                    <button onClick={handleCopy} className="btn-secondary text-[10px]">Copy</button>
                    <button onClick={handleSave} disabled={saved} className="btn-primary text-[10px]">
                      {saved ? 'Saved!' : 'Save Brief'}
                    </button>
                  </div>
                </div>

                {/* Writing style indicator */}
                {clientArticles.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4 text-[11px] text-green-700 flex items-center gap-2">
                    <span className="text-green-600">✓</span>
                    Writing style matched from {clientArticles.filter(a => a.article_content?.length > 100).length} past article{clientArticles.filter(a => a.article_content?.length > 100).length !== 1 ? 's' : ''} for {form.client}
                  </div>
                )}

                {/* Header card */}
                <div className="bg-[#1a1a1a] rounded-lg p-4 mb-5 text-white">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#F5C518] mb-1">
                    {brief.content_type_label || (form.isRefresh ? 'BLOG - REFRESH' : 'BLOG - NEW')}
                  </div>
                  <div className="text-[15px] font-semibold">{form.title}</div>
                  <div className="text-[11px] text-white/50 mt-1">Client: {form.client}</div>
                </div>

                <Section title="SEO Title">
                  <p className="text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f6] rounded-lg p-3">{brief.seo_title}</p>
                </Section>

                <Section title="Keywords">
                  <div className="mb-2">
                    <div className="text-[10px] text-gray-400 mb-1">Focus Keyphrase</div>
                    <span className="text-[11px] bg-[#F5C518]/20 text-[#1a1a1a] px-2.5 py-1 rounded-full font-semibold">{form.focusKeyword}</span>
                  </div>
                  <div className="mb-2">
                    <div className="text-[10px] text-gray-400 mb-1">Secondary Keywords</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(brief.secondary_keywords || []).map((kw, i) => (
                        <span key={i} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{kw}</span>
                      ))}
                    </div>
                  </div>
                  {brief.keyword_notes && (
                    <div className="text-[10px] text-gray-500 bg-[#f8f8f6] rounded p-2 leading-relaxed">{brief.keyword_notes}</div>
                  )}
                </Section>

                <Section title="Meta Description">
                  <p className="text-[12px] text-gray-700 bg-[#f8f8f6] rounded-lg p-3 leading-relaxed">{brief.meta_description}</p>
                  <div className="text-[10px] text-gray-400 mt-1">{brief.meta_description?.length || 0} / 155 chars</div>
                </Section>

                <Section title="Slug URL">
                  <p className="text-[12px] text-blue-600 bg-[#f8f8f6] rounded-lg p-3 font-mono">{brief.suggested_slug}</p>
                  {brief.needs_redirect && <div className="text-[10px] text-orange-500 mt-1">Redirect from old URL may be needed</div>}
                </Section>

                <Section title="Overview">
                  <p className="text-[12px] text-gray-700 leading-relaxed">{brief.overview}</p>
                </Section>

                <Section title="Suggested H1">
                  <p className="text-[13px] font-semibold text-[#1a1a1a]">{brief.suggested_h1}</p>
                </Section>

                <Section title="H2 Structure">
                  <div className="space-y-2">
                    {brief.h2_structure?.map((h, i) => (
                      <div key={i} className="border-l-2 border-[#F5C518] pl-3">
                        <div className="text-[12px] font-semibold text-[#1a1a1a]">{h.h2}</div>
                        <div className="text-[11px] text-gray-500">{h.description}</div>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="FAQ Section">
                  {brief.faq_section?.map((faq, i) => (
                    <div key={i} className="mb-2 bg-[#f8f8f6] rounded-lg p-3">
                      <div className="text-[12px] font-semibold text-[#1a1a1a] mb-0.5">Q: {faq.question}</div>
                      <div className="text-[11px] text-gray-500">{faq.guidance}</div>
                    </div>
                  ))}
                </Section>

                <Section title="CTA Links">
                  <p className="text-[12px] text-gray-700 leading-relaxed bg-[#F5C518]/10 rounded-lg p-3">{brief.cta_recommendation}</p>
                  {brief.cta_links?.map((link, i) => (
                    <div key={i} className="text-[11px] text-blue-600 mt-1 font-mono">{link}</div>
                  ))}
                </Section>

                <Section title="Internal Link Suggestions">
                  {brief.internal_links?.map((link, i) => (
                    <div key={i} className="flex items-start gap-2 mb-1.5 text-[11px]">
                      <span className="text-[#F5C518] shrink-0 mt-0.5">→</span>
                      <div>
                        <b className="text-gray-700">{link.page}</b>
                        {link.url && <span className="text-blue-500 ml-1 font-mono text-[10px]">{link.url}</span>}
                        <span className="text-gray-400"> — {link.reason}</span>
                      </div>
                    </div>
                  ))}
                </Section>

                <Section title="Social Post Text">
                  {brief.social_posts?.facebook && (
                    <div className="mb-3">
                      <div className="text-[10px] font-semibold text-[#1877F2] mb-1">FACEBOOK</div>
                      <div className="text-[11px] text-gray-700 bg-[#f8f8f6] rounded-lg p-3 leading-relaxed whitespace-pre-wrap">{brief.social_posts.facebook}</div>
                    </div>
                  )}
                  {brief.social_posts?.instagram && (
                    <div>
                      <div className="text-[10px] font-semibold text-[#E4405F] mb-1">INSTAGRAM</div>
                      <div className="text-[11px] text-gray-700 bg-[#f8f8f6] rounded-lg p-3 leading-relaxed whitespace-pre-wrap">{brief.social_posts.instagram}</div>
                    </div>
                  )}
                </Section>

                <Section title="On-Page SEO Checklist">
                  <div className="space-y-1">
                    {brief.seo_checklist?.map((item, i) => (
                      <label key={i} className="flex items-center gap-2 text-[11px] cursor-pointer">
                        <input type="checkbox" className="accent-[#F5C518]" />
                        <span className="text-gray-700">{item}</span>
                      </label>
                    ))}
                  </div>
                </Section>

                {/* Generate Draft Article */}
                <div className="border-t border-gray-200 pt-5 mt-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-[#1a1a1a]">Draft Article</h3>
                      <p className="text-[10px] text-gray-400">
                        AI writes a full article based on this brief
                        {clientArticles.length > 0 ? `, matched to ${form.client}'s writing style` : ''}
                      </p>
                    </div>
                    <button
                      onClick={handleGenerateDraft}
                      disabled={generatingDraft}
                      className="btn-primary text-[11px] flex items-center gap-1.5"
                    >
                      {generatingDraft ? 'Writing...' : 'Generate Draft'}
                    </button>
                  </div>

                  {generatingDraft && (
                    <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
                      <div className="w-5 h-5 border-2 border-gray-200 border-t-[#F5C518] rounded-full animate-spin" />
                      <span className="text-[12px]">Writing article draft — this may take 30-60 seconds...</span>
                    </div>
                  )}

                  {draftArticle && (
                    <div>
                      <div className="flex gap-2 mb-2">
                        <button
                          onClick={() => { navigator.clipboard.writeText(draftArticle); toast.success('Draft copied!'); }}
                          className="btn-secondary text-[10px]"
                        >
                          Copy Draft
                        </button>
                        <button
                          onClick={() => {
                            const blob = new Blob([draftArticle], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `Draft-${(form.title || 'Article').replace(/[^a-zA-Z0-9]/g, '-').substring(0, 40)}.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="btn-secondary text-[10px]"
                        >
                          Download .txt
                        </button>
                      </div>
                      <div className="bg-[#f8f8f6] border border-gray-200 rounded-lg p-4 max-h-[600px] overflow-y-auto">
                        <pre className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-wrap font-sans">{draftArticle}</pre>
                      </div>
                      <div className="text-[10px] text-gray-400 mt-2">
                        Word count: ~{draftArticle.split(/\s+/).length.toLocaleString()} words
                      </div>
                    </div>
                  )}
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
