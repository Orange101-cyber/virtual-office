import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';

const KW_PROMPT = ({ client, niche, seedTopic, contentGoal, preference }) => `You are an SEO keyword research assistant for an Australian digital marketing agency.
Generate keyword ideas based on the inputs below. Return ONLY valid JSON.

Client: ${client}
Industry/Niche: ${niche}
Seed Topic: ${seedTopic}
Content Goal: ${contentGoal}
Preference: ${preference}

Return this exact JSON structure:
{
  "keywords": [
    {
      "keyword": "exact keyword phrase",
      "intent": "Informational or Navigational or Commercial or Transactional",
      "content_type": "Blog or SEO Page",
      "suggested_title": "Full article title suggestion"
    }
  ],
  "cannibalization_risks": "Brief note on any keywords that could clash with each other",
  "quick_wins": ["keyword1 - reason", "keyword2 - reason", "keyword3 - reason"]
}

Generate 12-15 keyword ideas. Focus on Australian search patterns. For ${preference === 'Low KD focus' ? 'low competition keywords that are easier to rank for' : preference === 'High SV focus' ? 'high search volume keywords with the most traffic potential' : 'a balanced mix of search volume and difficulty'}.`;

function AddToPlanModal({ open, onClose, keyword, clients }) {
  const CURRENT_YEAR = new Date().getFullYear();
  const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
  const MONTHS_MAP = { Q1: ['January', 'February', 'March'], Q2: ['April', 'May', 'June'], Q3: ['July', 'August', 'September'], Q4: ['October', 'November', 'December'] };

  const [form, setForm] = useState({
    client_name: '', quarter: `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${CURRENT_YEAR}`,
    month: '', content_type: keyword?.content_type || 'Blog',
    title: keyword?.suggested_title || '', focus_keyword: keyword?.keyword || '',
  });

  useEffect(() => {
    if (open && keyword) {
      setForm(f => ({
        ...f,
        content_type: keyword.content_type || 'Blog',
        title: keyword.suggested_title || '',
        focus_keyword: keyword.keyword || '',
        client_name: clients[0] || '',
      }));
    }
  }, [open, keyword, clients]);

  const handleSave = async () => {
    const qMonths = MONTHS_MAP[form.quarter?.split(' ')[0]] || [];
    await supabase.from('content_plans').insert({
      client_name: form.client_name,
      quarter: form.quarter,
      month: form.month,
      content_type: form.content_type === 'SEO Page' ? 'SEO Page' : 'Blog',
      title: form.title,
      is_refresh: false,
      focus_keyword: form.focus_keyword,
      status: 'Planned',
    });
    onClose();
    alert('Added to Content Plan!');
  };

  if (!open) return null;
  const qMonths = MONTHS_MAP[form.quarter?.split(' ')[0]] || [];

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-[400px] max-w-[95vw] shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-[15px] font-semibold mb-3">Add to Content Plan</h3>
        <div className="space-y-3">
          <div><Label>Client</Label><select value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} className="input-field">{clients.map(c => <option key={c}>{c}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Quarter</Label><select value={form.quarter} onChange={e => setForm(f => ({ ...f, quarter: e.target.value }))} className="input-field">{[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].flatMap(y => QUARTERS.map(q => `${q} ${y}`)).map(q => <option key={q}>{q}</option>)}</select></div>
            <div><Label>Month</Label><select value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))} className="input-field"><option value="">—</option>{qMonths.map(m => <option key={m}>{m}</option>)}</select></div>
          </div>
          <div><Label>Title</Label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="input-field" /></div>
          <div><Label>Focus Keyword</Label><input value={form.focus_keyword} onChange={e => setForm(f => ({ ...f, focus_keyword: e.target.value }))} className="input-field" /></div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} className="btn-primary">Add to Plan</button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{children}</label>;
}

