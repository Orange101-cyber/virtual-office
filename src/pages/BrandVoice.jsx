import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import toast from 'react-hot-toast';

function Label({ children }) {
  return <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{children}</label>;
}

export default function BrandVoice() {
  const { clients: dbClients } = useClients();
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [form, setForm] = useState({
    tone: '', key_selling_points: '', words_to_avoid: '',
    target_demographics: '', brand_colors: '', notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasRecord, setHasRecord] = useState(false);

  useEffect(() => {
    const names = dbClients.map(c => c.name);
    setClients(names);
    if (names.length && !selectedClient) setSelectedClient(names[0]);
  }, [dbClients]);

  const loadVoice = useCallback(async () => {
    if (!selectedClient) return;
    setLoading(true);
    const { data } = await supabase.from('client_brand_voice')
      .select('*').eq('client_name', selectedClient).single();
    if (data) {
      setForm({
        tone: data.tone || '', key_selling_points: data.key_selling_points || '',
        words_to_avoid: data.words_to_avoid || '', target_demographics: data.target_demographics || '',
        brand_colors: data.brand_colors || '', notes: data.notes || '',
      });
      setHasRecord(true);
    } else {
      setForm({ tone: '', key_selling_points: '', words_to_avoid: '', target_demographics: '', brand_colors: '', notes: '' });
      setHasRecord(false);
    }
    setLoading(false);
  }, [selectedClient]);

  useEffect(() => { loadVoice(); }, [loadVoice]);

  const handleSave = async () => {
    setSaving(true);
    if (hasRecord) {
      await supabase.from('client_brand_voice').update({ ...form, updated_at: new Date().toISOString() })
        .eq('client_name', selectedClient);
    } else {
      await supabase.from('client_brand_voice').insert({ client_name: selectedClient, ...form });
      setHasRecord(true);
    }
    setSaving(false);
    toast.success('Brand voice saved!');
  };

  const handleGenerate = async () => {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) return toast.error('API key not set');

    const prompt = `Based on the client name "${selectedClient}", suggest a brand voice profile for an Australian business. Return ONLY valid JSON:
{"tone":"Describe ideal tone in 2-3 sentences","key_selling_points":"3-5 key USPs, one per line","words_to_avoid":"5-10 words or phrases to avoid, comma separated","target_demographics":"Target audience description","notes":"Any other brand guidelines"}`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 500, system: 'Return ONLY valid JSON.', messages: [{ role: 'user', content: prompt }] }),
      });
      const msg = await res.json();
      let raw = msg.content[0].text;
      raw = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      const data = JSON.parse(raw);
      setForm(f => ({
        ...f,
        tone: data.tone || f.tone,
        key_selling_points: data.key_selling_points || f.key_selling_points,
        words_to_avoid: data.words_to_avoid || f.words_to_avoid,
        target_demographics: data.target_demographics || f.target_demographics,
        notes: data.notes || f.notes,
      }));
      toast.success('AI suggestions loaded — review and save');
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-[#1a1a1a]">Brand Voice</h1>
          <p className="text-[11px] text-gray-400">Tone, USPs, and guidelines per client. Used by all AI-generated ad copy.</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Label>Client</Label>
              <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} className="input-field w-auto">
                {clients.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <button onClick={handleGenerate} className="text-[10px] text-gray-400 hover:text-[#F5C518] bg-transparent border border-gray-200 rounded px-2.5 py-1 cursor-pointer">
              AI Suggest
            </button>
          </div>

          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">Loading...</div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Tone of Voice</Label>
                <textarea value={form.tone} onChange={e => setForm(f => ({ ...f, tone: e.target.value }))} rows={3}
                  placeholder="e.g. Professional but approachable. Confident without being arrogant. Use Australian English. Conversational — talk like a trusted advisor, not a salesperson." className="input-field resize-y" />
              </div>
              <div>
                <Label>Key Selling Points / USPs</Label>
                <textarea value={form.key_selling_points} onChange={e => setForm(f => ({ ...f, key_selling_points: e.target.value }))} rows={4}
                  placeholder="One per line:&#10;15+ years experience in Brisbane property&#10;No. 1 agent in West End 2024-2025&#10;Free no-obligation property appraisal" className="input-field resize-y" />
              </div>
              <div>
                <Label>Words & Phrases to Avoid</Label>
                <textarea value={form.words_to_avoid} onChange={e => setForm(f => ({ ...f, words_to_avoid: e.target.value }))} rows={2}
                  placeholder="e.g. cheap, discount, guaranteed results, #1 in Australia" className="input-field resize-y" />
              </div>
              <div>
                <Label>Target Demographics</Label>
                <textarea value={form.target_demographics} onChange={e => setForm(f => ({ ...f, target_demographics: e.target.value }))} rows={2}
                  placeholder="e.g. Homeowners 30-60, professional couples, families upgrading, investors looking at inner-city Brisbane" className="input-field resize-y" />
              </div>
              <div>
                <Label>Brand Colors (optional)</Label>
                <input value={form.brand_colors} onChange={e => setForm(f => ({ ...f, brand_colors: e.target.value }))}
                  placeholder="e.g. Navy #0B1D3A, Gold #C4A35A, White" className="input-field" />
              </div>
              <div>
                <Label>Other Notes</Label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                  placeholder="Any other brand guidelines, legal disclaimers, compliance notes..." className="input-field resize-y" />
              </div>

              <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-2.5">
                {saving ? 'Saving...' : 'Save Brand Voice'}
              </button>
            </div>
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
