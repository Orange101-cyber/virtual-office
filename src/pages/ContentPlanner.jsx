import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import * as dfs from '../lib/dataForSeo';
import toast from 'react-hot-toast';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const STATUSES = ['Planned', 'Researched', 'Briefed', 'Client Approved', 'Sent to Airtable'];
const STATUS_COLORS = {
  Planned: '#94a3b8', Researched: '#F5C518', Briefed: '#3b82f6', 'Client Approved': '#10b981', 'Sent to Airtable': '#27ae60',
};
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
const MONTHS_MAP = { Q1: ['January', 'February', 'March'], Q2: ['April', 'May', 'June'], Q3: ['July', 'August', 'September'], Q4: ['October', 'November', 'December'] };
const CURRENT_YEAR = new Date().getFullYear();

function getQuarters() {
  return [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].flatMap(y =>
    QUARTERS.map(q => `${q} ${y}`)
  );
}

// ── Add/Edit Modal with Cannibalization Check ──
function PlanModal({ open, onClose, onSave, onDelete, item, clients, dbClients }) {
  const [form, setForm] = useState({
    client_name: '', quarter: `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${CURRENT_YEAR}`,
    month: '', content_type: 'Blog', title: '', is_refresh: false,
    focus_keyword: '', search_volume: '', kd: '', existing_url: '',
    status: 'Planned', notes: '', assigned_to: '',
  });
  const [clientKeywords, setClientKeywords] = useState('');
  const [cannibHits, setCannibHits] = useState([]);
  const [liveRanking, setLiveRanking] = useState(null);
  const [checkingRank, setCheckingRank] = useState(false);
  const [fetchingMetrics, setFetchingMetrics] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(item ? { ...item, search_volume: item.search_volume || '', kd: item.kd || '' } : {
        client_name: clients[0] || '', quarter: `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${CURRENT_YEAR}`,
        month: '', content_type: 'Blog', title: '', is_refresh: false,
        focus_keyword: '', search_volume: '', kd: '', existing_url: '',
        status: 'Planned', notes: '', assigned_to: '',
      });
    }
  }, [open, item, clients]);

  // Load client keywords when client changes
  useEffect(() => {
    if (!form.client_name) { setClientKeywords(''); return; }
    const dbClient = dbClients.find(c => c.name === form.client_name);
    if (dbClient?.id) {
      supabase.from('clients').select('past_keywords').eq('id', dbClient.id).single()
        .then(({ data }) => setClientKeywords(data?.past_keywords || ''));
    } else {
      setClientKeywords('');
    }
  }, [form.client_name, dbClients]);

  // Check cannibalization when keyword or client keywords change
  useEffect(() => {
    if (!form.focus_keyword?.trim() || !clientKeywords || form.is_refresh) {
      setCannibHits([]);
      return;
    }
    const fk = form.focus_keyword.trim().toLowerCase();
    const past = clientKeywords.split('\n').map(k => k.trim().toLowerCase()).filter(Boolean);
    const hits = [];
    past.forEach(p => {
      if (p && fk && (p.includes(fk) || fk.includes(p))) {
        hits.push({ keyword: fk, matchedPast: p });
      }
    });
    setCannibHits(hits);
  }, [form.focus_keyword, clientKeywords, form.is_refresh]);

  // Detect client domain from existing URL or other client plans
  const detectClientDomain = () => {
    if (form.existing_url) {
      try { return new URL(form.existing_url).hostname.replace(/^www\./, ''); } catch {}
    }
    return null;
  };

  const handleCheckLiveRanking = async () => {
    if (!form.focus_keyword) return toast.error('Enter a focus keyword');
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');
    setCheckingRank(true);
    setLiveRanking(null);
    try {
      const domain = detectClientDomain();
      if (domain) {
        const ranking = await dfs.checkDomainRanking(form.focus_keyword, domain);
        if (ranking) {
          setLiveRanking({ ranked: true, ...ranking, domain });
          toast.success(`${domain} ranks at #${ranking.rank}`);
        } else {
          setLiveRanking({ ranked: false, domain });
          toast(`${domain} does not rank in top 10 — safe to publish`);
        }
      } else {
        // Just fetch the top 10 SERP if no domain known
        const serp = await dfs.getSerpResults(form.focus_keyword);
        setLiveRanking({ ranked: false, topResults: serp?.items?.slice(0, 5) || [] });
      }
    } catch (err) {
      toast.error('DataForSEO error: ' + err.message);
    }
    setCheckingRank(false);
  };

  const handleFetchMetrics = async () => {
    if (!form.focus_keyword) return toast.error('Enter a focus keyword');
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');
    setFetchingMetrics(true);
    try {
      const metrics = await dfs.getKeywordMetrics([form.focus_keyword]);
      if (metrics[0]) {
        const sv = metrics[0].search_volume ?? 0;
        const kd = metrics[0].kd ?? 0;
        setForm(f => ({ ...f, search_volume: sv, kd }));
        if (sv === 0) {
          toast('SV: 0 — keyword may be too long-tail. Try a shorter version.', { icon: '⚠️' });
        } else {
          toast.success(`SV: ${sv.toLocaleString()}, KD: ${kd}`);
        }
      } else {
        toast.error('No data returned — check the keyword spelling');
      }
    } catch (err) {
      toast.error('DataForSEO error: ' + err.message);
    }
    setFetchingMetrics(false);
  };

  const handleSave = () => {
    if (!form.title.trim() || !form.client_name) return;
    onSave({
      ...form,
      search_volume: form.search_volume ? parseInt(form.search_volume) : null,
      kd: form.kd ? parseInt(form.kd) : null,
    });
    onClose();
  };

  const qMonths = MONTHS_MAP[form.quarter?.split(' ')[0]] || [];
  const kwCount = clientKeywords ? clientKeywords.split('\n').filter(l => l.trim()).length : 0;

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-[560px] max-w-[95vw] max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-[15px] font-semibold mb-4">{item ? 'Edit Content' : 'Add Content'}</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <Label>Client</Label>
            <select value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} className="input-field">
              <option value="">Select...</option>
              {clients.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <Label>Quarter</Label>
            <select value={form.quarter} onChange={e => setForm(f => ({ ...f, quarter: e.target.value, month: '' }))} className="input-field">
              {getQuarters().map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <Label>Month</Label>
            <select value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))} className="input-field">
              <option value="">—</option>
              {qMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <Label>Type</Label>
            <select value={form.content_type} onChange={e => setForm(f => ({ ...f, content_type: e.target.value }))} className="input-field">
              <option>Blog</option><option>SEO Page</option>
            </select>
          </div>
          <div>
            <Label>Status</Label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="input-field">
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="mb-3">
          <Label>Title</Label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Article title..." className="input-field" />
        </div>
        <div className="flex items-center gap-3 mb-3">
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
            <input type="checkbox" checked={form.is_refresh} onChange={e => setForm(f => ({ ...f, is_refresh: e.target.checked }))} className="accent-[#F5C518]" />
            This is a REFRESH / UPDATE of an existing article
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-2">
          <div><Label>Focus Keyword</Label><input value={form.focus_keyword} onChange={e => setForm(f => ({ ...f, focus_keyword: e.target.value }))} className="input-field" /></div>
          <div><Label>Search Volume</Label><input type="number" value={form.search_volume} onChange={e => setForm(f => ({ ...f, search_volume: e.target.value }))} className="input-field" /></div>
          <div><Label>KD (0-100)</Label><input type="number" value={form.kd} onChange={e => setForm(f => ({ ...f, kd: e.target.value }))} className="input-field" /></div>
        </div>

        {/* DataForSEO buttons */}
        {form.focus_keyword && (
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={handleFetchMetrics}
              disabled={fetchingMetrics}
              className="text-[10px] bg-[#1a1a1a] text-white border-none rounded px-2.5 py-1 font-bold cursor-pointer hover:bg-[#333] disabled:opacity-40"
            >
              {fetchingMetrics ? 'Fetching...' : '⚡ Fetch SV/KD'}
            </button>
            <button
              type="button"
              onClick={handleCheckLiveRanking}
              disabled={checkingRank}
              className="text-[10px] bg-transparent border border-[#1a1a1a] text-[#1a1a1a] rounded px-2.5 py-1 font-bold cursor-pointer hover:bg-[#1a1a1a] hover:text-white disabled:opacity-40"
            >
              {checkingRank ? 'Checking...' : '🔍 Check Live Google Ranking'}
            </button>
          </div>
        )}

        {/* Live ranking result */}
        {liveRanking && (
          <div className="mb-3">
            {liveRanking.ranked ? (
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-[11px]">
                <div className="font-semibold text-orange-600 mb-0.5">
                  ⚠ {liveRanking.domain} already ranks at #{liveRanking.rank}
                </div>
                <div className="text-gray-600 truncate" title={liveRanking.title}>{liveRanking.title}</div>
                <div className="text-[10px] text-gray-400 truncate" title={liveRanking.url}>{liveRanking.url}</div>
                <div className="text-[9px] text-orange-400 mt-1">
                  Consider marking this as REFRESH / UPDATE if you're updating this existing page.
                </div>
              </div>
            ) : liveRanking.topResults?.length > 0 ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-[11px]">
                <div className="font-semibold text-blue-600 mb-1">Top ranking competitors:</div>
                {liveRanking.topResults.map((r, i) => (
                  <div key={i} className="text-[10px] text-gray-600 truncate mb-0.5">
                    <span className="text-blue-500 font-semibold">#{r.rank}</span> {r.domain}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-[11px] text-green-700">
                ✓ {liveRanking.domain} does not rank for this keyword — safe to publish a new article
              </div>
            )}
          </div>
        )}

        {/* Cannibalization check */}
        {form.focus_keyword?.trim() && kwCount > 0 && !form.is_refresh && (
          <div className="mb-3">
            {cannibHits.length === 0 ? (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-[11px] text-green-700 flex items-center gap-2">
                <span className="text-green-600">✓</span>
                No cannibalization found — checked against {kwCount} past keywords for {form.client_name}
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <div className="text-[11px] font-semibold text-red-600 mb-1">Cannibalization Warning</div>
                {cannibHits.map((h, i) => (
                  <div key={i} className="text-[11px] text-red-600 mb-0.5">
                    &ldquo;{h.keyword}&rdquo; overlaps with past keyword &ldquo;{h.matchedPast}&rdquo;
                  </div>
                ))}
                <div className="text-[10px] text-red-400 mt-1">
                  If this is an update of an existing article, tick &ldquo;REFRESH / UPDATE&rdquo; above to dismiss this warning.
                </div>
              </div>
            )}
          </div>
        )}
        {form.is_refresh && cannibHits.length > 0 && (
          <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-[11px] text-blue-600">
            Marked as update — keyword overlap is expected.
          </div>
        )}
        {kwCount === 0 && form.client_name && (
          <div className="mb-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[10px] text-gray-400">
            No past keywords saved for {form.client_name}. Add them in SEO Checker → KW button to enable cannibalization checks.
          </div>
        )}

        {form.is_refresh && (
          <div className="mb-3"><Label>Existing URL</Label><input value={form.existing_url} onChange={e => setForm(f => ({ ...f, existing_url: e.target.value }))} placeholder="https://..." className="input-field" /></div>
        )}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><Label>Assigned To</Label><input value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} className="input-field" /></div>
          <div><Label>Notes</Label><input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input-field" /></div>
        </div>
        <div className="flex gap-2 mt-4">
          {item && (
            <button onClick={() => { onDelete(item.id); onClose(); }} className="btn-secondary text-red-500 border-red-200 hover:bg-red-50 hover:border-red-300 mr-auto">
              Delete
            </button>
          )}
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={!form.title.trim()} className="btn-primary">
            {cannibHits.length > 0 && !form.is_refresh ? 'Save Anyway' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{children}</label>;
}

// ── Import Modal ──
function ImportModal({ open, onClose, onImport, clients }) {
  const [text, setText] = useState('');
  const [client, setClient] = useState(clients[0] || '');
  const [quarter, setQuarter] = useState(`Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${CURRENT_YEAR}`);

  const handleImport = () => {
    const lines = text.split('\n').filter(l => l.trim());
    const items = [];
    let currentMonth = '';
    let currentTitle = '';
    let isRefresh = false;

    lines.forEach(line => {
      const l = line.trim();
      const monthMatch = l.match(/^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)/i);
      if (monthMatch) { currentMonth = monthMatch[1].charAt(0) + monthMatch[1].slice(1).toLowerCase(); return; }
      const titleMatch = l.match(/^Title:\s*(NEW|REFRESH):\s*(.+)/i);
      if (titleMatch) { isRefresh = titleMatch[1].toUpperCase() === 'REFRESH'; currentTitle = titleMatch[2].trim(); return; }
      const fkMatch = l.match(/^FK:\s*(.+?)(?:\s*[-–—]\s*SV:\s*([\d,.k]+))?(?:\s*;\s*KD:\s*(\d+))?$/i);
      if (fkMatch && currentTitle) {
        let sv = fkMatch[2]?.replace(/,/g, '') || '';
        if (sv.endsWith('k')) sv = String(Math.round(parseFloat(sv) * 1000));
        items.push({
          client_name: client, quarter, month: currentMonth, content_type: 'Blog',
          title: currentTitle, is_refresh: isRefresh, focus_keyword: fkMatch[1].trim(),
          search_volume: sv ? parseInt(sv) : null, kd: fkMatch[3] ? parseInt(fkMatch[3]) : null,
          status: 'Planned', notes: '', assigned_to: '',
        });
        currentTitle = ''; return;
      }
    });

    if (items.length === 0) { alert('No items could be parsed. Check the format.'); return; }
    onImport(items);
    onClose();
    setText('');
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-[520px] max-w-[95vw] shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-[15px] font-semibold mb-2">Import Content Plan</h3>
        <p className="text-[11px] text-gray-400 mb-3">Paste your content plan in this format:<br />MONTH → Title: NEW/REFRESH: Title → FK: keyword – SV: 12.1k; KD: 0</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><Label>Client</Label><select value={client} onChange={e => setClient(e.target.value)} className="input-field">{clients.map(c => <option key={c}>{c}</option>)}</select></div>
          <div><Label>Quarter</Label><select value={quarter} onChange={e => setQuarter(e.target.value)} className="input-field">{getQuarters().map(q => <option key={q}>{q}</option>)}</select></div>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={10} placeholder="Paste here..." className="input-field font-mono resize-y" />
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleImport} className="btn-primary">Import</button>
        </div>
      </div>
    </div>
  );
}

