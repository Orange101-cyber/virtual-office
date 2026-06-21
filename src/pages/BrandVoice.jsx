import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import { fetchUrlContent } from '../lib/urlFetcher';
import toast from 'react-hot-toast';

function Label({ children }) {
  return <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{children}</label>;
}

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#1a1a1a] mb-3 pb-1.5 border-b border-gray-200">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

const EMPTY_FORM = {
  website_url: '', business_description: '', services: '', locations_served: '',
  differentiators: '', target_personas: '', target_demographics: '',
  competitors: '', business_goals: '', compliance_notes: '',
  tone: '', key_selling_points: '', words_to_avoid: '',
  brand_colors: '', notes: '',
  address: '', latitude: '', longitude: '',
};

export default function BrandVoice() {
  const { clients: dbClients } = useClients();
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasRecord, setHasRecord] = useState(false);

  useEffect(() => {
    const names = dbClients.map(c => c.name);
    setClients(names);
    if (names.length && !selectedClient) setSelectedClient(names[0]);
  }, [dbClients]);

  const loadProfile = useCallback(async () => {
    if (!selectedClient) return;
    setLoading(true);
    const { data } = await supabase.from('client_brand_voice')
      .select('*').eq('client_name', selectedClient).single();
    if (data) {
      setForm({
        website_url: data.website_url || '',
        business_description: data.business_description || '',
        services: data.services || '',
        locations_served: data.locations_served || '',
        differentiators: data.differentiators || '',
        target_personas: data.target_personas || '',
        target_demographics: data.target_demographics || '',
        competitors: data.competitors || '',
        business_goals: data.business_goals || '',
        compliance_notes: data.compliance_notes || '',
        tone: data.tone || '',
        key_selling_points: data.key_selling_points || '',
        words_to_avoid: data.words_to_avoid || '',
        brand_colors: data.brand_colors || '',
        notes: data.notes || '',
        address: data.address || '',
        latitude: data.latitude || '',
        longitude: data.longitude || '',
      });
      setHasRecord(true);
    } else {
      setForm(EMPTY_FORM);
      setHasRecord(false);
    }
    setLoading(false);
  }, [selectedClient]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleSave = async () => {
    setSaving(true);
    if (hasRecord) {
      await supabase.from('client_brand_voice')
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq('client_name', selectedClient);
    } else {
      await supabase.from('client_brand_voice').insert({ client_name: selectedClient, ...form });
      setHasRecord(true);
    }
    setSaving(false);
    toast.success('Client profile saved!');
  };

  const [suggesting, setSuggesting] = useState(false);

  const handleAISuggest = async () => {
    if (!form.website_url?.trim()) {
      return toast.error('Enter a website URL first — AI needs to read the site to make real suggestions');
    }
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) return toast.error('API key not set');

    setSuggesting(true);
    toast('Scraping website...');

    try {
      // Step 1: Scrape the website to get real content
      const siteData = await fetchUrlContent(form.website_url.trim());

      if (!siteData.article_content || siteData.article_content.length < 100) {
        toast.error('Could not read the website — check the URL is correct');
        setSuggesting(false);
        return;
      }

      toast('Analysing website content with AI...');

      // Step 2: Feed real content to AI for analysis
      const prompt = `You are analysing a real Australian business website to build their client profile. Use ONLY the website content below — do not make anything up.

CLIENT NAME: ${selectedClient}
WEBSITE URL: ${form.website_url}

SCRAPED WEBSITE CONTENT (homepage and meta):
Title: ${siteData.article_title || ''}
Meta: ${siteData.meta_description || ''}

${siteData.article_content.substring(0, 6000)}

Based ONLY on the above content, return a JSON profile. If information isn't visible on the page, use an empty string "" for that field rather than guessing.

Return ONLY valid JSON with this exact structure:
{
  "business_description": "1-2 sentence description based on what the site says",
  "services": "Services/products mentioned on the site, one per line",
  "locations_served": "Geographic areas mentioned on the site",
  "differentiators": "Unique points actually mentioned on the site, one per line",
  "target_personas": "Who the site is speaking to (if evident)",
  "target_demographics": "Age/lifestyle/demographics if mentioned",
  "tone": "Tone of voice used on the website (describe what you observe)",
  "key_selling_points": "USPs actually mentioned on the site, one per line",
  "words_to_avoid": "Words/phrases that would clash with their current tone",
  "business_goals": "Business goals inferable from the site content"
}`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          system: 'You are a business analyst. Return ONLY valid JSON, no markdown fences. Only use information from the provided website content — never make up or guess details.',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);

      const msg = await res.json();
      let raw = msg.content[0].text;
      raw = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      const data = JSON.parse(raw);

      // Only update fields that have content, and don't overwrite existing data
      setForm(f => {
        const updates = {};
        Object.entries(data).forEach(([key, value]) => {
          if (value && value !== '' && !f[key]) {
            updates[key] = value;
          }
        });
        return { ...f, ...updates };
      });

      toast.success('Profile populated from website — review and save');
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
    setSuggesting(false);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-[#1a1a1a]">Client Profile</h1>
          <p className="text-[11px] text-gray-400">Full client context used by all AI tools — business info, brand voice, and guidelines.</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Label>Client</Label>
              <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} className="input-field w-auto">
                {clients.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <button
              onClick={handleAISuggest}
              disabled={suggesting || !form.website_url?.trim()}
              title={!form.website_url?.trim() ? 'Enter a website URL first' : 'Scrape website and suggest profile'}
              className="text-[10px] text-gray-400 hover:text-[#F5C518] bg-transparent border border-gray-200 rounded px-2.5 py-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {suggesting ? 'Analysing...' : '🔍 AI Suggest from Website'}
            </button>
          </div>

          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">Loading...</div>
          ) : (
            <>
              <Section title="Business Information">
                <div>
                  <Label>Website URL</Label>
                  <input value={form.website_url} onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))} placeholder="https://..." className="input-field" />
                </div>
                <div>
                  <Label>Business Address</Label>
                  <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="e.g. 123 Main St, Gold Coast QLD 4217" className="input-field" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Latitude</Label>
                    <input value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} placeholder="-27.4698" className="input-field" />
                  </div>
                  <div>
                    <Label>Longitude</Label>
                    <input value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} placeholder="153.0251" className="input-field" />
                  </div>
                </div>
                <div>
                  <Label>Business Description</Label>
                  <textarea value={form.business_description} onChange={e => setForm(f => ({ ...f, business_description: e.target.value }))} rows={2}
                    placeholder="e.g. Luke O'Kelly is a real estate agent specialising in inner-Brisbane properties, with 15+ years experience in West End, South Brisbane and surrounds." className="input-field resize-y" />
                </div>
                <div>
                  <Label>Services / Products</Label>
                  <textarea value={form.services} onChange={e => setForm(f => ({ ...f, services: e.target.value }))} rows={3}
                    placeholder="One per line:&#10;Residential property sales&#10;Property appraisals&#10;Investment property advice&#10;Auction management" className="input-field resize-y" />
                </div>
                <div>
                  <Label>Locations Served</Label>
                  <input value={form.locations_served} onChange={e => setForm(f => ({ ...f, locations_served: e.target.value }))}
                    placeholder="e.g. West End, South Brisbane, Highgate Hill, Kangaroo Point" className="input-field" />
                </div>
                <div>
                  <Label>Differentiators / USPs</Label>
                  <textarea value={form.differentiators} onChange={e => setForm(f => ({ ...f, differentiators: e.target.value }))} rows={3}
                    placeholder="What makes this client unique? Top agent in the area, unique methodology, credentials..." className="input-field resize-y" />
                </div>
                <div>
                  <Label>Competitors</Label>
                  <textarea value={form.competitors} onChange={e => setForm(f => ({ ...f, competitors: e.target.value }))} rows={2}
                    placeholder="Main competitor names and domains, comma separated" className="input-field resize-y" />
                </div>
                <div>
                  <Label>Business Goals / KPIs</Label>
                  <textarea value={form.business_goals} onChange={e => setForm(f => ({ ...f, business_goals: e.target.value }))} rows={2}
                    placeholder="e.g. 20 new appraisals per month, 3 listings/month from West End, build thought leadership in inner-Brisbane market" className="input-field resize-y" />
                </div>
              </Section>

              <Section title="Target Audience">
                <div>
                  <Label>Target Personas</Label>
                  <textarea value={form.target_personas} onChange={e => setForm(f => ({ ...f, target_personas: e.target.value }))} rows={3}
                    placeholder="e.g. Homeowners 30-55 considering upgrading, investors buying inner-city units, first home buyers in West End" className="input-field resize-y" />
                </div>
                <div>
                  <Label>Target Demographics</Label>
                  <textarea value={form.target_demographics} onChange={e => setForm(f => ({ ...f, target_demographics: e.target.value }))} rows={2}
                    placeholder="Age range, income bracket, lifestyle indicators" className="input-field resize-y" />
                </div>
              </Section>

              <Section title="Brand Voice">
                <div>
                  <Label>Tone of Voice</Label>
                  <textarea value={form.tone} onChange={e => setForm(f => ({ ...f, tone: e.target.value }))} rows={3}
                    placeholder="e.g. Professional but approachable. Confident without being arrogant. Australian English. Conversational — trusted advisor, not salesperson." className="input-field resize-y" />
                </div>
                <div>
                  <Label>Key Selling Points / USPs</Label>
                  <textarea value={form.key_selling_points} onChange={e => setForm(f => ({ ...f, key_selling_points: e.target.value }))} rows={4}
                    placeholder="One per line — used in every piece of ad copy and content" className="input-field resize-y" />
                </div>
                <div>
                  <Label>Words & Phrases to Avoid</Label>
                  <textarea value={form.words_to_avoid} onChange={e => setForm(f => ({ ...f, words_to_avoid: e.target.value }))} rows={2}
                    placeholder="e.g. cheap, discount, guaranteed results, #1 in Australia" className="input-field resize-y" />
                </div>
                <div>
                  <Label>Brand Colors (optional)</Label>
                  <input value={form.brand_colors} onChange={e => setForm(f => ({ ...f, brand_colors: e.target.value }))}
                    placeholder="e.g. Navy #0B1D3A, Gold #C4A35A, White" className="input-field" />
                </div>
              </Section>

              <Section title="Compliance & Other">
                <div>
                  <Label>Compliance Notes</Label>
                  <textarea value={form.compliance_notes} onChange={e => setForm(f => ({ ...f, compliance_notes: e.target.value }))} rows={2}
                    placeholder="Required disclaimers, legal notes, industry compliance requirements" className="input-field resize-y" />
                </div>
                <div>
                  <Label>Other Notes</Label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                    placeholder="Any other brand guidelines or context" className="input-field resize-y" />
                </div>
              </Section>

              <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-3">
                {saving ? 'Saving...' : 'Save Client Profile'}
              </button>
            </>
          )}
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
