import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import * as dfs from '../lib/dataForSeo';
import toast from 'react-hot-toast';

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = (clientContext) => `You are an expert SEO content strategist for Campaigns You Love (CYL), an Australian digital marketing agency. You help Rowena and the content team plan quarterly content strategies, find keyword opportunities, identify refresh candidates, and maximise SEO results for each client.

You have access to LIVE tools — when discussing keywords, search volume, or competitors, you MUST use tools to fetch real data. Never guess metrics.

${clientContext ? `ACTIVE CLIENT CONTEXT:\n${clientContext}\n` : 'No client selected — give general SEO advice.'}

━━━ QUARTERLY CONTENT PLANNING ━━━
When helping plan content for a quarter:
1. First call get_planned_keywords to see what is already in the pipeline (avoid duplication)
2. Call get_refresh_opportunities to identify existing pages that need updating — refreshes often outperform new content
3. Use get_related_keywords to find gap opportunities based on the client's services
4. For every keyword suggested, call get_keyword_metrics for real SV + KD — never estimate these
5. Call check_cannibalization on every keyword before recommending it
6. Present suggestions in a clear table: Keyword | SV | KD | Type (New/Refresh) | Rationale

━━━ KEYWORD SELECTION RULES ━━━
- New content: prioritise SV > 100, KD < 40 (unless client is an authority site)
- For high-KD keywords (KD > 60): suggest long-tail variants instead — use get_related_keywords
- SV < 50: only worth targeting if highly commercial (buyer intent) or hyper-local
- Always balance the quarter across a mix of KD levels — not all easy, not all hard
- Prefer keywords with clear commercial or local intent for service businesses

━━━ CANNIBALIZATION RULES (CRITICAL) ━━━
- ALWAYS run check_cannibalization before recommending any keyword
- If a keyword is already in the bucket list: recommend a REFRESH of the existing page, NOT new content — the URL will be shown in the cannibalization result
- "commercial roller shutters" and "roller shutters commercial" target the same intent — flag semantic overlaps too
- If a keyword is in the content plan but not yet live, flag it as already planned
- Never suggest two pieces targeting the same search intent in the same quarter

━━━ REFRESH vs NEW CONTENT ━━━
- Pages that already rank (even #11–30) are better candidates for a refresh than writing new content on the same topic
- Use get_refresh_opportunities to surface overdue pages from the bucket list
- When recommending a refresh, always include the existing URL so it can be pre-filled in the content plan

━━━ RESPONSE STYLE ━━━
- Australian English always (optimise, analyse, colour, favour)
- Be concise and actionable — Rowena is busy
- When listing keywords, always show: Keyword | SV | KD | Type | Notes
- Use ⚠️ CANNIBALIZATION RISK and ✅ CLEAR labels prominently
- Cite data source: DataForSEO (real) or Knowledge (estimated)
- End planning sessions with a prioritised shortlist ready to add to the content plan`;

const TOOLS = [
  {
    name: 'get_keyword_metrics',
    description: 'Get real search volume, keyword difficulty, and CPC for one or more keywords from DataForSEO. Use this whenever the user asks about a keyword, search volume, or difficulty.',
    input_schema: {
      type: 'object',
      properties: {
        keywords: { type: 'array', items: { type: 'string' }, description: 'List of keywords to check' }
      },
      required: ['keywords']
    }
  },
  {
    name: 'check_cannibalization',
    description: 'Check if a keyword has already been targeted by this client. Checks both the keyword bank and bucket list.',
    input_schema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'The keyword to check' }
      },
      required: ['keyword']
    }
  },
  {
    name: 'get_related_keywords',
    description: 'Get related keyword suggestions for a seed topic from DataForSEO.',
    input_schema: {
      type: 'object',
      properties: {
        seed: { type: 'string', description: 'Seed keyword or topic' }
      },
      required: ['seed']
    }
  },
  {
    name: 'get_serp_features',
    description: 'Check what SERP features Google shows for a keyword (featured snippets, PAA, video, etc).',
    input_schema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'The keyword to check SERP features for' }
      },
      required: ['keyword']
    }
  },
  {
    name: 'get_competitor_keywords',
    description: 'Get keywords a competitor domain ranks for.',
    input_schema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Competitor domain (e.g. competitor.com.au)' }
      },
      required: ['domain']
    }
  },
  {
    name: 'get_refresh_opportunities',
    description: 'Get pages from the client bucket list that are candidates for a content refresh — pages that exist but may be outdated or have never been refreshed. Use this when planning quarterly content to identify refresh vs new content opportunities.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_planned_keywords',
    description: 'Get keywords already in the content plan for this client (Planned, Researched, Briefed, or Client Approved). Use this at the start of quarterly planning to avoid duplicating content already in the pipeline.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
];