// ── Card Component ──
function PlanCard({ item, onClick, onDelete }) {
  return (
    <div onClick={onClick} className="bg-white border border-gray-200 rounded-lg p-3 mb-2 cursor-pointer hover:border-[#F5C518] transition-colors group relative">
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
        className="absolute top-1.5 right-1.5 bg-transparent border-none text-gray-300 cursor-pointer text-xs p-0 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
        title="Delete"
      >
        ✕
      </button>
      <div className="flex items-start justify-between mb-1">
        <span className={`text-[8px] font-bold uppercase px-1.5 py-0 rounded ${item.is_refresh ? 'bg-orange-50 text-orange-500' : 'bg-blue-50 text-blue-600'}`}>
          {item.is_refresh ? 'Refresh' : 'New'}
        </span>
        <span className="text-[8px] text-gray-400 mr-3">{item.content_type}</span>
      </div>
      {item.client_name && (
        <div className="text-[9px] font-bold text-[#F5C518] mb-0.5 truncate">{item.client_name}</div>
      )}
      <div className="text-[11px] font-medium text-[#1a1a1a] leading-snug mb-1.5 line-clamp-2">{item.title}</div>
      {item.focus_keyword && (
        <div className="text-[10px] text-gray-400 truncate mb-1">FK: {item.focus_keyword}</div>
      )}
      <div className="flex items-center gap-2 text-[9px]">
        {item.search_volume && <span className="text-gray-500">SV: {item.search_volume.toLocaleString()}</span>}
        {item.kd !== null && item.kd !== undefined && (
          <span className={`font-semibold ${item.kd <= 20 ? 'text-green-600' : item.kd <= 50 ? 'text-orange-500' : 'text-red-500'}`}>
            KD: {item.kd}
          </span>
        )}
        {item.assigned_to && <span className="ml-auto text-gray-400">{item.assigned_to}</span>}
      </div>
    </div>
  );
}

