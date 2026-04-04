import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';

const BRIEF_PROMPT = ({ client, contentType, isRefresh, title, focusKeyword, existingUrl, wordCount, context }) => `You are an SEO content strategist working for a digital marketing agency in Australia.
Your job is to write structured content briefs for blog posts and SEO pages.
Always write for Australian audiences. Use plain English at a Grade 6 reading level.
Avoid jargon. Format your output as valid JSON. Never pad content. Be specific and practical.

Generate a content brief for:
Client: ${client}
Content Type: ${contentType}
New or Refresh: ${isRefresh ? 'REFRESH' : 'NEW'}
Article Title: ${title}
Focus Keyword: ${focusKeyword}
${existingUrl ? `Existing URL: ${existingUrl}` : ''}
Target Word Count: ${wordCount}
${context ? `Additional Context: ${context}` : ''}

Return this exact JSON structure:
{
  "overview": "2-3 sentence summary of article goal, target audience, and search intent",
  "lsi_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6"],
  "suggested_h1": "One recommended H1",
  "h2_structure": [
    {"h2": "Heading text", "description": "One-line description of what this section should cover"}
  ],
  "faq_section": [
    {"question": "Question text?", "guidance": "Brief note on how to answer"}
  ],
  "internal_links": [
    {"page": "Page description", "reason": "Why to link here"}
  ],
  "cta_recommendation": "Suggested call-to-action text and placement",
  "seo_checklist": [
    "FK in H1",
    "FK in first 100 words",
    "FK in at least one H2",
    "Meta description written (under 155 chars)",
    "At least 2 internal links",
    "FAQ schema added",
    "Author bio present",
    "Images compressed and alt text added",
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
    title: '', focusKeyword: '', existingUrl: '',
    wordCount: 1100, context: '',
  });
  const [brief, setBrief] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    // Merge clients from shared clients table + content_plans
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

  const handleGenerate = async () => {
    if (!form.title || !form.focusKeyword) return alert('Title and Focus Keyword are required.');
    setGenerating(true);
    setBrief(null);
    setSaved(false);

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) { alert('VITE_ANTHROPIC_API_KEY not set'); setGenerating(false); return; }

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
          max_tokens: 2000,
          system: 'You are an SEO content strategist. Return ONLY valid JSON.',
          messages: [{ role: 'user', content: BRIEF_PROMPT(form) }],
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const msg = await res.json();
      const parsed = JSON.parse(msg.content[0].text);
      setBrief(parsed);
    } catch (err) {
      alert('Error generating brief: ' + err.message);
    }
    setGenerating(false);
  };

  const handleSave = async () => {
    if (!brief) return;
    const { error } = await supabase.from('content_briefs').insert({
      client_name: form.client, title: form.title,
      focus_keyword: form.focusKeyword, brief_json: brief,
    });
    if (!error) {
      setSaved(true);
      supabase.from('content_briefs').select('id, client_name, title, focus_keyword, created_at')
        .order('created_at', { ascending: false }).limit(10)
        .then(({ data }) => setHistory(data || []));
    }
  };

  const handleLoadBrief = async (id) => {
    const { data } = await supabase.from('content_briefs').select('*').eq('id', id).single();
    if (data) {
      setBrief(data.brief_json);
      setForm(f => ({ ...f, client: data.client_name || f.client, title: data.title || '', focusKeyword: data.focus_keyword || '' }));
    }
  };

  const handleCopy = () => {
    if (!brief) return;
    let text = `CONTENT BRIEF\n${'='.repeat(40)}\nTitle: ${form.title}\nFK: ${form.focusKeyword}\nClient: ${form.client}\nType: ${form.contentType}\n\n`;
    text += `OVERVIEW\n${brief.overview}\n\n`;
    text += `SUGGESTED H1\n${brief.suggested_h1}\n\n`;
    text += `LSI KEYWORDS\n${brief.lsi_keywords?.join(', ')}\n\n`;
    text += `H2 STRUCTURE\n${brief.h2_structure?.map(h => `- ${h.h2}: ${h.description}`).join('\n')}\n\n`;
    text += `FAQ SECTION\n${brief.faq_section?.map(f => `Q: ${f.question}\n   ${f.guidance}`).join('\n')}\n\n`;
    text += `INTERNAL LINKS\n${brief.internal_links?.map(l => `- ${l.page}: ${l.reason}`).join('\n')}\n\n`;
    text += `CTA\n${brief.cta_recommendation}\n\n`;
    text += `SEO CHECKLIST\n${brief.seo_checklist?.map(c => `[ ] ${c}`).join('\n')}\n`;
    navigator.clipboard.writeText(text);
    alert('Brief copied to clipboard!');
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold text-[#1a1a1a]">Content Brief Generator</h1>
            <p className="text-[11px] text-gray-400">AI-powered structured briefs for blog posts and SEO pages</p>
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
                  This is a REFRESH (not new)
                </label>
                <div><Label>Article Title</Label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. QLD First Home Buyer: 7 Smart Steps..." className="input-field" /></div>
                <div><Label>Focus Keyword</Label><input value={form.focusKeyword} onChange={e => setForm(f => ({ ...f, focusKeyword: e.target.value }))} placeholder="e.g. qld first home buyer" className="input-field" /></div>
                {form.isRefresh && (
                  <div><Label>Existing URL</Label><input value={form.existingUrl} onChange={e => setForm(f => ({ ...f, existingUrl: e.target.value }))} placeholder="https://..." className="input-field" /></div>
                )}
                <div><Label>Additional Context (optional)</Label><textarea value={form.context} onChange={e => setForm(f => ({ ...f, context: e.target.value }))} rows={2} placeholder="Tone, audience, special notes..." className="input-field resize-y" /></div>
                <button onClick={handleGenerate} disabled={generating} className="btn-primary w-full py-2.5">
                  {generating ? 'Generating brief...' : 'Generate Brief'}
                </button>
              </div>
            </div>

            {/* History */}
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
                <p className="text-[11px] mt-1">The AI will create a structured brief your team can work from immediately.</p>
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

                <Section title="Overview">
                  <p className="text-[12px] text-gray-700 leading-relaxed">{brief.overview}</p>
                </Section>

                <Section title="Suggested H1">
                  <p className="text-[13px] font-semibold text-[#1a1a1a]">{brief.suggested_h1}</p>
                </Section>

                <Section title={`Focus Keyword + LSI Keywords`}>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[10px] bg-[#F5C518]/20 text-[#1a1a1a] px-2 py-0.5 rounded-full font-semibold">{form.focusKeyword}</span>
                    {brief.lsi_keywords?.map((kw, i) => (
                      <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{kw}</span>
                    ))}
                  </div>
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

                <Section title="Internal Link Suggestions">
                  {brief.internal_links?.map((link, i) => (
                    <div key={i} className="flex items-start gap-2 mb-1.5 text-[11px]">
                      <span className="text-[#F5C518] shrink-0 mt-0.5">→</span>
                      <div><b className="text-gray-700">{link.page}</b> — <span className="text-gray-500">{link.reason}</span></div>
                    </div>
                  ))}
                </Section>

                <Section title="CTA Recommendation">
                  <p className="text-[12px] text-gray-700 leading-relaxed bg-[#F5C518]/10 rounded-lg p-3">{brief.cta_recommendation}</p>
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