export default function KeywordResearch() {
  const { clients: dbClients } = useClients();
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({
    client: '', niche: '', seedTopic: '',
    contentGoal: 'Both', preference: 'Balanced',
  });
  const [results, setResults] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [history, setHistory] = useState([]);
  const [addKw, setAddKw] = useState(null);

  useEffect(() => {
    const fromDb = dbClients.map(c => c.name);
    supabase.from('content_plans').select('client_name').then(({ data }) => {
      const fromPlans = data ? data.map(d => d.client_name) : [];
      const unique = [...new Set([...fromDb, ...fromPlans])].filter(Boolean).sort();
      setClients(unique);
      if (unique.length && !form.client) setForm(f => ({ ...f, client: unique[0] }));
    });
    supabase.from('keyword_research').select('id, client_name, seed_topic, created_at')
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => setHistory(data || []));
  }, [dbClients]);

  const handleGenerate = async () => {
    if (!form.niche || !form.seedTopic) return alert('Niche and Seed Topic are required.');
    setGenerating(true);
    setResults(null);

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
          max_tokens: 1500,
          system: 'You are an SEO keyword research assistant. Return ONLY valid JSON.',
          messages: [{ role: 'user', content: KW_PROMPT(form) }],
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const msg = await res.json();
      const parsed = JSON.parse(msg.content[0].text);
      setResults(parsed);

      // Save to DB
      await supabase.from('keyword_research').insert({
        client_name: form.client, niche: form.niche,
        seed_topic: form.seedTopic, results_json: parsed,
      });
      supabase.from('keyword_research').select('id, client_name, seed_topic, created_at')
        .order('created_at', { ascending: false }).limit(10)
        .then(({ data }) => setHistory(data || []));
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setGenerating(false);
  };

  const handleLoadSession = async (id) => {
    const { data } = await supabase.from('keyword_research').select('*').eq('id', id).single();
    if (data) {
      setResults(data.results_json);
      setForm(f => ({ ...f, client: data.client_name || f.client, niche: data.niche || '', seedTopic: data.seed_topic || '' }));
    }
  };

  const intentColors = {
    Informational: 'bg-blue-50 text-blue-600',
    Navigational: 'bg-purple-50 text-purple-600',
    Commercial: 'bg-orange-50 text-orange-600',
    Transactional: 'bg-green-50 text-green-600',
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-[#1a1a1a]">Keyword Research Assistant</h1>
          <p className="text-[11px] text-gray-400">AI first-pass keyword brainstorm per client niche</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
          {/* Left: Input */}
          <div className="flex flex-col gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold mb-3">Research Input</h2>
              <div className="space-y-3">
                <div><Label>Client</Label><select value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} className="input-field">{clients.map(c => <option key={c}>{c}</option>)}<option value="">Other</option></select></div>
                <div><Label>Niche / Industry</Label><input value={form.niche} onChange={e => setForm(f => ({ ...f, niche: e.target.value }))} placeholder="e.g. mortgage broker Brisbane" className="input-field" /></div>
                <div><Label>Seed Topic</Label><input value={form.seedTopic} onChange={e => setForm(f => ({ ...f, seedTopic: e.target.value }))} placeholder="e.g. first home buyer" className="input-field" /></div>
                <div>
                  <Label>Content Goal</Label>
                  <div className="flex gap-2">
                    {['Blog Post', 'SEO Page', 'Both'].map(g => (
                      <label key={g} className="flex items-center gap-1 text-[11px] cursor-pointer">
                        <input type="radio" name="goal" checked={form.contentGoal === g} onChange={() => setForm(f => ({ ...f, contentGoal: g }))} className="accent-[#F5C518]" />{g}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Preference</Label>
                  <select value={form.preference} onChange={e => setForm(f => ({ ...f, preference: e.target.value }))} className="input-field">
                    <option>Balanced</option><option>Low KD focus</option><option>High SV focus</option>
                  </select>
                </div>
                <button onClick={handleGenerate} disabled={generating} className="btn-primary w-full py-2.5">
                  {generating ? 'Researching...' : 'Generate Keywords'}
                </button>
              </div>
            </div>

            {history.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Recent Sessions</h3>
                {history.map(h => (
                  <div key={h.id} onClick={() => handleLoadSession(h.id)} className="py-1.5 border-b border-gray-100 last:border-0 cursor-pointer hover:text-[#F5C518] text-[11px]">
                    <div className="font-medium text-gray-700">{h.seed_topic}</div>
                    <div className="text-[9px] text-gray-400">{h.client_name} · {new Date(h.created_at).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Results */}
          <div>
            {!results && !generating ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center h-64 text-center text-gray-400">
                <div className="text-3xl mb-2 opacity-30">🔑</div>
                <p className="text-sm">Enter a niche and seed topic to generate keyword ideas</p>
              </div>
            ) : generating ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center h-64 text-gray-500">
                <div className="w-6 h-6 border-2 border-gray-200 border-t-[#F5C518] rounded-full animate-spin mb-3" />
                <p className="text-sm">Researching keywords...</p>
              </div>
            ) : (
              <>
                {/* Keyword table */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-[#f8f8f6] border-b border-gray-200">
                        <th className="text-left px-3 py-2 font-semibold text-gray-500">Keyword Idea</th>
                        <th className="text-left px-3 py-2 font-semibold text-gray-500">Intent</th>
                        <th className="text-left px-3 py-2 font-semibold text-gray-500">Type</th>
                        <th className="text-left px-3 py-2 font-semibold text-gray-500">Suggested Title</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.keywords?.map((kw, i) => (
                        <tr key={i} className="border-b border-gray-100 hover:bg-[#f8f8f6]">
                          <td className="px-3 py-2.5 font-medium text-[#1a1a1a]">{kw.keyword}</td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${intentColors[kw.intent] || 'bg-gray-100 text-gray-500'}`}>
                              {kw.intent}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-500">{kw.content_type}</td>
                          <td className="px-3 py-2.5 text-gray-600 max-w-[250px]">{kw.suggested_title}</td>
                          <td className="px-3 py-2.5">
                            <button onClick={() => setAddKw(kw)} className="text-[10px] text-[#F5C518] font-semibold bg-transparent border border-[#F5C518] rounded px-2 py-0.5 cursor-pointer hover:bg-[#F5C518] hover:text-[#1a1a1a]">
                              Add to Plan
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Quick wins + Cannibalization */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {results.quick_wins?.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-wider text-green-600 mb-2">Quick Wins</h3>
                      {results.quick_wins.map((w, i) => (
                        <div key={i} className="flex items-start gap-2 mb-1.5 text-[11px]">
                          <span className="text-green-600 shrink-0">★</span>
                          <span className="text-gray-700">{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {results.cannibalization_risks && (
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-wider text-orange-500 mb-2">Cannibalization Risks</h3>
                      <p className="text-[11px] text-gray-700 leading-relaxed">{results.cannibalization_risks}</p>
                    </div>
                  )}
                </div>

                {/* Disclaimer */}
                <div className="mt-4 p-3 bg-[#f8f8f6] rounded-lg text-[10px] text-gray-500 leading-relaxed">
                  These keyword ideas are AI-generated starting points. Always verify SV and KD in Wincher or Ahrefs before adding to the content plan.
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <AddToPlanModal open={!!addKw} onClose={() => setAddKw(null)} keyword={addKw} clients={clients.length ? clients : ['Client 1']} />

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