// ── Main ──
export default function ContentPlanner() {
  const { clients: dbClients } = useClients();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('board');
  const [clientFilter, setClientFilter] = useState('');
  const [quarterFilter, setQuarterFilter] = useState(`Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${CURRENT_YEAR}`);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('content_plans').select('*').order('created_at', { ascending: true });
    if (quarterFilter) query = query.eq('quarter', quarterFilter);
    if (clientFilter) query = query.eq('client_name', clientFilter);
    const { data } = await query;
    setPlans(data || []);
    setLoading(false);
  }, [quarterFilter, clientFilter]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  // Merge clients from the shared clients table + any names in existing plans
  const allClients = useMemo(() => {
    const fromDb = dbClients.map(c => c.name);
    const fromPlans = plans.map(p => p.client_name);
    return [...new Set([...fromDb, ...fromPlans])].filter(Boolean).sort();
  }, [dbClients, plans]);

  const handleSave = async (item) => {
    if (item.id) {
      await supabase.from('content_plans').update({ ...item, updated_at: new Date().toISOString() }).eq('id', item.id);
    } else {
      await supabase.from('content_plans').insert(item);
    }
    fetchPlans();
  };

  const handleImport = async (items) => {
    await supabase.from('content_plans').insert(items);
    fetchPlans();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this content item?')) return;
    await supabase.from('content_plans').delete().eq('id', id);
    fetchPlans();
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId;
    const itemId = result.draggableId;
    await supabase.from('content_plans').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', itemId);
    setPlans(prev => prev.map(p => p.id === itemId ? { ...p, status: newStatus } : p));
  };

  const handleExport = () => {
    const grouped = {};
    plans.forEach(p => {
      if (!grouped[p.client_name]) grouped[p.client_name] = {};
      if (!grouped[p.client_name][p.month || 'Unassigned']) grouped[p.client_name][p.month || 'Unassigned'] = [];
      grouped[p.client_name][p.month || 'Unassigned'].push(p);
    });
    let output = '';
    Object.entries(grouped).forEach(([client, months]) => {
      output += `${client.toUpperCase()} — Content Plan ${quarterFilter}\n\nBLOGS\n`;
      Object.entries(months).forEach(([month, items]) => {
        output += `${month.toUpperCase()}\n`;
        items.forEach(item => {
          output += `Title: ${item.is_refresh ? 'REFRESH' : 'NEW'}: ${item.title}\n`;
          output += `FK: ${item.focus_keyword || '—'}${item.search_volume ? ` — SV: ${item.search_volume.toLocaleString()}` : ''}${item.kd !== null ? `; KD: ${item.kd}` : ''}\n\n`;
        });
      });
      output += '\n';
    });
    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Content-Plan-${quarterFilter.replace(' ', '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportForReview = async () => {
    const briefedItems = plans.filter(p => p.status === 'Briefed');
    if (briefedItems.length === 0) { alert('No items in "Briefed" status to review.'); return; }

    // Fetch briefs for these items
    const { data: briefs } = await supabase
      .from('content_briefs')
      .select('*')
      .in('plan_id', briefedItems.map(i => i.id));

    const briefMap = {};
    (briefs || []).forEach(b => { briefMap[b.plan_id] = b.brief_json; });

    // Also match by title+keyword if plan_id not linked
    (briefs || []).forEach(b => {
      if (!b.plan_id) {
        const match = briefedItems.find(i => i.title === b.title || i.focus_keyword === b.focus_keyword);
        if (match && !briefMap[match.id]) briefMap[match.id] = b.brief_json;
      }
    });

    let output = `CONTENT REVIEW DOCUMENT\n${'='.repeat(50)}\n`;
    output += `Quarter: ${quarterFilter || 'All'}\nDate: ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}\n`;
    output += `Items for Review: ${briefedItems.length}\n${'='.repeat(50)}\n\n`;

    // Group by client
    const grouped = {};
    briefedItems.forEach(item => {
      if (!grouped[item.client_name]) grouped[item.client_name] = [];
      grouped[item.client_name].push(item);
    });

    Object.entries(grouped).forEach(([client, items]) => {
      output += `\n${'─'.repeat(50)}\n`;
      output += `CLIENT: ${client.toUpperCase()}\n`;
      output += `${'─'.repeat(50)}\n\n`;

      items.forEach((item, idx) => {
        output += `${idx + 1}. ${item.is_refresh ? '[REFRESH]' : '[NEW]'} ${item.title}\n`;
        output += `   FK: ${item.focus_keyword || '—'}`;
        if (item.search_volume) output += ` | SV: ${item.search_volume.toLocaleString()}`;
        if (item.kd !== null && item.kd !== undefined) output += ` | KD: ${item.kd}`;
        output += `\n   Month: ${item.month || '—'} | Type: ${item.content_type}\n`;
        if (item.notes) output += `   Notes: ${item.notes}\n`;

        const brief = briefMap[item.id];
        if (brief) {
          output += `\n   BRIEF:\n`;
          if (brief.overview) output += `   Overview: ${brief.overview}\n`;
          if (brief.suggested_h1) output += `   Suggested H1: ${brief.suggested_h1}\n`;
          if (brief.lsi_keywords?.length) output += `   LSI Keywords: ${brief.lsi_keywords.join(', ')}\n`;
          if (brief.h2_structure?.length) {
            output += `   H2 Structure:\n`;
            brief.h2_structure.forEach(h => { output += `     - ${h.h2}: ${h.description}\n`; });
          }
          if (brief.faq_section?.length) {
            output += `   FAQs:\n`;
            brief.faq_section.forEach(f => { output += `     Q: ${f.question}\n`; });
          }
          if (brief.cta_recommendation) output += `   CTA: ${brief.cta_recommendation}\n`;
        } else {
          output += `   [No brief generated yet]\n`;
        }
        output += `\n   APPROVAL: [ ] Approved  [ ] Changes needed\n`;
        output += `   Feedback: ___________________________________\n\n`;
      });
    });

    output += `\n${'='.repeat(50)}\nGenerated by CYL Content Planner\n`;

    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Review-${quarterFilter.replace(' ', '-')}-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Stats
  const stats = useMemo(() => {
    const s = { total: plans.length };
    STATUSES.forEach(st => { s[st] = plans.filter(p => p.status === st).length; });
    return s;
  }, [plans]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold text-[#1a1a1a]">Content Planner</h1>
            <p className="text-[11px] text-gray-400">Per-client quarterly content tracking</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImport(true)} className="btn-secondary text-[11px]">Import</button>
            <button onClick={handleExport} className="btn-secondary text-[11px]">Export Plan</button>
            <button onClick={handleExportForReview} className="btn-secondary text-[11px]" style={{ borderColor: '#3b82f6', color: '#3b82f6' }}>Export for Review</button>
            <button onClick={() => { setEditItem(null); setShowAdd(true); }} className="btn-primary text-[11px]">+ Add Content</button>
          </div>
        </div>

        {/* Filters + Stats */}
        <div className="flex items-center gap-3 flex-wrap">
          <select value={quarterFilter} onChange={e => setQuarterFilter(e.target.value)} className="input-field w-auto text-[11px]">
            <option value="">All Quarters</option>
            {getQuarters().map(q => <option key={q}>{q}</option>)}
          </select>
          <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="input-field w-auto text-[11px]">
            <option value="">All Clients</option>
            {allClients.map(c => <option key={c}>{c}</option>)}
          </select>
          <div className="flex items-center gap-1 ml-2">
            <button onClick={() => setView('board')} className={`px-2.5 py-1 rounded text-[10px] font-semibold border ${view === 'board' ? 'bg-[#F5C518] text-[#1a1a1a] border-[#F5C518]' : 'bg-white text-gray-500 border-gray-200'}`}>Board</button>
            <button onClick={() => setView('table')} className={`px-2.5 py-1 rounded text-[10px] font-semibold border ${view === 'table' ? 'bg-[#F5C518] text-[#1a1a1a] border-[#F5C518]' : 'bg-white text-gray-500 border-gray-200'}`}>Table</button>
          </div>
          <div className="ml-auto flex items-center gap-4 text-[10px] text-gray-500">
            <span>Total: <b className="text-[#1a1a1a]">{stats.total}</b></span>
            <span>Planned: <b>{stats.Planned || 0}</b></span>
            <span>Researched: <b className="text-[#F5C518]">{stats.Researched || 0}</b></span>
            <span>Briefed: <b className="text-blue-500">{stats.Briefed || 0}</b></span>
            <span>Approved: <b className="text-emerald-500">{stats['Client Approved'] || 0}</b></span>
            <span>Sent: <b className="text-green-600">{stats['Sent to Airtable'] || 0}</b></span>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Loading...</div>
      ) : view === 'board' ? (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-x-auto p-4">
            <div className="flex gap-3 min-w-max h-full">
              {STATUSES.map(status => {
                const items = plans.filter(p => p.status === status);
                return (
                  <Droppable key={status} droppableId={status}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`w-64 shrink-0 rounded-lg flex flex-col ${snapshot.isDraggingOver ? 'bg-[#F5C518]/10' : 'bg-gray-50'}`}
                      >
                        <div className="px-3 py-2 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
                          <span className="text-[11px] font-semibold text-gray-600">{status}</span>
                          <span className="text-[10px] text-gray-400 ml-auto">{items.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto px-2 pb-2">
                          {items.map((item, idx) => (
                            <Draggable key={item.id} draggableId={item.id} index={idx}>
                              {(prov) => (
                                <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}>
                                  <PlanCard item={item} onClick={() => { setEditItem(item); setShowAdd(true); }} onDelete={handleDelete} />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      </div>
                    )}
                  </Droppable>
                );
              })}
            </div>
          </div>
        </DragDropContext>
      ) : (
        <div className="flex-1 overflow-auto p-4">
          <table className="w-full bg-white border border-gray-200 rounded-lg overflow-hidden text-[11px]">
            <thead>
              <tr className="bg-[#f8f8f6] border-b border-gray-200">
                <th className="text-left px-3 py-2 font-semibold text-gray-500">Client</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">Month</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">Type</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">Title</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">FK</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-500">SV</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-500">KD</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">Status</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">Assigned</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {plans.map(item => (
                <tr key={item.id} className={`border-b border-gray-100 hover:bg-[#f8f8f6] ${item.status === 'Complete' ? 'bg-green-50/50' : ''}`}>
                  <td className="px-3 py-2 text-gray-700">{item.client_name}</td>
                  <td className="px-3 py-2 text-gray-500">{item.month || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0 rounded ${item.is_refresh ? 'bg-orange-50 text-orange-500' : 'bg-blue-50 text-blue-600'}`}>
                      {item.is_refresh ? 'Refresh' : 'New'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate cursor-pointer hover:text-[#F5C518]" onClick={() => { setEditItem(item); setShowAdd(true); }}>
                    {item.title}
                  </td>
                  <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">{item.focus_keyword || '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{item.search_volume?.toLocaleString() || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    {item.kd !== null && item.kd !== undefined ? (
                      <span className={`font-semibold ${item.kd <= 20 ? 'text-green-600' : item.kd <= 50 ? 'text-orange-500' : 'text-red-500'}`}>{item.kd}</span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={item.status}
                      onChange={async (e) => {
                        await supabase.from('content_plans').update({ status: e.target.value, updated_at: new Date().toISOString() }).eq('id', item.id);
                        fetchPlans();
                      }}
                      className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white"
                    >
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-gray-400">{item.assigned_to || '—'}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => handleDelete(item.id)} className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer text-xs">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PlanModal open={showAdd} onClose={() => { setShowAdd(false); setEditItem(null); }} onSave={handleSave} onDelete={handleDelete} item={editItem} clients={allClients.length ? allClients : ['Client 1']} dbClients={dbClients} />
      <ImportModal open={showImport} onClose={() => setShowImport(false)} onImport={handleImport} clients={allClients.length ? allClients : ['Client 1']} />

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
