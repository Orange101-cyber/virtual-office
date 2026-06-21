import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import * as dfs from '../lib/dataForSeo';
import toast from 'react-hot-toast';

const SORT_PROMPT = ({ client, niche, seedTopic, contentGoal, preference, keywords, pastKeywords, plannedKeywords }) => `You are an SEO keyword research analyst for an Australian digital marketing agency.

I have pulled ${keywords.length} real keywords from DataForSEO for this client. Your job is to analyse them, pick the best ~20 candidates, suggest article titles, and flag opportunities.

Client: ${client}
Industry/Niche: ${niche}
Seed Topic: ${seedTopic}
Content Goal: ${contentGoal}
Preference: ${preference}

${pastKeywords?.length ? `PAST CLIENT KEYWORDS (already targeted — flag as cannibalization risk if overlapping):
${pastKeywords.join(', ')}
` : ''}

${plannedKeywords?.length ? `ALREADY PLANNED KEYWORDS (skip these — already in content plan):
${plannedKeywords.join(', ')}
` : ''}

REAL KEYWORDS WITH DATA (sorted by search volume):
${keywords.slice(0, 100).map(k => `- "${k.keyword}" (SV: ${k.search_volume}, KD: ${k.kd}, CPC: $${k.cpc?.toFixed(2) || 0})`).join('\n')}

Return ONLY valid JSON with this exact structure. Pick the 15-20 best keywords considering relevance to the client niche, search volume, keyword difficulty, and the preference setting (${preference}). Exclude keywords that are already planned or too similar to past keywords (unless useful as refresh candidates).

CRITICAL: You MUST only pick keywords from the REAL KEYWORDS list above. Do NOT invent or suggest keywords that are not in the list — they will be filtered out. Every keyword must have real search volume > 0.

{
  "keywords": [
    {
      "keyword": "exact keyword from the list above",
      "intent": "Informational | Navigational | Commercial | Transactional",
      "content_type": "Blog | SEO Page",
      "suggested_title": "Full article title suggestion for Australian audience",
      "opportunity_reason": "One-line reason why this is a good pick"
    }
  ],
  "cannibalization_risks": "Brief note on any keywords that could clash with past content or each other",
  "quick_wins": ["keyword - specific reason (e.g. low KD + decent SV)", "keyword - reason", "keyword - reason"]
}`;

