import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import { COPY_LIMITS, PLATFORM_SPECS } from '../lib/imageGen';
import toast from 'react-hot-toast';

function Label({ children }) {
  return <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{children}</label>;
}

export default function AdCreativeBrief() {
  const { clients: dbClients } = useClients();
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({
    client: '', platform: 'Meta', goal: '', audience: '', offer: '', budget: '', duration: '',
  });
  const [brandVoice, setBrandVoice] = useState(null);
  const [brief, setBrief] = useState(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const names = dbClients.map(c => c.name);
    setClients(names);
    if (names.length && !form.client) setForm(f => ({ ...f, client: names[0] }));
  }, [dbClients]);

  useEffect(() => {
    if (!form.client) return;
    supabase.from('client_brand_voice').select('*').eq('client_name', form.client).single()
      .then(({ data }) => setBrandVoice(data));
  }, [form.client]);

  const handleGenerate = async () => {
    if (!form.goal) return toast.error('Campaign goal is required.');
    setGenerating(true);
    setBrief(null);

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) { toast.error('API key not set'); setGenerating(false); return; }

    const limits = COPY_LIMITS[form.platform] || COPY_LIMITS.Meta;
    const specs = Object.entries(PLATFORM_SPECS).filter(([k]) => k.startsWith(form.platform)).map(([k, v]) => `${k}: ${v.dimensions} (${v.label})`).join(', ');
    const bv = brandVoice ? `Tone: ${brandVoice.tone || ''}. USPs: ${brandVoice.key_selling_points || ''}. Avoid: ${brandVoice.words_to_avoid || ''}.` : '';

    const prompt = `You are a creative director at an Australian digital marketing agency. Generate a comprehensive ad creative brief.

Client: ${form.client}
Platform: ${form.platform}
Campaign Goal: ${form.goal}
Target Audience: ${form.audience || 'Not specified'}
Offer/Hook: ${form.offer || 'Not specified'}
Budget: ${form.budget || 'Not specified'}
Duration: ${form.duration || 'Not specified'}
${bv ? `Brand Voice: ${bv}` : ''}

Platform specs:
- Copy limits: Headline ${limits.headline} chars, Primary ${limits.primary_text || 'N/A'} chars, Description ${limits.description || 'N/A'} chars
- Image sizes: ${specs}
- CTA options: ${limits.cta_options?.join(', ')}

Return ONLY valid JSON:
{
  "campaign_name": "Suggested campaign name",
  "objective": "Clear campaign objective in 1-2 sentences",
  "audience_brief": "Detailed audience description and targeting suggestions",
  "key_message": "The single most important message to communicate",
  "headlines": ["8-10 headline options within ${limits.headline} char limit"],
  "primary_text_options": ["5 primary text options"],
  "description_options": ["5 description options"],
  "cta": "Recommended CTA",
  "visual_direction": {
    "style": "Overall visual style description",
    "mood": "Mood/feeling the creative should evoke",
    "colors": "Color palette suggestions",
    "imagery": "What to show in the image",
    "text_overlay": "What text should appear on the creative (if any)",
    "do_nots": ["Things to avoid visually"]
  },
  "image_specs": [
    {"format": "Format name", "dimensions": "WxH", "notes": "Any specific notes for this format"}
  ],
  "ab_test_suggestions": [
    {"variable": "What to test", "variant_a": "Option A", "variant_b": "Option B"}
  ],
  "image_prompt": "Detailed prompt for AI image generation describing the ideal ad creative"
}`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'x-api-key': apiKey,
          'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 2500,
          system: 'You are a creative director. Return ONLY valid JSON, no markdown fences.',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const msg = await res.json();
      let raw = msg.content[0].text;
      raw = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      setBrief(JSON.parse(raw));
      toast.success('Creative brief generated!');
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
    setGenerating(false);
  };

  const handleCopy = () => {
    if (!brief) return;
    let text = `AD CREATIVE BRIEF — ${form.client}\n${'='.repeat(40)}\n`;
    text += `Campaign: ${brief.campaign_name}\nPlatform: ${form.platform}\nObjective: ${brief.objective}\n\n`;
    text += `AUDIENCE\n${brief.audience_brief}\n\nKEY MESSAGE\n${brief.key_message}\n\n`;
    text += `HEADLINES\n${brief.headlines?.map(h => `- ${h}`).join('\n')}\n\n`;
    text += `PRIMARY TEXT\n${brief.primary_text_options?.map(t => `- ${t}`).join('\n')}\n\n`;
    text += `CTA: ${brief.cta}\n\n`;
    text += `VISUAL DIRECTION\n- Style: ${brief.visual_direction?.style}\n- Mood: ${brief.visual_direction?.mood}\n- Colors: ${brief.visual_direction?.colors}\n- Imagery: ${brief.visual_direction?.imagery}\n- Text overlay: ${brief.visual_direction?.text_overlay}\n\n`;
    text += `A/B TESTS\n${brief.ab_test_suggestions?.map(t => `- ${t.variable}: A) ${t.variant_a} vs B) ${t.variant_b}`).join('\n')}\n`;
    navigator.clipboard.writeText(text);
    toast.success('Brief copied!');
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-[#1a1a1a]">Ad Creative Brief</h1>
          <p className="text-[11px] text-gray-400">AI-generated creative briefs with platform specs and design direction</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold mb-3">Brief Input</h2>
            <div className="space-y-3">
              <div><Label>Client</Label><select value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} className="input-field">{clients.map(c => <option key={c}>{c}</option>)}</select></div>
              <div><Label>Platform</Label><select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} className="input-field"><option>Meta</option><option>Google</option><option>LinkedIn</option><option>TikTok</option></select></div>
              <div><Label>Campaign Goal</Label><input value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} placeholder="e.g. Lead gen for free appraisal" className="input-field" /></div>
              <div><Label>Target Audience</Label><input value={form.audience} onChange={e => setForm(f => ({ ...f, audience: e.target.value }))} placeholder="e.g. Homeowners 30-55 Brisbane" className="input-field" /></div>
              <div><Label>Offer / Hook</Label><textarea value={form.offer} onChange={e => setForm(f => ({ ...f, offer: e.target.value }))} rows={2} className="input-field resize-y" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Budget (optional)</Label><input value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} placeholder="e.g. $2000/month" className="input-field" /></div>
                <div><Label>Duration</Label><input value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} placeholder="e.g. 4 weeks" className="input-field" /></div>
              </div>
              {brandVoice && <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-[10px] text-green-700">✓ Brand voice loaded</div>}
              <button onClick={handleGenerate} disabled={generating} className="btn-primary w-full py-2.5">
                {generating ? 'Generating...' : 'Generate Creative Brief'}
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6">
            {!brief && !generating ? (
              <div className="flex flex-col items-center justify-center h-64 text-center text-gray-400">
                <div className="text-3xl mb-2 opacity-30">🎨</div>
                <p className="text-sm">Fill in the details and click Generate</p>
              </div>
            ) : generating ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <div className="w-6 h-6 border-2 border-gray-200 border-t-[#F5C518] rounded-full animate-spin mb-3" />
                <p className="text-sm">Generating creative brief...</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold">{brief.campaign_name}</h2>
                  <button onClick={handleCopy} className="btn-secondary text-[10px]">Copy Brief</button>
                </div>
                <div className="space-y-4 text-[12px]">
                  <div><div className="text-[9px] font-bold uppercase text-gray-400 mb-1">Objective</div><div className="text-gray-700">{brief.objective}</div></div>
                  <div><div className="text-[9px] font-bold uppercase text-gray-400 mb-1">Audience</div><div className="text-gray-700">{brief.audience_brief}</div></div>
                  <div className="bg-[#F5C518]/10 rounded-lg p-3"><div className="text-[9px] font-bold uppercase text-gray-400 mb-1">Key Message</div><div className="font-semibold text-[#1a1a1a]">{brief.key_message}</div></div>
                  <div>
                    <div className="text-[9px] font-bold uppercase text-gray-400 mb-1">Headlines</div>
                    {brief.headlines?.map((h, i) => <div key={i} className="bg-[#f8f8f6] rounded p-2 mb-1 text-gray-700">{h} <span className="text-[9px] text-gray-400">({h.length}ch)</span></div>)}
                  </div>
                  <div><div className="text-[9px] font-bold uppercase text-gray-400 mb-1">CTA</div><div className="font-bold text-[#F5C518]">{brief.cta}</div></div>
                  <div>
                    <div className="text-[9px] font-bold uppercase text-gray-400 mb-1">Visual Direction</div>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(brief.visual_direction || {}).filter(([k]) => k !== 'do_nots').map(([k, v]) => (
                        <div key={k} className="bg-[#f8f8f6] rounded p-2"><span className="text-[9px] text-gray-400 capitalize">{k.replace(/_/g, ' ')}</span><div className="text-gray-700 mt-0.5">{v}</div></div>
                      ))}
                    </div>
                  </div>
                  {brief.ab_test_suggestions?.length > 0 && (
                    <div>
                      <div className="text-[9px] font-bold uppercase text-gray-400 mb-1">A/B Test Suggestions</div>
                      {brief.ab_test_suggestions.map((t, i) => (
                        <div key={i} className="border border-gray-200 rounded p-2 mb-1">
                          <div className="text-[10px] font-semibold text-gray-600">{t.variable}</div>
                          <div className="text-[10px] text-gray-500">A: {t.variant_a} — B: {t.variant_b}</div>
                        </div>
                      ))}
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
      `}</style>
    </div>
  );
}
