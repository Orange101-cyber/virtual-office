import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import * as imageGen from '../lib/imageGen';
import { COPY_LIMITS, MODELS } from '../lib/imageGen';
import toast from 'react-hot-toast';

const PLATFORMS = ['Meta', 'Google', 'LinkedIn', 'TikTok'];

const AD_PROMPT = ({ client, platform, goal, audience, offer, brandVoice }) => `You are an expert ad copywriter for an Australian digital marketing agency.
Generate ad copy variations for this campaign. Return ONLY valid JSON.

Client: ${client}
Platform: ${platform}
Campaign Goal: ${goal}
Target Audience: ${audience}
Offer/Hook: ${offer}
${brandVoice ? `Brand Voice Notes: ${brandVoice}` : ''}

Platform specs for ${platform}:
${JSON.stringify(COPY_LIMITS[platform] || COPY_LIMITS.Meta, null, 2)}

Return this exact JSON:
{
  "headlines": ["5-8 headline options within character limit"],
  "primary_text": ["3-5 primary text options within character limit"],
  "descriptions": ["3-5 description options within character limit"],
  "cta_recommendation": "Best CTA from the platform options",
  "hooks": ["3 attention-grabbing opening hooks"],
  "angles": [
    {"angle": "Social proof", "copy": "Full ad text using this angle"},
    {"angle": "Urgency", "copy": "Full ad text using this angle"},
    {"angle": "Benefit-led", "copy": "Full ad text using this angle"}
  ],
  "image_prompt": "Detailed image generation prompt for Ideogram that would work as the ad creative. Describe the visual, composition, mood, colors. Do NOT include text in the image — text will be overlaid."
}`;

function Label({ children }) {
  return <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{children}</label>;
}

