import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import toast from 'react-hot-toast';

const PLATFORMS = ['Google Ads', 'Meta Ads', 'LinkedIn Ads', 'TikTok Ads', 'Microsoft Ads'];
const STATUSES = ['active', 'paused', 'ended'];
const STATUS_DOT = { active: 'bg-green-500', paused: 'bg-yellow-500', ended: 'bg-gray-400' };
const STATUS_LABEL = { active: 'Running', paused: 'Paused', ended: 'Ended' };

export default function ClientAdDashboard() {
  const { clients } = useClients();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedClient, setExpandedClient] = useState(null);
  const [showAddForm, setShowAddForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('clients'); // 'clients' | 'all'
  const [hideInactive, setHideInactive] = useState(false);

  useEffect(() => {
    supabase.from('client_campaigns')
      .select('*')
      .order('client_name')
      .order('status')
      .then(({ data, error }) => {
        if (error && error.code !== '42P01') console.error(error);
        setCampaigns(data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Group campaigns by client
  const clientData = useMemo(() => {
    const map = {};
    clients.forEach(c => {
      map[c.name] = { client: c, campaigns: [], totalDaily: 0, totalMonthly: 0, hasActive: false };
    });
    campaigns.forEach(camp => {
      if (!map[camp.client_name]) {
        map[camp.client_name] = { client: { name: camp.client_name }, campaigns: [], totalDaily: 0, totalMonthly: 0, hasActive: false };
      }
      map[camp.client_name].campaigns.push(camp);
      if (camp.status === 'active') {
        map[camp.client_name].hasActive = true;
        const daily = parseFloat(camp.cost_per_day) || 0;
        const monthly = parseFloat(camp.cost_per_month) || daily * 30;
        map[camp.client_name].totalDaily += daily;
        map[camp.client_name].totalMonthly += monthly;
      }
    });

    let result = Object.values(map).sort((a, b) => {
      if (a.hasActive && !b.hasActive) return -1;
      if (!a.hasActive && b.hasActive) return 1;
      return a.client.name.localeCompare(b.client.name);
    });

    if (hideInactive) result = result.filter(d => d.hasActive);

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(d =>
        d.client.name.toLowerCase().includes(q) ||
        d.campaigns.some(c => (c.campaign_name || '').toLowerCase().includes(q))
      );
    }
    return result;
  }, [clients, campaigns, search, hideInactive]);

  // Flat list of all campaigns for "All Campaigns" view
  const allCampaignsList = useMemo(() => {
    let list = campaigns.map(c => ({ ...c, _daily: parseFloat(c.cost_per_day) || 0, _monthly: parseFloat(c.cost_per_month) || (parseFloat(c.cost_per_day) || 0) * 30 }));
    if (hideInactive) list = list.filter(c => c.status === 'active');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => (c.client_name || '').toLowerCase().includes(q) || (c.campaign_name || '').toLowerCase().includes(q));
    }
    return list.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      return a.client_name.localeCompare(b.client_name);
    });
  }, [campaigns, search, hideInactive]);

  const totalActiveClients = clientData.filter(d => d.hasActive).length;
  const totalActiveCampaigns = campaigns.filter(c => c.status === 'active').length;
  const totalMonthlySpend = clientData.reduce((s, d) => s + d.totalMonthly, 0);

  const handleSave = async (formData) => {
    const payload = { ...formData, updated_at: new Date().toISOString() };
    try {
      if (editingId) {
        const { error } = await supabase.from('client_campaigns').update(payload).eq('id', editingId);
        if (error) throw error;
        setCampaigns(prev => prev.map(c => c.id === editingId ? { ...c, ...payload } : c));
        toast.success('Campaign updated');
      } else {
        payload.created_at = new Date().toISOString();
        const { data, error } = await supabase.from('client_campaigns').insert(payload).select().single();
        if (error) throw error;
        setCampaigns(prev => [...prev, data]);
        toast.success('Campaign added');
      }
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
    setShowAddForm(null);
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this campaign?')) return;
    const { error } = await supabase.from('client_campaigns').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    setCampaigns(prev => prev.filter(c => c.id !== id));
    toast.success('Deleted');
  };

  const handleToggleStatus = async (camp) => {
    const next = camp.status === 'active' ? 'paused' : 'active';
    const { error } = await supabase.from('client_campaigns')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', camp.id);
    if (error) { toast.error(error.message); return; }
    setCampaigns(prev => prev.map(c => c.id === camp.id ? { ...c, status: next } : c));
    toast.success(`Campaign ${STATUS_LABEL[next].toLowerCase()}`);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="bg-white border-b border-gray-200 px-5 py-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-[#1a1a1a]">📣 Client Ad Dashboard</h1>
            <p className="text-[11px] text-gray-400">Track running campaigns, budgets, and status across all clients</p>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients or campaigns..."
            className="border border-gray-200 rounded px-3 py-1.5 text-xs bg-[#f8f8f6] w-64" />
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-4 mt-3 text-[11px] flex-wrap">
          {/* View toggle */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode('clients')}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded-md cursor-pointer border-none ${viewMode === 'clients' ? 'bg-white text-[#1a1a1a] shadow-sm' : 'bg-transparent text-gray-500'}`}>
              By Client
            </button>
            <button onClick={() => setViewMode('all')}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded-md cursor-pointer border-none ${viewMode === 'all' ? 'bg-white text-[#1a1a1a] shadow-sm' : 'bg-transparent text-gray-500'}`}>
              All Campaigns
            </button>
          </div>

          {/* Hide inactive toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-gray-500">
            <input type="checkbox" checked={hideInactive} onChange={e => setHideInactive(e.target.checked)} className="accent-[#F5C518]" />
            Hide inactive
          </label>

          <div className="flex-1"></div>

          {/* Stats */}
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span className="text-gray-500"><b className="text-[#1a1a1a]">{totalActiveClients}</b> running</span>
          </div>
          <span className="text-gray-500"><b className="text-[#1a1a1a]">{totalActiveCampaigns}</b> campaigns</span>
          <span className="text-gray-500">Spend: <b className="text-[#1a1a1a]">${totalMonthlySpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo</b></span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-5xl mx-auto space-y-2">
          {loading ? (
            <div className="text-center py-10 text-gray-400">Loading...</div>
          ) : viewMode === 'all' ? (
            /* ── ALL CAMPAIGNS flat table view ── */
            allCampaignsList.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-4xl mb-2 opacity-30">📣</div>
                <div className="text-sm text-gray-500">No campaigns found</div>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-[#f8f8f6] border-b border-gray-200 text-left text-gray-500">
                      <th className="px-3 py-2.5 font-semibold w-8"></th>
                      <th className="px-3 py-2.5 font-semibold">Client</th>
                      <th className="px-3 py-2.5 font-semibold">Campaign</th>
                      <th className="px-3 py-2.5 font-semibold">Platform</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-3 py-2.5 font-semibold text-right">$/Day</th>
                      <th className="px-3 py-2.5 font-semibold text-right">$/Month</th>
                      <th className="px-3 py-2.5 font-semibold">Notes</th>
                      <th className="px-3 py-2.5 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {allCampaignsList.map(camp => (
                      <tr key={camp.id} className={`border-b border-gray-100 hover:bg-[#f8f8f6] ${camp.status !== 'active' ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2.5">
                          <button onClick={() => handleToggleStatus(camp)}
                            className="bg-transparent border-none cursor-pointer p-0" title={`Click to ${camp.status === 'active' ? 'pause' : 'activate'}`}>
                            <span className={`w-2.5 h-2.5 rounded-full block ${STATUS_DOT[camp.status]} ${camp.status === 'active' ? 'animate-pulse' : ''}`}></span>
                          </button>
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-[#1a1a1a]">{camp.client_name}</td>
                        <td className="px-3 py-2.5 text-gray-700">{camp.campaign_name}</td>
                        <td className="px-3 py-2.5 text-gray-500 text-[11px]">{camp.platform}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10px] font-bold uppercase ${camp.status === 'active' ? 'text-green-600' : camp.status === 'paused' ? 'text-yellow-600' : 'text-gray-400'}`}>
                            {STATUS_LABEL[camp.status]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-[#1a1a1a]">{camp._daily > 0 ? `$${camp._daily.toFixed(2)}` : '—'}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-[#1a1a1a]">{camp._monthly > 0 ? `$${camp._monthly.toFixed(2)}` : '—'}</td>
                        <td className="px-3 py-2.5 text-[10px] text-gray-400 max-w-[180px] truncate" title={camp.notes || ''}>{camp.notes || '—'}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <button onClick={() => { setEditingId(camp.id); setExpandedClient(camp.client_name); setViewMode('clients'); }}
                            className="text-[10px] text-gray-300 hover:text-[#F5C518] bg-transparent border-none cursor-pointer mr-1">✏️</button>
                          <button onClick={() => handleDelete(camp.id)}
                            className="text-[10px] text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer">🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#f8f8f6] border-t border-gray-200">
                      <td colSpan={5} className="px-3 py-2.5 text-right text-[11px] font-bold text-gray-500 uppercase">
                        {allCampaignsList.filter(c => c.status === 'active').length} active campaigns
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-[#1a1a1a] text-[12px]">
                        ${allCampaignsList.filter(c => c.status === 'active').reduce((s, c) => s + c._daily, 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-[#1a1a1a] text-[12px]">
                        ${allCampaignsList.filter(c => c.status === 'active').reduce((s, c) => s + c._monthly, 0).toFixed(2)}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          ) : clientData.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-2 opacity-30">📣</div>
              <div className="text-sm text-gray-500">{hideInactive ? 'No clients with active campaigns' : 'No clients found'}</div>
            </div>
          ) : (
            clientData.map(({ client, campaigns: clientCamps, hasActive, totalDaily, totalMonthly }) => {
              const isExpanded = expandedClient === client.name;
              const activeCamps = clientCamps.filter(c => c.status === 'active');
              const otherCamps = clientCamps.filter(c => c.status !== 'active');

              return (
                <div key={client.name} className={`bg-white border rounded-xl overflow-hidden transition-shadow ${
                  hasActive ? 'border-green-200 hover:shadow-md' : 'border-gray-200'
                }`}>
                  {/* Client header */}
                  <div
                    onClick={() => setExpandedClient(isExpanded ? null : client.name)}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#f8f8f6] transition-colors"
                  >
                    <span className={`w-3 h-3 rounded-full shrink-0 ${hasActive ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`}></span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-[#1a1a1a]">{client.name}</div>
                      <div className="text-[10px] text-gray-400">
                        {clientCamps.length === 0 ? 'No campaigns' :
                          `${activeCamps.length} active · ${otherCamps.length} paused/ended`}
                      </div>
                    </div>
                    {hasActive && (
                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-gray-400">Daily / Monthly</div>
                        <div className="text-[12px] font-bold text-[#1a1a1a]">
                          ${totalDaily.toFixed(2)} / ${totalMonthly.toFixed(2)}
                        </div>
                      </div>
                    )}
                    <span className={`text-[10px] text-gray-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                  </div>

                  {/* Expanded: campaign list */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-[#fafafa]">
                      {clientCamps.length === 0 ? (
                        <div className="px-4 py-6 text-center text-[11px] text-gray-400">
                          No campaigns yet for {client.name}
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {[...activeCamps, ...otherCamps].map(camp => {
                            const daily = parseFloat(camp.cost_per_day) || 0;
                            const monthly = parseFloat(camp.cost_per_month) || daily * 30;
                            const isEditing = editingId === camp.id;

                            if (isEditing) {
                              return (
                                <CampaignForm
                                  key={camp.id}
                                  initial={camp}
                                  clientName={client.name}
                                  onSave={handleSave}
                                  onCancel={() => setEditingId(null)}
                                />
                              );
                            }

                            return (
                              <div key={camp.id} className={`flex items-center gap-3 px-4 py-2.5 ${camp.status !== 'active' ? 'opacity-50' : ''}`}>
                                <button onClick={(e) => { e.stopPropagation(); handleToggleStatus(camp); }}
                                  className="bg-transparent border-none cursor-pointer p-0 shrink-0" title={`Click to ${camp.status === 'active' ? 'pause' : 'activate'}`}>
                                  <span className={`w-2.5 h-2.5 rounded-full block ${STATUS_DOT[camp.status]}`}></span>
                                </button>
                                <div className="flex-1 min-w-0">
                                  <div className="text-[12px] font-semibold text-[#1a1a1a] truncate">{camp.campaign_name || 'Untitled'}</div>
                                  <div className="text-[10px] text-gray-400 flex items-center gap-2">
                                    {camp.platform && <span>{camp.platform}</span>}
                                    <span className={`font-bold uppercase ${camp.status === 'active' ? 'text-green-600' : camp.status === 'paused' ? 'text-yellow-600' : 'text-gray-400'}`}>
                                      {STATUS_LABEL[camp.status]}
                                    </span>
                                    {camp.start_date && <span>Started {new Date(camp.start_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>}
                                  </div>
                                </div>
                                {camp.status === 'active' && (
                                  <div className="text-right shrink-0">
                                    <div className="text-[11px] font-bold text-[#1a1a1a]">${daily.toFixed(2)}/day</div>
                                    <div className="text-[9px] text-gray-400">${monthly.toFixed(2)}/mo</div>
                                  </div>
                                )}
                                {camp.notes && (
                                  <div className="text-[9px] text-gray-400 max-w-[150px] truncate shrink-0 border-l border-gray-200 pl-2 ml-1" title={camp.notes}>
                                    📝 {camp.notes}
                                  </div>
                                )}
                                <div className="flex gap-1 shrink-0">
                                  <button onClick={() => setEditingId(camp.id)}
                                    className="text-[10px] text-gray-300 hover:text-[#F5C518] bg-transparent border-none cursor-pointer">✏️</button>
                                  <button onClick={() => handleDelete(camp.id)}
                                    className="text-[10px] text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer">🗑</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Add campaign form or button */}
                      {showAddForm === client.name ? (
                        <CampaignForm
                          clientName={client.name}
                          onSave={handleSave}
                          onCancel={() => setShowAddForm(null)}
                        />
                      ) : (
                        <div className="px-4 py-2 border-t border-gray-100">
                          <button onClick={() => { setShowAddForm(client.name); setEditingId(null); }}
                            className="text-[11px] text-[#F5C518] font-bold bg-transparent border-none cursor-pointer hover:underline">
                            + Add Campaign
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function CampaignForm({ initial, clientName, onSave, onCancel }) {
  const [form, setForm] = useState({
    client_name: initial?.client_name || clientName,
    campaign_name: initial?.campaign_name || '',
    platform: initial?.platform || 'Google Ads',
    status: initial?.status || 'active',
    cost_per_day: initial?.cost_per_day || '',
    cost_per_month: initial?.cost_per_month || '',
    start_date: initial?.start_date || new Date().toISOString().split('T')[0],
    objective: initial?.objective || '',
    landing_url: initial?.landing_url || '',
    notes: initial?.notes || '',
  });

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const estMonthly = () => {
    if (form.cost_per_month) return parseFloat(form.cost_per_month);
    if (form.cost_per_day) return (parseFloat(form.cost_per_day) * 30).toFixed(2);
    return '—';
  };

  return (
    <div className="px-4 py-3 bg-white border-t border-[#F5C518]/30">
      <div className="text-[10px] font-bold uppercase text-[#F5C518] mb-2">{initial ? 'Edit' : 'Add'} Campaign — {clientName}</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
        <div className="md:col-span-2">
          <input value={form.campaign_name} onChange={set('campaign_name')} placeholder="Campaign name"
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-[#f8f8f6]" />
        </div>
        <select value={form.platform} onChange={set('platform')}
          className="border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-[#f8f8f6]">
          {PLATFORMS.map(p => <option key={p}>{p}</option>)}
        </select>
        <select value={form.status} onChange={set('status')}
          className="border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-[#f8f8f6]">
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-2">
        <div>
          <input type="number" step="0.01" value={form.cost_per_day} onChange={set('cost_per_day')} placeholder="$/day"
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-[#f8f8f6]" />
        </div>
        <div>
          <input type="number" step="0.01" value={form.cost_per_month} onChange={set('cost_per_month')}
            placeholder={`$/mo (est: ${estMonthly()})`}
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-[#f8f8f6]" />
        </div>
        <input type="date" value={form.start_date} onChange={set('start_date')}
          className="border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-[#f8f8f6]" />
        <input value={form.objective} onChange={set('objective')} placeholder="Objective (leads, traffic...)"
          className="border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-[#f8f8f6]" />
        <input value={form.landing_url} onChange={set('landing_url')} placeholder="Landing page URL"
          className="border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-[#f8f8f6]" />
      </div>
      <div className="mb-2">
        <input value={form.notes} onChange={set('notes')} placeholder="Notes — budget changes, performance observations, etc."
          className="w-full border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-[#f8f8f6]" />
      </div>
      <div className="flex gap-2">
        <button onClick={() => { if (!form.campaign_name.trim()) { toast.error('Campaign name required'); return; } onSave(form); }}
          className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-3 py-1.5 text-[10px] font-bold cursor-pointer hover:bg-[#e6b800]">
          {initial ? 'Save' : 'Add Campaign'}
        </button>
        <button onClick={onCancel}
          className="bg-transparent border border-gray-300 text-gray-600 rounded px-3 py-1.5 text-[10px] cursor-pointer">Cancel</button>
      </div>
    </div>
  );
}