function AddToPlanModal({ open, onClose, keyword, clients, selectedClient }) {
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
        client_name: selectedClient || clients[0] || '',
      }));
    }
  }, [open, keyword, clients]);

  const handleSave = async () => {
    await supabase.from('content_plans').insert({
      client_name: form.client_name,
      quarter: form.quarter,
      month: form.month,
      content_type: form.content_type === 'SEO Page' ? 'SEO Page' : 'Blog',
      title: form.title,
      is_refresh: false,
      focus_keyword: form.focus_keyword,
      search_volume: keyword?.search_volume || null,
      kd: keyword?.kd || null,
      status: 'Planned',
    });
    onClose();
    toast.success('Added to Content Plan!');
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
  const [fetchingMetrics, setFetchingMetrics] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [history, setHistory] = useState([]);
  const [addKw, setAddKw] = useState(null);
  // New features
  const [planningQuarter, setPlanningQuarter] = useState(false);
  const [quarterPlan, setQuarterPlan] = useState(null);
  const [clustering, setClustering] = useState(false);
  const [clusters, setClusters] = useState(null);
  const [competitorDomain, setCompetitorDomain] = useState('');
  const [competitorKeywords, setCompetitorKeywords] = useState(null);
  const [loadingCompetitor, setLoadingCompetitor] = useState(false);
  const [brandVoice, setBrandVoice] = useState(null);

  useEffect(() => {
    const fromDb = dbClients.map(c => c.name);
    supabase.from('content_plans').select('client_name').then(({ data }) => {
      const fromPlans = data ? data.map(d => d.client_name) : [];
      const unique = [...new Set([...fromDb, ...fromPlans])].filter(Boolean).sort();
      setClients(unique);
      if (unique.length && !form.client) setForm(f => ({ ...f, client: unique[0] }));
    });
  }, [dbClients]);

  // Load history filtered by selected client
  const loadHistory = (clientName) => {
    let query = supabase.from('keyword_research').select('id, client_name, seed_topic, niche, created_at')
      .order('created_at', { ascending: false }).limit(20);
    if (clientName) query = query.eq('client_name', clientName);
    query.then(({ data }) => setHistory(data || []));
  };

  useEffect(() => {
    loadHistory(form.client);
    // Load brand voice for competitor list + context
    if (form.client) {
      supabase.from('client_brand_voice')
        .select('competitors, services, target_personas, business_goals, locations_served, business_description')
        .eq('client_name', form.client).single()
        .then(({ data }) => setBrandVoice(data || null))
        .catch(() => setBrandVoice(null));
    }
  }, [form.client]);

  const [genStep, setGenStep] = useState('');

  const handleGenerate = async () => {
    if (!form.niche || !form.seedTopic) return toast.error('Niche and Seed Topic are required.');
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured. Check your credentials.');

    setGenerating(true);
    setResults(null);

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) { toast.error('Anthropic API key not set'); setGenerating(false); return; }

    try {
      // ── STEP 1: Load client's past keywords (for cannibalization filter) ──
      setGenStep('Loading client history...');
      let pastKeywords = [];
      const dbClient = dbClients.find(c => c.name === form.client);
      if (dbClient?.id) {
        const { data } = await supabase.from('clients')
          .select('past_keywords').eq('id', dbClient.id).single();
        if (data?.past_keywords) {
          pastKeywords = data.past_keywords.split('\n').map(k => k.trim().toLowerCase()).filter(Boolean);
        }
      }

      // ── STEP 2: Load already-planned keywords from content_plans ──
      const { data: planned } = await supabase.from('content_plans')
        .select('focus_keyword').eq('client_name', form.client);
      const plannedKeywords = (planned || [])
        .map(p => p.focus_keyword?.toLowerCase().trim())
        .filter(Boolean);

      // ── STEP 3: Pull real keywords from DataForSEO (3 sources) ──
      setGenStep('Fetching real keywords from DataForSEO...');
      const [related, suggestions, ideas] = await Promise.all([
        dfs.getRelatedKeywords(form.seedTopic, 50).catch(() => []),
        dfs.getKeywordSuggestions(form.seedTopic, 50).catch(() => []),
        dfs.getKeywordIdeas([form.seedTopic, form.niche], 50).catch(() => []),
      ]);

      // ── STEP 4: Merge, dedupe, filter ──
      setGenStep('Filtering and deduping...');
      const allKeywordsMap = new Map();
      [...related, ...suggestions, ...ideas].forEach(kw => {
        if (!kw.keyword) return;
        const key = kw.keyword.toLowerCase().trim();
        const existing = allKeywordsMap.get(key);
        if (!existing || (kw.search_volume > existing.search_volume)) {
          allKeywordsMap.set(key, kw);
        }
      });

      // Filter out already-planned keywords
      const filtered = Array.from(allKeywordsMap.values())
        .filter(kw => {
          const lower = kw.keyword.toLowerCase();
          // Skip if exact match in planned keywords
          if (plannedKeywords.includes(lower)) return false;
          return true;
        })
        // Sort by SV descending
        .sort((a, b) => (b.search_volume || 0) - (a.search_volume || 0));

      if (filtered.length === 0) {
        toast.error('No keywords found. Try a different seed topic.');
        setGenerating(false);
        setGenStep('');
        return;
      }

      // ── STEP 5: Claude sorts, picks best, suggests titles ──
      setGenStep(`Analysing ${filtered.length} keywords with AI...`);
      const prompt = SORT_PROMPT({
        ...form,
        keywords: filtered,
        pastKeywords,
        plannedKeywords,
      });

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 3000,
          system: 'You are an SEO keyword research analyst. Return ONLY valid JSON, no markdown fences.',
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) throw new Error(`Claude API error ${res.status}`);
      const msg = await res.json();
      let rawText = msg.content[0].text;
      rawText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      const parsed = JSON.parse(rawText);

      // Enrich the Claude results with the real metrics we already have
      setGenStep('Validating keywords with real metrics...');
      const metricsMap = {};
      filtered.forEach(k => { metricsMap[k.keyword.toLowerCase()] = k; });
      let enriched = (parsed.keywords || []).map(k => {
        const m = metricsMap[k.keyword.toLowerCase()];
        return m ? {
          ...k,
          search_volume: m.search_volume,
          kd: m.kd,
          cpc: m.cpc,
          real_data: true,
        } : k;
      });

      // Validate any keywords Claude invented (not in our DataForSEO pool)
      const unverified = enriched.filter(k => !k.real_data);
      if (unverified.length > 0 && dfs.isConfigured()) {
        try {
          const extraMetrics = await dfs.getKeywordMetrics(unverified.map(k => k.keyword));
          const extraMap = {};
          extraMetrics.forEach(m => { extraMap[m.keyword.toLowerCase()] = m; });
          enriched = enriched.map(k => {
            if (k.real_data) return k;
            const m = extraMap[k.keyword.toLowerCase()];
            return m ? { ...k, search_volume: m.search_volume, kd: m.kd, cpc: m.cpc, real_data: true } : k;
          });
        } catch { /* non-critical */ }
      }

      // Filter out 0 SV keywords — these won't rank
      const beforeCount = enriched.length;
      enriched = enriched.filter(k => !k.real_data || k.search_volume > 0);
      const droppedCount = beforeCount - enriched.length;

      const finalResults = {
        ...parsed,
        keywords: enriched,
        data_sources: {
          related: related.length,
          suggestions: suggestions.length,
          ideas: ideas.length,
          total_unique: filtered.length,
          past_filtered: pastKeywords.length,
          planned_filtered: plannedKeywords.length,
        },
      };
      setResults(finalResults);

      // Save to DB
      await supabase.from('keyword_research').insert({
        client_name: form.client, niche: form.niche,
        seed_topic: form.seedTopic, results_json: finalResults,
      });
      loadHistory(form.client);
      const summary = `Analysed ${filtered.length} keywords, picked ${enriched.length} best`;
      toast.success(droppedCount > 0 ? `${summary} (dropped ${droppedCount} with 0 SV)` : summary);
    } catch (err) {
      toast.error('Error: ' + err.message);
      console.error(err);
    }
    setGenerating(false);
    setGenStep('');
  };

  const handleFetchRealMetrics = async () => {
    if (!results?.keywords?.length) return;
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');
    setFetchingMetrics(true);
    try {
      const keywords = results.keywords.map(k => k.keyword);
      const metrics = await dfs.getKeywordMetrics(keywords);
      const metricsMap = {};
      metrics.forEach(m => { metricsMap[m.keyword.toLowerCase()] = m; });
      const enriched = results.keywords.map(k => {
        const m = metricsMap[k.keyword.toLowerCase()];
        return m ? {
          ...k,
          search_volume: m.search_volume,
          cpc: m.cpc,
          kd: m.kd,
          real_data: true,
        } : k;
      });
      setResults({ ...results, keywords: enriched });
      toast.success(`Fetched real metrics for ${metrics.length} keywords`);
    } catch (err) {
      toast.error('DataForSEO error: ' + err.message);
    }
    setFetchingMetrics(false);
  };

  const handleExpandWithRelated = async () => {
    if (!form.seedTopic) return toast.error('Enter a seed topic first');
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');
    setExpanding(true);
    try {
      const related = await dfs.getRelatedKeywords(form.seedTopic, 30);
      const newKeywords = related.map(r => ({
        keyword: r.keyword,
        intent: 'Informational',
        content_type: 'Blog',
        suggested_title: r.keyword.charAt(0).toUpperCase() + r.keyword.slice(1),
        search_volume: r.search_volume,
        cpc: r.cpc,
        kd: r.kd,
        real_data: true,
      }));
      const existing = results?.keywords || [];
      const existingKws = new Set(existing.map(k => k.keyword.toLowerCase()));
      const unique = newKeywords.filter(k => !existingKws.has(k.keyword.toLowerCase()));
      setResults({
        keywords: [...existing, ...unique],
        quick_wins: results?.quick_wins || [],
        cannibalization_risks: results?.cannibalization_risks || '',
      });
      toast.success(`Added ${unique.length} related keywords`);
    } catch (err) {
      toast.error('DataForSEO error: ' + err.message);
    }
    setExpanding(false);
  };

  const handleLoadSession = async (id) => {
    const { data } = await supabase.from('keyword_research').select('*').eq('id', id).single();
    if (data) {
      setResults(data.results_json);
      setForm(f => ({ ...f, client: data.client_name || f.client, niche: data.niche || '', seedTopic: data.seed_topic || '' }));
    }
  };

  // ── Plan Next Quarter ──
  const handlePlanQuarter = async () => {
    if (!form.client) return toast.error('Select a client first');
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) return toast.error('Anthropic API key not set');

    setPlanningQuarter(true);
    setQuarterPlan(null);
    try {
      // Gather all context
      const dbClient = dbClients.find(c => c.name === form.client);
      let existingPages = [];
      let pastKws = [];
      if (dbClient?.id) {
        const [pagesRes, kwRes] = await Promise.all([
          supabase.from('client_pages').select('url, focus_keyword, page_category, bucket').eq('client_name', form.client),
          supabase.from('clients').select('past_keywords').eq('id', dbClient.id).single(),
        ]);
        existingPages = pagesRes.data || [];
        pastKws = (kwRes.data?.past_keywords || '').split('\n').filter(Boolean);
      }
      const { data: planned } = await supabase.from('content_plans')
        .select('title, focus_keyword, status').eq('client_name', form.client);

      const prompt = `You are a senior SEO content strategist for an Australian digital marketing agency.

CLIENT: ${form.client}
${brandVoice ? `SERVICES: ${brandVoice.services || 'Not set'}
TARGET AUDIENCE: ${brandVoice.target_personas || 'Not set'}
BUSINESS GOALS: ${brandVoice.business_goals || 'Not set'}
LOCATIONS: ${brandVoice.locations_served || 'Not set'}
DESCRIPTION: ${brandVoice.business_description || 'Not set'}` : ''}

EXISTING PAGES (${existingPages.length}):
${existingPages.slice(0, 40).map(p => `- [${p.page_category}] ${p.focus_keyword || p.url} (bucket: ${p.bucket || 'none'})`).join('\n')}

PAST KEYWORDS TARGETED (${pastKws.length}):
${pastKws.slice(0, 30).join(', ')}

ALREADY IN CONTENT PLAN:
${(planned || []).slice(0, 20).map(p => `- "${p.title}" (${p.focus_keyword}) [${p.status}]`).join('\n')}

Based on this client's business, existing content, and gaps, recommend 8-12 articles for next quarter. For each, provide a target keyword, suggested title, content type, priority, and WHY it matters.

Focus on:
- Topics that fill gaps in their existing content
- Keywords with commercial or transactional intent (lead generation)
- Location-specific opportunities
- Content that supports their services
- Quick wins (low KD that they can realistically rank for)

Return ONLY valid JSON:
{
  "quarter_plan": [
    {
      "priority": 1,
      "keyword": "target keyword",
      "title": "Suggested article title",
      "content_type": "Blog | SEO Page",
      "difficulty": "Easy | Medium | Hard",
      "rationale": "Why this matters for the client"
    }
  ],
  "strategy_notes": "2-3 sentence overall strategy recommendation",
  "content_pillars": ["pillar 1", "pillar 2", "pillar 3"]
}`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 3000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const msg = await res.json();
      let text = msg.content?.[0]?.text || '';
      text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      const plan = JSON.parse(text);

      // Enrich with real SV/KD from DataForSEO
      if (dfs.isConfigured() && plan.quarter_plan?.length) {
        try {
          const kws = plan.quarter_plan.map(p => p.keyword).filter(Boolean);
          const metrics = await dfs.getKeywordMetrics(kws);
          const metricsMap = {};
          metrics.forEach(m => { metricsMap[m.keyword.toLowerCase()] = m; });
          plan.quarter_plan = plan.quarter_plan.map(item => {
            const m = metricsMap[item.keyword?.toLowerCase()];
            return m ? { ...item, search_volume: m.search_volume, kd: m.kd, cpc: m.cpc } : item;
          }).filter(item => item.search_volume == null || item.search_volume > 0);
        } catch { /* metrics are a bonus, don't fail the whole plan */ }
      }

      setQuarterPlan(plan);
      toast.success('Quarter plan generated');
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
    setPlanningQuarter(false);
  };

  // ── Keyword Clustering ──
  const handleCluster = async () => {
    if (!results?.keywords?.length) return toast.error('Run a research first');
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) return toast.error('Anthropic API key not set');

    setClustering(true);
    setClusters(null);
    try {
      const kwList = results.keywords.map(k =>
        `"${k.keyword}" (SV:${k.search_volume || 0}, KD:${k.kd || 0})`
      ).join('\n');

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          messages: [{ role: 'user', content: `Group these keywords into topic clusters. Each cluster should represent one article/page theme. Pick the best primary keyword for each cluster.

KEYWORDS:
${kwList}

Return ONLY valid JSON:
{
  "clusters": [
    {
      "name": "Topic Cluster Name",
      "primary_keyword": "best keyword for this cluster",
      "keywords": ["kw1", "kw2", "kw3"],
      "total_sv": 1234,
      "avg_kd": 25,
      "suggested_title": "Article title suggestion",
      "intent": "Informational | Commercial | Transactional"
    }
  ]
}` }],
        }),
      });
      const msg = await res.json();
      let text = msg.content?.[0]?.text || '';
      text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      const parsed = JSON.parse(text);
      setClusters(parsed.clusters || []);
      toast.success(`Grouped into ${(parsed.clusters || []).length} clusters`);
    } catch (err) {
      toast.error('Clustering error: ' + err.message);
    }
    setClustering(false);
  };

  // ── Competitor Gap Finder ──
  const handleCompetitorGap = async () => {
    if (!competitorDomain.trim()) return toast.error('Enter a competitor domain');
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');

    setLoadingCompetitor(true);
    setCompetitorKeywords(null);
    try {
      toast('Fetching competitor keywords...');
      const compKws = await dfs.getRankedKeywordsForDomain(competitorDomain.trim(), 100);
      if (!compKws.length) {
        toast.error('No ranked keywords found for this domain');
        setLoadingCompetitor(false);
        return;
      }

      // Get client's existing keywords to find gaps
      const dbClient = dbClients.find(c => c.name === form.client);
      let clientKws = new Set();
      if (dbClient?.id) {
        const { data: pages } = await supabase.from('client_pages')
          .select('focus_keyword').eq('client_name', form.client);
        const { data: client } = await supabase.from('clients')
          .select('past_keywords').eq('id', dbClient.id).single();
        (pages || []).forEach(p => { if (p.focus_keyword) clientKws.add(p.focus_keyword.toLowerCase()); });
        (client?.past_keywords || '').split('\n').forEach(k => { if (k.trim()) clientKws.add(k.trim().toLowerCase()); });
      }

      // Filter to gaps: keywords competitor ranks for that client doesn't target
      const gaps = compKws
        .filter(k => !clientKws.has(k.keyword.toLowerCase()))
        .filter(k => k.search_volume > 0)
        .sort((a, b) => b.search_volume - a.search_volume);

      setCompetitorKeywords({
        domain: competitorDomain.trim(),
        total: compKws.length,
        gaps,
        overlap: compKws.length - gaps.length,
      });
      toast.success(`Found ${gaps.length} keyword gaps`);
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
    setLoadingCompetitor(false);
  };

  // Competitor list from brand voice
  const brandCompetitors = (brandVoice?.competitors || '').split('\n').map(c => c.trim()).filter(Boolean);

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
                  {generating ? (genStep || 'Researching...') : '🔍 Smart Research'}
                </button>
              </div>
            </div>

            {/* Plan Next Quarter */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold mb-1">📅 Plan Next Quarter</h2>
              <p className="text-[10px] text-gray-400 mb-3">AI analyses existing content, gaps, and opportunities to recommend 8-12 articles</p>
              <button onClick={handlePlanQuarter} disabled={planningQuarter || !form.client} className="btn-primary w-full py-2">
                {planningQuarter ? 'Planning...' : '📅 Generate Quarter Plan'}
              </button>
            </div>

            {/* Competitor Gap Finder */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold mb-1">⚔️ Competitor Gap</h2>
              <p className="text-[10px] text-gray-400 mb-3">Find keywords competitors rank for that you don't</p>
              <div className="space-y-2">
                {brandCompetitors.length > 0 && (
                  <div>
                    <Label>From Brand Voice</Label>
                    <select
                      value=""
                      onChange={(e) => { if (e.target.value) setCompetitorDomain(e.target.value); }}
                      className="input-field"
                    >
                      <option value="">Select competitor...</option>
                      {brandCompetitors.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <Label>Competitor Domain</Label>
                  <input
                    value={competitorDomain}
                    onChange={e => setCompetitorDomain(e.target.value)}
                    placeholder="e.g. competitor.com.au"
                    className="input-field"
                  />
                </div>
                <button onClick={handleCompetitorGap} disabled={loadingCompetitor || !competitorDomain.trim()} className="btn-primary w-full py-2">
                  {loadingCompetitor ? 'Analysing...' : '⚔️ Find Gaps'}
                </button>
              </div>
            </div>

            {history.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    {form.client ? `${form.client} Research` : 'Recent Sessions'}
                  </h3>
                  <span className="text-[9px] text-gray-400">{history.length}</span>
                </div>
                {history.map(h => (
                  <div key={h.id} className="flex items-center gap-1 py-1.5 border-b border-gray-100 last:border-0 group">
                    <div onClick={() => handleLoadSession(h.id)} className="flex-1 min-w-0 cursor-pointer hover:text-[#F5C518] text-[11px]">
                      <div className="font-medium text-gray-700">{h.seed_topic}</div>
                      <div className="text-[9px] text-gray-400">{h.niche || h.client_name} · {new Date(h.created_at).toLocaleDateString()}</div>
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm('Delete this research session?')) return;
                        await supabase.from('keyword_research').delete().eq('id', h.id);
                        setHistory(prev => prev.filter(item => item.id !== h.id));
                        toast.success('Session deleted');
                      }}
                      className="bg-transparent border-none text-gray-300 cursor-pointer text-[10px] p-0 opacity-0 group-hover:opacity-100 hover:text-red-500 shrink-0"
                      title="Delete session"
                    >
                      ✕
                    </button>
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
                <p className="text-sm">{genStep || 'Researching keywords...'}</p>
                <p className="text-[10px] text-gray-400 mt-1">Real data from DataForSEO + AI analysis</p>
              </div>
            ) : (
              <>
                {/* Data sources info */}
                {results.data_sources && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 text-[11px] text-green-700">
                    <div className="font-semibold mb-1">✓ Real data from DataForSEO</div>
                    <div className="flex gap-3 flex-wrap text-[10px]">
                      <span>Related: <b>{results.data_sources.related}</b></span>
                      <span>Suggestions: <b>{results.data_sources.suggestions}</b></span>
                      <span>Ideas: <b>{results.data_sources.ideas}</b></span>
                      <span className="text-green-800">Total unique: <b>{results.data_sources.total_unique}</b></span>
                      {results.data_sources.past_filtered > 0 && (
                        <span className="text-gray-500">Past keywords checked: <b>{results.data_sources.past_filtered}</b></span>
                      )}
                      {results.data_sources.planned_filtered > 0 && (
                        <span className="text-gray-500">Already planned filtered: <b>{results.data_sources.planned_filtered}</b></span>
                      )}
                    </div>
                  </div>
                )}

                {/* Action bar */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <button
                    onClick={handleFetchRealMetrics}
                    disabled={fetchingMetrics}
                    className="text-[11px] bg-[#1a1a1a] text-white border-none rounded px-3 py-1.5 font-semibold cursor-pointer hover:bg-[#333] disabled:opacity-40"
                  >
                    {fetchingMetrics ? 'Fetching...' : '⚡ Refresh Metrics'}
                  </button>
                  <button
                    onClick={handleExpandWithRelated}
                    disabled={expanding}
                    className="text-[11px] bg-transparent border border-[#1a1a1a] text-[#1a1a1a] rounded px-3 py-1.5 font-semibold cursor-pointer hover:bg-[#1a1a1a] hover:text-white disabled:opacity-40"
                  >
                    {expanding ? 'Expanding...' : '+ Add More Related'}
                  </button>
                  <button
                    onClick={handleCluster}
                    disabled={clustering}
                    className="text-[11px] bg-transparent border border-purple-400 text-purple-700 rounded px-3 py-1.5 font-semibold cursor-pointer hover:bg-purple-600 hover:text-white disabled:opacity-40"
                  >
                    {clustering ? 'Clustering...' : '🗂 Cluster Topics'}
                  </button>
                  <span className="text-[10px] text-gray-400 ml-1">
                    {results.keywords?.filter(k => k.real_data).length || 0} / {results.keywords?.length || 0} with real data
                  </span>
                </div>

                {/* Keyword table */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-[#f8f8f6] border-b border-gray-200">
                        <th className="text-left px-3 py-2 font-semibold text-gray-500">Keyword</th>
                        <th className="text-right px-2 py-2 font-semibold text-gray-500">SV</th>
                        <th className="text-right px-2 py-2 font-semibold text-gray-500">KD</th>
                        <th className="text-right px-2 py-2 font-semibold text-gray-500">CPC</th>
                        <th className="text-left px-2 py-2 font-semibold text-gray-500">Intent</th>
                        <th className="text-left px-3 py-2 font-semibold text-gray-500">Suggested Title</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.keywords?.map((kw, i) => (
                        <tr key={i} className="border-b border-gray-100 hover:bg-[#f8f8f6]">
                          <td className="px-3 py-2.5 font-medium text-[#1a1a1a]">
                            {kw.keyword}
                            {kw.real_data && <span className="ml-1 text-[8px] text-green-600" title="Real DataForSEO data">●</span>}
                          </td>
                          <td className="px-2 py-2.5 text-right text-gray-700 font-semibold">
                            {kw.search_volume != null ? kw.search_volume.toLocaleString() : '—'}
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            {kw.kd != null ? (
                              <span className={`font-semibold ${kw.kd <= 20 ? 'text-green-600' : kw.kd <= 50 ? 'text-orange-500' : 'text-red-500'}`}>
                                {kw.kd}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-2 py-2.5 text-right text-gray-500">
                            {kw.cpc != null && kw.cpc > 0 ? `$${Number(kw.cpc).toFixed(2)}` : '—'}
                          </td>
                          <td className="px-2 py-2.5">
                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${intentColors[kw.intent] || 'bg-gray-100 text-gray-500'}`}>
                              {kw.intent}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 max-w-[250px]">
                            <div className="truncate" title={kw.suggested_title}>{kw.suggested_title}</div>
                            {kw.opportunity_reason && (
                              <div className="text-[9px] text-[#F5C518] truncate mt-0.5" title={kw.opportunity_reason}>
                                ★ {kw.opportunity_reason}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <button onClick={() => setAddKw(kw)} className="text-[10px] text-[#F5C518] font-semibold bg-transparent border border-[#F5C518] rounded px-2 py-0.5 cursor-pointer hover:bg-[#F5C518] hover:text-[#1a1a1a]">
                              + Plan
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

                {/* Keyword Clusters */}
                {clusters && clusters.length > 0 && (
                  <div className="bg-white border border-purple-200 rounded-xl p-4 mb-4">
                    <div className="text-[10px] font-bold uppercase text-purple-600 mb-3">🗂 Topic Clusters ({clusters.length})</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {clusters.map((cl, i) => (
                        <div key={i} className="bg-purple-50/50 border border-purple-100 rounded-lg p-3">
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div>
                              <div className="text-[12px] font-bold text-[#1a1a1a]">{cl.name}</div>
                              <div className="text-[10px] text-purple-600 font-semibold">Primary: {cl.primary_keyword}</div>
                            </div>
                            <div className="flex gap-2 text-[9px] text-gray-500 shrink-0">
                              <span>SV: <b>{cl.total_sv?.toLocaleString()}</b></span>
                              <span>KD: <b>{cl.avg_kd}</b></span>
                            </div>
                          </div>
                          {cl.suggested_title && (
                            <div className="text-[10px] text-gray-600 mb-1.5 italic">"{cl.suggested_title}"</div>
                          )}
                          <div className="flex flex-wrap gap-1">
                            {cl.keywords.map((kw, j) => (
                              <span key={j} className="text-[9px] bg-white border border-purple-200 text-gray-700 px-1.5 py-0.5 rounded">{kw}</span>
                            ))}
                          </div>
                          <button
                            onClick={() => setAddKw({ keyword: cl.primary_keyword, suggested_title: cl.suggested_title, content_type: 'Blog', search_volume: cl.total_sv, kd: cl.avg_kd })}
                            className="mt-2 text-[10px] text-[#F5C518] font-semibold bg-transparent border border-[#F5C518] rounded px-2 py-0.5 cursor-pointer hover:bg-[#F5C518] hover:text-[#1a1a1a]"
                          >
                            + Plan this cluster
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Disclaimer */}
                <div className="mt-4 p-3 bg-[#f8f8f6] rounded-lg text-[10px] text-gray-500 leading-relaxed">
                  These keyword ideas are AI-generated starting points. Always verify SV and KD in Wincher or Ahrefs before adding to the content plan.
                </div>
              </>
            )}

            {/* Quarter Plan Results */}
            {quarterPlan && (
              <div className="bg-white border border-[#F5C518] rounded-xl p-5 mt-4">
                <div className="text-[10px] font-bold uppercase text-[#F5C518] mb-1">📅 Quarterly Content Plan — {form.client}</div>
                {quarterPlan.strategy_notes && (
                  <div className="text-[11px] text-gray-600 mb-3 leading-relaxed bg-[#f8f8f6] rounded p-2.5">{quarterPlan.strategy_notes}</div>
                )}
                {quarterPlan.content_pillars?.length > 0 && (
                  <div className="flex gap-1.5 mb-3 flex-wrap">
                    {quarterPlan.content_pillars.map((p, i) => (
                      <span key={i} className="text-[10px] bg-[#F5C518]/20 text-[#1a1a1a] font-semibold px-2 py-0.5 rounded-full">{p}</span>
                    ))}
                  </div>
                )}
                <div className="space-y-2">
                  {(quarterPlan.quarter_plan || []).map((item, i) => (
                    <div key={i} className="flex items-start gap-3 bg-[#f8f8f6] rounded-lg p-3 hover:bg-gray-100 transition-colors">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        item.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
                        item.difficulty === 'Hard' ? 'bg-red-100 text-red-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>{item.priority}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold text-[#1a1a1a]">{item.title}</div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[9px] font-bold text-[#F5C518] bg-[#F5C518]/10 px-1.5 py-0.5 rounded">{item.keyword}</span>
                          {item.search_volume != null && (
                            <span className="text-[9px] text-gray-500">SV: <b className="text-[#1a1a1a]">{item.search_volume.toLocaleString()}</b></span>
                          )}
                          {item.kd != null && (
                            <span className="text-[9px] text-gray-500">KD: <b className={item.kd <= 20 ? 'text-green-600' : item.kd <= 50 ? 'text-orange-500' : 'text-red-500'}>{item.kd}</b></span>
                          )}
                          {item.cpc != null && item.cpc > 0 && (
                            <span className="text-[9px] text-gray-400">CPC: ${Number(item.cpc).toFixed(2)}</span>
                          )}
                          <span className="text-[9px] text-gray-500">{item.content_type}</span>
                          <span className={`text-[9px] font-bold ${item.difficulty === 'Easy' ? 'text-green-600' : item.difficulty === 'Hard' ? 'text-red-500' : 'text-orange-500'}`}>
                            {item.difficulty}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1 leading-snug">{item.rationale}</div>
                      </div>
                      <button
                        onClick={() => setAddKw({ keyword: item.keyword, suggested_title: item.title, content_type: item.content_type, search_volume: item.search_volume, kd: item.kd })}
                        className="shrink-0 text-[10px] text-[#F5C518] font-semibold bg-transparent border border-[#F5C518] rounded px-2 py-0.5 cursor-pointer hover:bg-[#F5C518] hover:text-[#1a1a1a]"
                      >
                        + Plan
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Competitor Gap Results */}
            {competitorKeywords && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-red-600">⚔️ Competitor Gap — {competitorKeywords.domain}</div>
                    <div className="text-[10px] text-gray-400">
                      {competitorKeywords.total} keywords found · {competitorKeywords.gaps.length} gaps · {competitorKeywords.overlap} overlap
                    </div>
                  </div>
                  <button onClick={() => setCompetitorKeywords(null)}
                    className="text-[10px] text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer">✕ Close</button>
                </div>
                {competitorKeywords.gaps.length === 0 ? (
                  <div className="text-[11px] text-gray-500 text-center py-4">No gaps found — you already target similar keywords</div>
                ) : (
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead><tr className="bg-[#f8f8f6] border-b border-gray-200">
                        <th className="text-left px-3 py-2 font-semibold text-gray-500">Keyword Gap</th>
                        <th className="text-right px-2 py-2 font-semibold text-gray-500">SV</th>
                        <th className="text-right px-2 py-2 font-semibold text-gray-500">KD</th>
                        <th className="text-right px-2 py-2 font-semibold text-gray-500">Their Rank</th>
                        <th className="px-3 py-2"></th>
                      </tr></thead>
                      <tbody>
                        {competitorKeywords.gaps.slice(0, 30).map((kw, i) => (
                          <tr key={i} className="border-b border-gray-100 hover:bg-[#f8f8f6]">
                            <td className="px-3 py-2 font-medium text-[#1a1a1a]">{kw.keyword}</td>
                            <td className="px-2 py-2 text-right text-gray-700 font-semibold">{kw.search_volume?.toLocaleString()}</td>
                            <td className="px-2 py-2 text-right">
                              <span className={`font-semibold ${kw.kd <= 20 ? 'text-green-600' : kw.kd <= 50 ? 'text-orange-500' : 'text-red-500'}`}>{kw.kd}</span>
                            </td>
                            <td className="px-2 py-2 text-right text-gray-500">#{kw.rank}</td>
                            <td className="px-3 py-2">
                              <button onClick={() => setAddKw({ keyword: kw.keyword, suggested_title: kw.keyword.charAt(0).toUpperCase() + kw.keyword.slice(1), content_type: 'Blog', search_volume: kw.search_volume, kd: kw.kd })}
                                className="text-[10px] text-[#F5C518] font-semibold bg-transparent border border-[#F5C518] rounded px-2 py-0.5 cursor-pointer hover:bg-[#F5C518] hover:text-[#1a1a1a]">
                                + Plan
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {competitorKeywords.gaps.length > 30 && (
                      <div className="text-center py-2 text-[9px] text-gray-400">Showing top 30 of {competitorKeywords.gaps.length} gaps</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <AddToPlanModal open={!!addKw} onClose={() => setAddKw(null)} keyword={addKw} clients={clients.length ? clients : ['Client 1']} selectedClient={form.client} />

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