async function executeTool(toolName, input, clientData) {
  switch (toolName) {
    case 'get_keyword_metrics': {
      if (!dfs.isConfigured()) return { error: 'DataForSEO not configured' };
      const metrics = await dfs.getKeywordMetrics(input.keywords);
      return { keywords: metrics.map(m => ({ keyword: m.keyword, search_volume: m.search_volume, kd: m.kd, cpc: m.cpc })) };
    }
    case 'check_cannibalization': {
      const kw = input.keyword.toLowerCase().trim();
      // Word-overlap scoring: keywords share significant words (not just substring)
      const kwWords = new Set(kw.split(/\s+/).filter(w => w.length > 2));
      const overlapScore = (other) => {
        const otherWords = other.toLowerCase().trim().split(/\s+/).filter(w => w.length > 2);
        if (!otherWords.length || !kwWords.size) return 0;
        const shared = otherWords.filter(w => kwWords.has(w)).length;
        return shared / Math.max(kwWords.size, otherWords.length);
      };
      const THRESHOLD = 0.5; // 50% word overlap = cannibalization risk

      const pastKws = (clientData.pastKeywords || []).map(k => k.toLowerCase());
      // Exact match or high word overlap for past keywords
      const inBank = pastKws.some(p => p === kw || overlapScore(p) >= THRESHOLD);
      const matchingPage = (clientData.pages || []).find(p => {
        const pk = (p.focus_keyword || '').toLowerCase().trim();
        return pk && (pk === kw || overlapScore(pk) >= THRESHOLD);
      });
      const inPages = !!matchingPage;
      const plannedMatch = (clientData.contentPlan || []).find(p => {
        const pk = (p.focus_keyword || '').toLowerCase().trim();
        return pk && (pk === kw || overlapScore(pk) >= THRESHOLD);
      });
      const result = {
        keyword: kw,
        already_targeted: inBank || inPages || !!plannedMatch,
        in_keyword_bank: inBank,
        in_bucket_list: inPages,
        in_content_plan: !!plannedMatch,
      };
      if (matchingPage) {
        result.existing_page = { url: matchingPage.url, focus_keyword: matchingPage.focus_keyword, category: matchingPage.page_category };
        result.recommendation = `REFRESH the existing page at ${matchingPage.url} rather than creating new content`;
      } else if (plannedMatch) {
        result.recommendation = `Already planned: "${plannedMatch.title}" [${plannedMatch.status}] — avoid duplicating`;
      } else if (inBank) {
        result.recommendation = 'Keyword is in the past keyword bank — check if an existing page covers this topic';
      } else {
        result.recommendation = 'Keyword is available — safe to plan new content';
      }
      result.warning = (inBank || inPages || !!plannedMatch) ? 'CANNIBALIZATION RISK — see recommendation above' : '✅ Clear — no conflicts found';
      return result;
    }
    case 'get_related_keywords': {
      if (!dfs.isConfigured()) return { error: 'DataForSEO not configured' };
      const related = await dfs.getRelatedKeywords(input.seed, 20);
      return { seed: input.seed, related: related.map(r => ({ keyword: r.keyword, sv: r.search_volume, kd: r.kd })) };
    }
    case 'get_serp_features': {
      if (!dfs.isConfigured()) return { error: 'DataForSEO not configured' };
      const features = await dfs.getSerpFeatures(input.keyword);
      return features || { error: 'No data returned' };
    }
    case 'get_competitor_keywords': {
      if (!dfs.isConfigured()) return { error: 'DataForSEO not configured' };
      const kws = await dfs.getRankedKeywordsForDomain(input.domain, 30);
      return { domain: input.domain, total: kws.length, top_keywords: kws.slice(0, 20).map(k => ({ keyword: k.keyword, rank: k.rank, sv: k.search_volume, kd: k.kd })) };
    }
    case 'get_refresh_opportunities': {
      const pages = clientData.pages || [];
      const refreshCandidates = pages
        .filter(p => p.page_category !== 'video')
        .map(p => ({
          url: p.url,
          focus_keyword: p.focus_keyword,
          category: p.page_category,
          bucket: p.bucket,
          is_refreshed: p.is_refreshed,
          date_published: p.date_published,
          date_refreshed: p.date_refreshed,
        }));
      const neverRefreshed = refreshCandidates.filter(p => !p.is_refreshed);
      const refreshed = refreshCandidates.filter(p => p.is_refreshed);
      return {
        total_pages: refreshCandidates.length,
        never_refreshed: neverRefreshed.length,
        pages_never_refreshed: neverRefreshed.slice(0, 20),
        pages_previously_refreshed: refreshed.slice(0, 10),
        recommendation: neverRefreshed.length > 0
          ? `${neverRefreshed.length} pages have never been refreshed — these are strong candidates for quarterly refresh content`
          : 'All pages have been refreshed at least once',
      };
    }
    case 'get_planned_keywords': {
      const plan = clientData.contentPlan || [];
      const active = plan.filter(p => ['Planned', 'Researched', 'Briefed', 'Client Approved'].includes(p.status));
      const refreshes = active.filter(p => p.is_refresh);
      const newContent = active.filter(p => !p.is_refresh);
      return {
        total_in_pipeline: active.length,
        new_content: newContent.length,
        refreshes: refreshes.length,
        keywords_in_pipeline: active.map(p => ({
          title: p.title,
          focus_keyword: p.focus_keyword,
          status: p.status,
          month: p.month,
          quarter: p.quarter,
          type: p.is_refresh ? 'REFRESH' : 'NEW',
          existing_url: p.existing_url || null,
        })),
        note: active.length > 0 ? 'Avoid planning content for any of these keywords — they are already in progress' : 'Pipeline is empty — all keywords are available',
      };
    }
    default:
      return { error: 'Unknown tool' };
  }
}