export default function AdInspiration() {
  const { clients: dbClients } = useClients();
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({
    client: '', platform: 'Meta', goal: '', audience: '', offer: '',
  });
  const [brandVoice, setBrandVoice] = useState(null);
  const [results, setResults] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [savedImages, setSavedImages] = useState([]);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);

  useEffect(() => {
    const names = dbClients.map(c => c.name);
    setClients(names);
    if (names.length && !form.client) setForm(f => ({ ...f, client: names[0] }));
  }, [dbClients]);

  // Load brand voice when client changes
  useEffect(() => {
    if (!form.client) return;
    supabase.from('client_brand_voice').select('*').eq('client_name', form.client).single()
      .then(({ data }) => setBrandVoice(data));
    // Load saved images
    supabase.from('ad_generated_images').select('*').eq('client_name', form.client)
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => setSavedImages(data || []));
  }, [form.client]);

  const handleGenerate = async () => {
    if (!form.goal || !form.offer) return toast.error('Campaign goal and offer are required.');
    setGenerating(true);
    setResults(null);

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) { toast.error('API key not set'); setGenerating(false); return; }

    try {
      const bv = brandVoice ? `Tone: ${brandVoice.tone || ''}. USPs: ${brandVoice.key_selling_points || ''}. Avoid: ${brandVoice.words_to_avoid || ''}.` : '';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'x-api-key': apiKey,
          'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 2000,
          system: 'You are an expert ad copywriter. Return ONLY valid JSON, no markdown fences.',
          messages: [{ role: 'user', content: AD_PROMPT({ ...form, brandVoice: bv }) }],
        }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const msg = await res.json();
      let raw = msg.content[0].text;
      raw = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      setResults(JSON.parse(raw));
      toast.success('Ad copy generated!');
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
    setGenerating(false);
  };

  const handleGenerateImage = async () => {
    if (!results?.image_prompt) return toast.error('Generate ad copy first');
    if (!imageGen.isConfigured()) return toast.error('Fal.ai API key not configured. Add VITE_FAL_API_KEY to .env');
    setGeneratingImage(true);
    setGeneratedImage(null);

    try {
      const platformSpec = Object.entries(imageGen.PLATFORM_SPECS).find(([k]) => k.startsWith(form.platform));
      const width = platformSpec ? platformSpec[1].width : 1080;
      const height = platformSpec ? platformSpec[1].height : 1080;
      const image = await imageGen.generateImage(results.image_prompt, { width, height, model: selectedModel });
      setGeneratedImage(image);

      // Save to DB
      await supabase.from('ad_generated_images').insert({
        client_name: form.client, prompt: results.image_prompt,
        image_url: image.url, platform: form.platform,
        dimensions: `${width}x${height}`,
      });
      setSavedImages(prev => [{ client_name: form.client, prompt: results.image_prompt, image_url: image.url, platform: form.platform, created_at: new Date().toISOString() }, ...prev]);
      toast.success('Image generated and saved!');
    } catch (err) {
      toast.error('Image error: ' + err.message);
    }
    setGeneratingImage(false);
  };

  const handleSaveCopy = async (headline, primaryText, description) => {
    await supabase.from('ad_copy').insert({
      client_name: form.client, platform: form.platform,
      headline, primary_text: primaryText, description, cta: results?.cta_recommendation,
      status: 'Draft',
    });
    toast.success('Saved to Ad Copy Library!');
  };

  const handleSaveAll = async () => {
    if (!results) return;
    const items = [];
    // Save each angle as a separate copy
    results.angles?.forEach(a => {
      items.push({
        client_name: form.client, platform: form.platform,
        headline: a.angle, primary_text: a.copy,
        cta: results.cta_recommendation, status: 'Draft',
      });
    });
    if (items.length === 0) return toast.error('Nothing to save');
    await supabase.from('ad_copy').insert(items);
    toast.success(`Saved ${items.length} copy variations to Ad Copy Library!`);
  };

  const limits = COPY_LIMITS[form.platform] || COPY_LIMITS.Meta;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-[#1a1a1a]">Ad Inspiration Generator</h1>
          <p className="text-[11px] text-gray-400">AI-generated ad copy and creative inspiration per client</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          {/* Left: Input */}
          <div className="flex flex-col gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold mb-3">Campaign Input</h2>
              <div className="space-y-3">
                <div><Label>Client</Label><select value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} className="input-field">{clients.map(c => <option key={c}>{c}</option>)}</select></div>
                <div><Label>Platform</Label><select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} className="input-field">{PLATFORMS.map(p => <option key={p}>{p}</option>)}</select></div>
                <div><Label>Campaign Goal</Label><input value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} placeholder="e.g. Generate leads for free appraisal" className="input-field" /></div>
                <div><Label>Target Audience</Label><input value={form.audience} onChange={e => setForm(f => ({ ...f, audience: e.target.value }))} placeholder="e.g. Homeowners 30-55 in Brisbane" className="input-field" /></div>
                <div><Label>Offer / Hook</Label><textarea value={form.offer} onChange={e => setForm(f => ({ ...f, offer: e.target.value }))} rows={2} placeholder="e.g. Free property appraisal, limited spots..." className="input-field resize-y" /></div>

                {brandVoice && (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-[10px] text-green-700">
                    ✓ Brand voice loaded for {form.client}
                  </div>
                )}

                <button onClick={handleGenerate} disabled={generating} className="btn-primary w-full py-2.5">
                  {generating ? 'Generating...' : 'Generate Ad Copy'}
                </button>
              </div>
            </div>

            {/* Platform specs */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">{form.platform} Specs</h3>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between"><span className="text-gray-500">Headline</span><span className="font-semibold">{limits.headline} chars</span></div>
                {limits.primary_text && <div className="flex justify-between"><span className="text-gray-500">Primary Text</span><span className="font-semibold">{limits.primary_text} chars</span></div>}
                {limits.description && <div className="flex justify-between"><span className="text-gray-500">Description</span><span className="font-semibold">{limits.description} chars</span></div>}
                <div className="pt-1 mt-1 border-t border-gray-100">
                  <div className="text-[9px] text-gray-400 mb-1">CTA Options</div>
                  <div className="flex flex-wrap gap-1">
                    {limits.cta_options?.map(c => <span key={c} className="text-[9px] bg-gray-100 px-1.5 py-0.5 rounded">{c}</span>)}
                  </div>
                </div>
              </div>
            </div>

            {/* Saved images */}
            {savedImages.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Past Creatives</h3>
                <div className="grid grid-cols-3 gap-1.5">
                  {savedImages.map((img, i) => (
                    <a key={i} href={img.image_url} target="_blank" rel="noreferrer">
                      <img src={img.image_url} alt="" className="w-full aspect-square object-cover rounded-lg border border-gray-200 hover:border-[#F5C518] transition-colors" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Results */}
          <div className="space-y-4">
            {!results && !generating ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center h-64 text-center text-gray-400">
                <div className="text-3xl mb-2 opacity-30">✨</div>
                <p className="text-sm">Fill in the campaign details and click Generate</p>
              </div>
            ) : generating ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center h-64 text-gray-500">
                <div className="w-6 h-6 border-2 border-gray-200 border-t-[#F5C518] rounded-full animate-spin mb-3" />
                <p className="text-sm">Generating ad copy...</p>
              </div>
            ) : (
              <>
                {/* Action bar */}
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={handleSaveAll} className="text-[11px] bg-[#F5C518] text-[#1a1a1a] border-none rounded px-3 py-1.5 font-bold cursor-pointer hover:bg-[#e6b800]">
                    Save All Copy to Library
                  </button>
                  <span className="text-[10px] text-gray-400">Saves all copy angles for {form.client}</span>
                </div>

                {/* Headlines */}
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Headlines ({limits.headline} char limit)</h3>
                  <div className="space-y-1.5">
                    {results.headlines?.map((h, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-[#f8f8f6] rounded-lg group">
                        <span className="text-[12px] text-gray-700 flex-1">{h}</span>
                        <span className={`text-[9px] shrink-0 ${h.length <= limits.headline ? 'text-green-600' : 'text-red-500'}`}>{h.length}/{limits.headline}</span>
                        <button onClick={() => handleSaveCopy(h, '', '')} className="text-[9px] text-gray-300 hover:text-[#F5C518] bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 shrink-0">Save</button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Primary Text */}
                {results.primary_text?.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Primary Text</h3>
                    <div className="space-y-2">
                      {results.primary_text?.map((t, i) => (
                        <div key={i} className="p-3 bg-[#f8f8f6] rounded-lg text-[12px] text-gray-700 leading-relaxed">{t}</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Angles */}
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Copy Angles</h3>
                    <span className="text-[9px] text-gray-400">Click any to save to library</span>
                  </div>
                  <div className="space-y-2">
                    {results.angles?.map((a, i) => (
                      <div key={i} className="border border-gray-200 rounded-lg p-3 hover:border-[#F5C518] cursor-pointer transition-colors"
                        onClick={() => handleSaveCopy(a.angle, a.copy, '')}>
                        <div className="text-[10px] font-bold uppercase text-[#F5C518] mb-1">{a.angle}</div>
                        <div className="text-[12px] text-gray-700 leading-relaxed">{a.copy}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hooks */}
                {results.hooks?.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Opening Hooks</h3>
                    {results.hooks.map((h, i) => (
                      <div key={i} className="text-[12px] text-gray-700 border-l-2 border-[#F5C518] pl-3 mb-2">{h}</div>
                    ))}
                  </div>
                )}

                {/* CTA */}
                <div className="bg-[#F5C518]/10 border border-[#F5C518]/30 rounded-xl p-4 text-center">
                  <span className="text-xs font-bold text-[#1a1a1a]">Recommended CTA: </span>
                  <span className="text-xs text-gray-700">{results.cta_recommendation}</span>
                </div>

                {/* Image generation */}
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">AI Creative</h3>
                      <p className="text-[10px] text-gray-400 mt-0.5">Generate an ad image using Fal.ai</p>
                    </div>
                    <button onClick={handleGenerateImage} disabled={generatingImage}
                      className="btn-primary text-[11px]">
                      {generatingImage ? 'Generating...' : imageGen.isConfigured() ? 'Generate Image' : 'Fal.ai Key Needed'}
                    </button>
                  </div>
                  <div className="mb-3">
                    <Label>AI Model</Label>
                    <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className="input-field text-[11px]">
                      {MODELS.map(m => (
                        <option key={m.id} value={m.id}>{m.name} — {m.desc}</option>
                      ))}
                    </select>
                  </div>
                  <div className="bg-[#f8f8f6] rounded-lg p-3 text-[10px] text-gray-500 mb-3">
                    <span className="font-semibold text-gray-600">Prompt: </span>{results.image_prompt}
                  </div>
                  {generatingImage && (
                    <div className="flex items-center justify-center py-10">
                      <div className="w-8 h-8 border-2 border-gray-200 border-t-[#F5C518] rounded-full animate-spin" />
                    </div>
                  )}
                  {generatedImage && (
                    <img src={generatedImage.url} alt="Generated ad creative" className="w-full rounded-lg border border-gray-200" />
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
      `}</style>
    </div>
  );
}