export default function SEOChat() {
  const { clients } = useClients();
  const [selectedClient, setSelectedClient] = useState('');
  const [clientData, setClientData] = useState({ brandVoice: null, pastKeywords: [], pageKeywords: [], pages: [], contentPlan: [] });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load client context when client changes
  useEffect(() => {
    if (!selectedClient) {
      setClientData({ brandVoice: null, pastKeywords: [], pageKeywords: [], pages: [], contentPlan: [] });
      return;
    }
    const load = async () => {
      const dbClient = clients.find(c => c.name === selectedClient);
      const [bvRes, kwRes, pagesRes, planRes] = await Promise.all([
        supabase.from('client_brand_voice').select('*').eq('client_name', selectedClient).maybeSingle(),
        dbClient?.id ? supabase.from('clients').select('past_keywords').eq('id', dbClient.id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from('client_pages').select('url, focus_keyword, page_category, bucket, is_refreshed, date_published, date_refreshed').eq('client_name', selectedClient),
        supabase.from('content_plans').select('title, focus_keyword, status, month, quarter, content_type, existing_url, is_refresh, search_volume, kd').eq('client_name', selectedClient),
      ]);
      setClientData({
        brandVoice: bvRes.data,
        pastKeywords: (kwRes.data?.past_keywords || '').split('\n').filter(Boolean),
        pageKeywords: (pagesRes.data || []).map(p => p.focus_keyword).filter(Boolean),
        pages: pagesRes.data || [],
        contentPlan: planRes.data || [],
      });
    };
    load().catch(console.error);
  }, [selectedClient, clients]);

  // Load chat history for client
  useEffect(() => {
    if (!selectedClient) { setChatHistory([]); return; }
    supabase.from('seo_chats')
      .select('id, client_name, title, created_at')
      .eq('client_name', selectedClient)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setChatHistory(data || []))
      .catch(() => {});
  }, [selectedClient]);

  const buildClientContext = () => {
    const bv = clientData.brandVoice;
    let ctx = `Client: ${selectedClient}\n`;
    if (bv) {
      if (bv.services) ctx += `Services: ${bv.services}\n`;
      if (bv.locations_served) ctx += `Locations: ${bv.locations_served}\n`;
      if (bv.target_personas) ctx += `Audience: ${bv.target_personas}\n`;
      if (bv.competitors) ctx += `Competitors: ${bv.competitors}\n`;
      if (bv.tone) ctx += `Tone: ${bv.tone}\n`;
    }
    if (clientData.pages.length) {
      ctx += `\nBucket list — existing pages (${clientData.pages.length} total, showing up to 40):\n`;
      clientData.pages.slice(0, 40).forEach(p => {
        const refreshFlag = p.is_refreshed ? ' [refreshed]' : ' [never refreshed]';
        ctx += `- [${p.page_category}] "${p.focus_keyword || '—'}" | ${p.url || 'no url'} | bucket: ${p.bucket || 'none'}${refreshFlag}\n`;
      });
    }
    if (clientData.pastKeywords.length) {
      ctx += `\nPast keywords targeted (${clientData.pastKeywords.length}): ${clientData.pastKeywords.slice(0, 30).join(', ')}\n`;
    }
    if (clientData.contentPlan.length) {
      const active = clientData.contentPlan.filter(p => ['Planned', 'Researched', 'Briefed', 'Client Approved'].includes(p.status));
      ctx += `\nContent plan — active pipeline (${active.length} items, DO NOT re-plan these keywords):\n`;
      active.slice(0, 20).forEach(p => {
        const type = p.is_refresh ? 'REFRESH' : 'NEW';
        ctx += `- [${type}] "${p.title}" | FK: ${p.focus_keyword || '—'} | ${p.quarter || ''} ${p.month || ''} [${p.status}]${p.existing_url ? ' | url: ' + p.existing_url : ''}\n`;
      });
    }
    return ctx;
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (!selectedClient) {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Please select a client first so I can check their bucket list and content plan.' }]);
      return;
    }

    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setSending(true);

    try {
      const apiMessages = newMessages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }));

      let response = await callClaude(apiMessages, buildClientContext());

      // Handle tool calls
      let maxLoops = 5;
      while (response.stop_reason === 'tool_use' && maxLoops-- > 0) {
        const toolBlocks = response.content.filter(b => b.type === 'tool_use');
        const textBlocks = response.content.filter(b => b.type === 'text');

        if (textBlocks.length) {
          setMessages(prev => [...prev, { role: 'assistant', content: textBlocks.map(b => b.text).join('\n'), isPartial: true }]);
        }

        // Execute all tool calls
        const toolResults = [];
        for (const tool of toolBlocks) {
          setMessages(prev => [...prev, { role: 'tool_call', toolName: tool.name, input: tool.input }]);
          try {
            const result = await executeTool(tool.name, tool.input, clientData);
            toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: JSON.stringify(result) });
            setMessages(prev => [...prev, { role: 'tool_result', toolName: tool.name, result }]);
          } catch (err) {
            toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: JSON.stringify({ error: err.message }), is_error: true });
          }
        }

        // Continue conversation with tool results
        apiMessages.push({ role: 'assistant', content: response.content });
        apiMessages.push({ role: 'user', content: toolResults });
        response = await callClaude(apiMessages, buildClientContext());
      }

      // Final text response
      const finalText = response.content?.filter(b => b.type === 'text').map(b => b.text).join('\n') || '';
      if (finalText) {
        setMessages(prev => {
          const filtered = prev.filter(m => !m.isPartial);
          return [...filtered, { role: 'assistant', content: finalText }];
        });
      }

      // Save chat
      await saveChat(newMessages, finalText);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'error', content: err.message }]);
    }
    setSending(false);
    inputRef.current?.focus();
  };

  const callClaude = async (apiMessages, clientContext) => {
    if (!ANTHROPIC_KEY) throw new Error('Anthropic API key not configured — ask your admin to set VITE_ANTHROPIC_API_KEY in Netlify environment variables');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        system: SYSTEM_PROMPT(clientContext),
        tools: dfs.isConfigured() ? TOOLS : [],
        messages: apiMessages,
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const detail = errBody?.error?.message || errBody?.message || JSON.stringify(errBody);
      throw new Error(`API error ${res.status}: ${detail}`);
    }
    return res.json();
  };

  const saveChat = async (msgs, lastResponse) => {
    if (!selectedClient || msgs.length < 1) return;
    const title = msgs[0]?.content?.substring(0, 60) || 'Chat';
    const payload = {
      client_name: selectedClient,
      title,
      messages: JSON.stringify([...msgs, { role: 'assistant', content: lastResponse }]),
      updated_at: new Date().toISOString(),
    };
    try {
      if (activeChatId) {
        await supabase.from('seo_chats').update(payload).eq('id', activeChatId);
      } else {
        payload.created_at = new Date().toISOString();
        const { data } = await supabase.from('seo_chats').insert(payload).select().single();
        if (data) setActiveChatId(data.id);
      }
      // Refresh history
      const { data: hist } = await supabase.from('seo_chats')
        .select('id, client_name, title, created_at')
        .eq('client_name', selectedClient)
        .order('created_at', { ascending: false }).limit(20);
      setChatHistory(hist || []);
    } catch { /* non-critical */ }
  };

  const loadChat = async (chatId) => {
    const { data } = await supabase.from('seo_chats').select('*').eq('id', chatId).maybeSingle();
    if (data) {
      setActiveChatId(data.id);
      try { setMessages(JSON.parse(data.messages || '[]').filter(m => m.role === 'user' || (m.role === 'assistant' && typeof m.content === 'string'))); }
      catch { setMessages([]); }
    }
  };

  const newChat = () => {
    setMessages([]);
    setActiveChatId(null);
  };

  const handleAddToPlan = async (keyword, title, options = {}) => {
    if (!selectedClient) return;
    const now = new Date();
    const quarter = `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;

    // Look up if this keyword already has a page in the bucket list
    const kwLower = keyword.toLowerCase().trim();
    const existingPage = clientData.pages.find(p =>
      (p.focus_keyword || '').toLowerCase().trim() === kwLower
    );

    const existingUrl = options.url || existingPage?.url || null;
    const isRefresh = !!(existingUrl);

    const payload = {
      client_name: selectedClient,
      quarter,
      month: now.toLocaleDateString('en-AU', { month: 'long' }),
      content_type: 'Blog',
      title: title || keyword,
      focus_keyword: keyword,
      status: 'Planned',
      search_volume: options.sv != null ? parseInt(options.sv) : null,
      kd: options.kd != null ? parseInt(options.kd) : null,
      existing_url: existingUrl,
      is_refresh: isRefresh,
    };

    const { error } = await supabase.from('content_plans').insert(payload);
    if (error) {
      toast.error('Could not add to plan: ' + error.message);
    } else {
      // Refresh local content plan so cannibalization checks stay accurate
      const { data: freshPlan } = await supabase
        .from('content_plans')
        .select('title, focus_keyword, status, month, quarter, content_type, existing_url, is_refresh, search_volume, kd')
        .eq('client_name', selectedClient);
      if (freshPlan) {
        setClientData(prev => ({ ...prev, contentPlan: freshPlan }));
      }
      if (existingPage) {
        toast.success(`Added "${keyword}" to Content Plan as a REFRESH`);
      } else {
        toast.success(`Added "${keyword}" to Content Plan`);
      }
    }
  };

  const handleSaveKeyword = async (keyword) => {
    const dbClient = clients.find(c => c.name === selectedClient);
    if (!dbClient?.id) return;
    const { data } = await supabase.from('clients').select('past_keywords').eq('id', dbClient.id).maybeSingle();
    const existing = (data?.past_keywords || '').split('\n').filter(Boolean);
    if (!existing.some(k => k.toLowerCase() === keyword.toLowerCase())) {
      await supabase.from('clients').update({ past_keywords: [...existing, keyword].join('\n') }).eq('id', dbClient.id);
      toast.success(`Saved "${keyword}" to keyword bank`);
    } else {
      toast('Already in keyword bank');
    }
  };

  // Quick prompts
  const quickPrompts = [
    { label: '📅 Plan Q3 content', prompt: `Let's plan the quarterly content for ${selectedClient || 'this client'}. Start by checking what's already in the pipeline and what pages could be refreshed, then suggest new keyword opportunities with real search data. Make sure to check for cannibalization before recommending anything.` },
    { label: '🔄 Find refresh opportunities', prompt: `Which existing pages for ${selectedClient || 'this client'} should we prioritise for a content refresh this quarter? Check the bucket list and recommend the best candidates.` },
    { label: '🔑 Find new keyword gaps', prompt: `Find keyword opportunities for ${selectedClient || 'this client'} that we haven't targeted yet. Check against the bucket list for cannibalization and get real SV + KD data before recommending.` },
    { label: '⚔️ Competitor keyword gaps', prompt: `Analyse our main competitors for ${selectedClient || 'this client'} and find keywords they rank for that we don't. Flag any that overlap with our existing pages.` },
  ];

  return (
    <div className="h-full flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-200">
          <div className="text-[10px] font-bold uppercase text-gray-400 mb-1.5">Client</div>
          <select value={selectedClient} onChange={e => { setSelectedClient(e.target.value); newChat(); }}
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6]">
            <option value="">Select client...</option>
            {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>

        <div className="p-3 border-b border-gray-200">
          <button onClick={newChat}
            className="w-full bg-[#F5C518] text-[#1a1a1a] border-none rounded px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800]">
            + New Chat
          </button>
        </div>

        {/* Chat history */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-[9px] font-bold uppercase text-gray-400 px-1 mb-1">History</div>
          {chatHistory.length === 0 ? (
            <div className="text-[10px] text-gray-400 px-1 italic">No chats yet</div>
          ) : (
            chatHistory.map(ch => (
              <div key={ch.id}
                onClick={() => loadChat(ch.id)}
                className={`text-[11px] px-2 py-1.5 rounded cursor-pointer truncate mb-0.5 ${
                  activeChatId === ch.id ? 'bg-[#F5C518]/20 text-[#1a1a1a] font-semibold' : 'text-gray-600 hover:bg-gray-100'
                }`}>
                {ch.title}
              </div>
            ))
          )}
        </div>

        {/* Client context summary */}
        {selectedClient && clientData.brandVoice && (
          <div className="p-3 border-t border-gray-200 bg-[#f8f8f6]">
            <div className="text-[9px] font-bold uppercase text-gray-400 mb-1">Context Loaded</div>
            <div className="text-[10px] text-gray-500 space-y-0.5">
              <div>📄 {clientData.pages.length} pages</div>
              <div>🔑 {clientData.pastKeywords.length} keywords</div>
              <div>📅 {clientData.contentPlan.length} planned</div>
            </div>
          </div>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-5 py-2.5 shrink-0 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-bold text-[#1a1a1a]">🤖 SEO Assistant</h1>
            <p className="text-[10px] text-gray-400">
              {selectedClient ? `Chatting about ${selectedClient} · Live DataForSEO connected` : 'Select a client to start'}
            </p>
          </div>
          <Link to="/seo-tools" className="text-[10px] text-gray-400 hover:text-[#F5C518] no-underline">← SEO Tools</Link>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 bg-[#f8f8f6]">
          <div className="max-w-3xl mx-auto space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-10">
                <div className="text-4xl mb-3">🤖</div>
                <div className="text-sm font-semibold text-[#1a1a1a] mb-1">SEO Assistant</div>
                <div className="text-[11px] text-gray-400 mb-6 max-w-sm mx-auto">
                  Ask me anything about SEO, keywords, content strategy, or competitors.
                  {selectedClient ? ` I have ${selectedClient}'s full context loaded.` : ' Select a client first for personalised advice.'}
                </div>
                {selectedClient && (
                  <div className="flex flex-wrap justify-center gap-2">
                    {quickPrompts.map((qp, i) => (
                      <button key={i} onClick={() => { setInput(qp.prompt); }}
                        className="text-[11px] bg-white border border-gray-200 text-gray-700 rounded-lg px-3 py-2 cursor-pointer hover:border-[#F5C518] hover:shadow-sm transition-all text-left max-w-[200px]">
                        {qp.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((msg, i) => {
              if (msg.role === 'user') return (
                <div key={i} className="flex justify-end">
                  <div className="bg-[#1a1a1a] text-white rounded-2xl rounded-br-md px-4 py-2.5 max-w-lg text-[12px] leading-relaxed">
                    {msg.content}
                  </div>
                </div>
              );

              if (msg.role === 'assistant') return (
                <div key={i} className="flex justify-start">
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-2.5 max-w-2xl shadow-sm">
                    <div className="text-[12px] text-gray-800 leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                    {/* Extract keywords for quick actions */}
                    <QuickActions content={msg.content} onAddToPlan={handleAddToPlan} onSaveKeyword={handleSaveKeyword} />
                  </div>
                </div>
              );

              if (msg.role === 'tool_call') return (
                <div key={i} className="flex justify-start">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-[10px] text-blue-700">
                    🔧 Calling <b>{msg.toolName}</b>: {JSON.stringify(msg.input).substring(0, 80)}...
                  </div>
                </div>
              );

              if (msg.role === 'tool_result') return (
                <ToolResultDisplay key={i} toolName={msg.toolName} result={msg.result} onAddToPlan={handleAddToPlan} onSaveKeyword={handleSaveKeyword} />
              );

              if (msg.role === 'error') return (
                <div key={i} className="flex justify-start">
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[11px] text-red-600">
                    Error: {msg.content}
                  </div>
                </div>
              );

              return null;
            })}

            {sending && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-[11px] text-gray-400">
                    <div className="w-2 h-2 bg-[#F5C518] rounded-full animate-pulse"></div>
                    Thinking...
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="bg-white border-t border-gray-200 px-5 py-3 shrink-0">
          <div className="max-w-3xl mx-auto flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={selectedClient ? `Ask about ${selectedClient}'s SEO...` : 'Select a client first...'}
              disabled={sending || !selectedClient}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-[12px] bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518] focus:bg-white disabled:opacity-40"
            />
            <button onClick={handleSend} disabled={sending || !input.trim() || !selectedClient}
              className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-xl px-5 py-2.5 text-[12px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-30 shrink-0">
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tool Result Display ──
function ToolResultDisplay({ toolName, result, onAddToPlan, onSaveKeyword }) {
  if (toolName === 'get_keyword_metrics' && result?.keywords) {
    return (
      <div className="flex justify-start">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 max-w-lg w-full">
          <div className="text-[9px] font-bold uppercase text-green-600 mb-1.5">📊 Live Keyword Data</div>
          <div className="space-y-1">
            {result.keywords.map((k, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] bg-white rounded px-2 py-1">
                <span className="flex-1 font-semibold text-gray-800">{k.keyword}</span>
                <span className="text-gray-500">SV: <b className="text-[#1a1a1a]">{(k.search_volume || 0).toLocaleString()}</b></span>
                <span className="text-gray-500">KD: <b className={k.kd <= 20 ? 'text-green-600' : k.kd <= 50 ? 'text-orange-500' : 'text-red-500'}>{k.kd}</b></span>
                {k.cpc > 0 && <span className="text-gray-400">${Number(k.cpc).toFixed(2)}</span>}
                <button onClick={() => onAddToPlan(k.keyword, null, { sv: k.search_volume, kd: k.kd })} className="text-[9px] text-[#F5C518] font-bold bg-transparent border border-[#F5C518] rounded px-1.5 py-0.5 cursor-pointer hover:bg-[#F5C518]/10">+ Plan</button>
                <button onClick={() => onSaveKeyword(k.keyword)} className="text-[9px] text-blue-500 font-bold bg-transparent border border-blue-200 rounded px-1.5 py-0.5 cursor-pointer hover:bg-blue-50">💾</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (toolName === 'check_cannibalization') {
    return (
      <div className="flex justify-start">
        <div className={`rounded-lg p-3 text-[11px] max-w-lg w-full ${result.already_targeted ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
          <div className={`font-bold mb-1 ${result.already_targeted ? 'text-red-600' : 'text-green-600'}`}>
            {result.already_targeted ? '⚠️ CANNIBALIZATION RISK' : '✅ Clear'} — "{result.keyword}"
          </div>
          <div className="text-gray-700 text-[10px] mb-1">{result.recommendation}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {result.in_keyword_bank && <span className="text-[9px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded">in keyword bank</span>}
            {result.in_bucket_list && <span className="text-[9px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded">in bucket list</span>}
            {result.in_content_plan && <span className="text-[9px] bg-orange-100 text-orange-600 font-bold px-1.5 py-0.5 rounded">already planned</span>}
          </div>
          {result.existing_page && (
            <div className="mt-1.5 bg-white rounded border border-red-100 px-2 py-1 text-[10px] text-gray-600">
              Existing page: <a href={result.existing_page.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">{result.existing_page.url}</a>
              <span className="ml-2 text-gray-400">[{result.existing_page.category}]</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (toolName === 'get_related_keywords' && result?.related) {
    return (
      <div className="flex justify-start">
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 max-w-lg w-full">
          <div className="text-[9px] font-bold uppercase text-purple-600 mb-1.5">🔗 Related Keywords for "{result.seed}"</div>
          <div className="space-y-1">
            {result.related.slice(0, 15).map((k, i) => (
              <div key={i} className="flex items-center gap-2 bg-white border border-purple-100 rounded px-2 py-1 text-[10px]">
                <span className="flex-1 text-gray-800">{k.keyword}</span>
                <span className="text-gray-400">SV: <b>{(k.sv || 0).toLocaleString()}</b></span>
                <span className="text-gray-400">KD: <b className={k.kd <= 20 ? 'text-green-600' : k.kd <= 50 ? 'text-orange-500' : 'text-red-500'}>{k.kd ?? '—'}</b></span>
                <button onClick={() => onAddToPlan(k.keyword, null, { sv: k.sv, kd: k.kd })}
                  className="text-[9px] text-[#F5C518] font-bold bg-transparent border border-[#F5C518] rounded px-1.5 py-0.5 cursor-pointer hover:bg-[#F5C518]/10">+ Plan</button>
                <button onClick={() => onSaveKeyword(k.keyword)}
                  className="text-[9px] text-blue-500 font-bold bg-transparent border border-blue-200 rounded px-1.5 py-0.5 cursor-pointer hover:bg-blue-50">💾</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (toolName === 'get_refresh_opportunities') {
    return (
      <div className="flex justify-start">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 max-w-lg w-full">
          <div className="text-[9px] font-bold uppercase text-amber-700 mb-1.5">🔄 Refresh Opportunities ({result.total_pages} pages total)</div>
          <div className="text-[10px] text-amber-800 mb-2">{result.recommendation}</div>
          {result.pages_never_refreshed?.length > 0 && (
            <div className="space-y-1">
              <div className="text-[9px] font-bold uppercase text-gray-500 mb-1">Never Refreshed ({result.never_refreshed})</div>
              {result.pages_never_refreshed.slice(0, 10).map((p, i) => (
                <div key={i} className="flex items-center gap-2 bg-white border border-amber-100 rounded px-2 py-1 text-[10px]">
                  <span className="flex-1 text-gray-700 truncate">{p.focus_keyword || p.url}</span>
                  <span className="text-[9px] text-gray-400">[{p.category}]</span>
                  <button onClick={() => onAddToPlan(p.focus_keyword || '', null, { url: p.url })}
                    className="text-[9px] text-amber-600 font-bold bg-transparent border border-amber-300 rounded px-1.5 py-0.5 cursor-pointer hover:bg-amber-100 shrink-0">+ Refresh</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (toolName === 'get_planned_keywords') {
    return (
      <div className="flex justify-start">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 max-w-lg w-full">
          <div className="text-[9px] font-bold uppercase text-blue-700 mb-1.5">📅 Content Plan Pipeline ({result.total_in_pipeline} items)</div>
          <div className="text-[10px] text-blue-800 mb-2">{result.note}</div>
          {result.keywords_in_pipeline?.length > 0 && (
            <div className="space-y-0.5">
              {result.keywords_in_pipeline.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] bg-white border border-blue-100 rounded px-2 py-1">
                  <span className="flex-1 text-gray-700 truncate">{p.focus_keyword || p.title}</span>
                  <span className="text-gray-400">{p.month || '—'}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${p.status === 'Planned' ? 'bg-gray-100 text-gray-500' : p.status === 'Briefed' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>{p.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-[10px] text-gray-500 max-w-lg overflow-x-auto">
        <pre className="whitespace-pre-wrap">{JSON.stringify(result, null, 2).substring(0, 300)}</pre>
      </div>
    </div>
  );
}

// ── Quick Actions on assistant messages ──
function QuickActions({ content, onAddToPlan, onSaveKeyword }) {
  // Extract quoted keywords from the response
  const kwMatches = content.match(/"([^"]{3,40})"/g);
  if (!kwMatches || kwMatches.length === 0) return null;

  const keywords = [...new Set(kwMatches.map(k => k.replace(/"/g, '')).slice(0, 5))];

  return (
    <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-1">
      {keywords.map((kw, i) => (
        <button key={i} onClick={() => onAddToPlan(kw)}
          className="text-[9px] text-[#F5C518] font-semibold bg-[#F5C518]/10 border border-[#F5C518]/30 rounded px-1.5 py-0.5 cursor-pointer hover:bg-[#F5C518]/20">
          + Plan "{kw}"
        </button>
      ))}
    </div>
  );
}
