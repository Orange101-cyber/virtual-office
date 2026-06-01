import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import * as dfs from '../lib/dataForSeo';
import toast from 'react-hot-toast';

const CATEGORIES = [
  { id: 'general', label: 'General Pages', icon: '🏠' },
  { id: 'service', label: 'Service Pages', icon: '💼' },
  { id: 'location', label: 'Location Pages', icon: '📍' },
  { id: 'landing', label: 'Landing Pages', icon: '🎯' },
  { id: 'blog', label: 'Blogs', icon: '📝' },
];

const REFRESH_SCHEDULES = [
  { value: '', label: 'Not set' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Every 6 months' },
  { value: 'yearly', label: 'Yearly' },
  { value: '2_years', label: 'Every 2 years' },
];

function scoreFromChecklist(state) {
  if (!state || typeof state !== 'object') return null;
  const values = Object.values(state);
  if (!values.length) return null;
  const passed = values.filter(Boolean).length;
  return Math.round((passed / values.length) * 100);
}

function scoreColor(score) {
  if (score == null) return 'bg-gray-100 text-gray-400';
  if (score >= 85) return 'bg-green-50 text-green-700 border border-green-200';
  if (score >= 60) return 'bg-orange-50 text-orange-700 border border-orange-200';
  return 'bg-red-50 text-red-700 border border-red-200';
}

// ── Refresh due-date helpers ──
const SCHEDULE_MONTHS = { quarterly: 3, half_yearly: 6, yearly: 12, '2_years': 24 };

function lastRefreshDate(p) {
  if (p.is_refreshed && p.date_refreshed) return new Date(p.date_refreshed);
  if (p.date_published) return new Date(p.date_published);
  return p.updated_at ? new Date(p.updated_at) : null;
}

function expectedIntervalMonths(p) {
  // General/Service pages honour their explicit refresh_schedule
  if (p.refresh_schedule && SCHEDULE_MONTHS[p.refresh_schedule]) {
    return SCHEDULE_MONTHS[p.refresh_schedule];
  }
  // Default: blogs & landing pages are worth refreshing yearly
  if (p.page_category === 'blog' || p.page_category === 'landing') return 12;
  return null; // no refresh expectation
}

function daysUntilRefresh(p) {
  const interval = expectedIntervalMonths(p);
  if (!interval) return null;
  const base = lastRefreshDate(p);
  if (!base) return null;
  const due = new Date(base);
  due.setMonth(due.getMonth() + interval);
  return Math.round((due - Date.now()) / 86400000);
}

function isDueForRefresh(p) {
  const days = daysUntilRefresh(p);
  return days !== null && days <= 0;
}

export default function ClientBucketList() {
  const { clients } = useClients();
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [category, setCategory] = useState('general');
  const [pages, setPages] = useState([]);
  const [reports, setReports] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showDueOnly, setShowDueOnly] = useState(false);
  const [showScan, setShowScan] = useState(false);

  // Resolve client id
  useEffect(() => {
    if (!selectedClient) { setSelectedClientId(null); return; }
    const c = clients.find(c => c.name === selectedClient);
    setSelectedClientId(c?.id || null);
  }, [selectedClient, clients]);

  // Load pages + reports + brand voice buckets for this client
  useEffect(() => {
    if (!selectedClient) { setPages([]); setReports([]); setBuckets([]); return; }
    setLoading(true);
    Promise.all([
      supabase.from('client_pages').select('*').eq('client_name', selectedClient).order('updated_at', { ascending: false }),
      selectedClientId
        ? supabase.from('reports').select('id, url, focus_keyphrase, checklist_state').eq('client_id', selectedClientId)
        : Promise.resolve({ data: [] }),
      supabase.from('client_brand_voice').select('services').eq('client_name', selectedClient).single(),
    ]).then(([pagesRes, reportsRes, bvRes]) => {
      setPages(pagesRes.error ? [] : (pagesRes.data || []));
      setReports(reportsRes.data || []);
      const bvBuckets = (bvRes.data?.services || '').split('\n').map(s => s.trim()).filter(Boolean);
      setBuckets(bvBuckets);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [selectedClient, selectedClientId]);

  // Match SEO score from reports by URL
  const scoreForUrl = (url) => {
    if (!url) return null;
    const clean = url.toLowerCase().trim().replace(/\/$/, '');
    const match = reports.find(r => (r.url || '').toLowerCase().trim().replace(/\/$/, '') === clean);
    return match ? scoreFromChecklist(match.checklist_state) : null;
  };

  const reportIdForUrl = (url) => {
    if (!url) return null;
    const clean = url.toLowerCase().trim().replace(/\/$/, '');
    const match = reports.find(r => (r.url || '').toLowerCase().trim().replace(/\/$/, '') === clean);
    return match?.id || null;
  };

  const filteredPages = useMemo(() => {
    let result = pages.filter(p => p.page_category === category);
    if (showDueOnly) result = result.filter(isDueForRefresh);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        (p.url || '').toLowerCase().includes(q) ||
        (p.focus_keyword || '').toLowerCase().includes(q) ||
        (p.title || '').toLowerCase().includes(q) ||
        (p.bucket || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [pages, category, search, showDueOnly]);

  // Count per category for tab badges
  const counts = useMemo(() => {
    const c = {};
    CATEGORIES.forEach(cat => { c[cat.id] = pages.filter(p => p.page_category === cat.id).length; });
    return c;
  }, [pages]);

  // Due-for-refresh count across all categories
  const dueCount = useMemo(() => pages.filter(isDueForRefresh).length, [pages]);

  const handleSave = async (data) => {
    // Convert empty strings to null for date columns (Postgres rejects "")
    const cleaned = { ...data };
    ['date_published', 'date_refreshed'].forEach(key => {
      if (cleaned[key] === '') cleaned[key] = null;
    });
    const payload = {
      ...cleaned,
      client_name: selectedClient,
      client_id: selectedClientId,
      page_category: cleaned.page_category || category,
      updated_at: new Date().toISOString(),
    };
    try {
      if (editingId) {
        const { error } = await supabase.from('client_pages').update(payload).eq('id', editingId);
        if (error) throw error;
        setPages(prev => prev.map(p => p.id === editingId ? { ...p, ...payload } : p));
        toast.success('Page updated');
      } else {
        payload.created_at = new Date().toISOString();
        const { data: newPage, error } = await supabase.from('client_pages').insert(payload).select().single();
        if (error) throw error;
        setPages(prev => [newPage, ...prev]);
        toast.success('Page added');
      }

      // Sync focus keyword to client's past_keywords bank for cannibalization
      if (data.focus_keyword && selectedClientId) {
        const { data: client } = await supabase.from('clients').select('past_keywords').eq('id', selectedClientId).single();
        const existing = (client?.past_keywords || '').split('\n').map(k => k.trim()).filter(Boolean);
        if (!existing.some(k => k.toLowerCase() === data.focus_keyword.toLowerCase())) {
          const updated = [...existing, data.focus_keyword].join('\n');
          await supabase.from('clients').update({ past_keywords: updated }).eq('id', selectedClientId);
        }
      }
    } catch (err) {
      toast.error('Save error: ' + err.message);
    }
    setShowForm(false);
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this entry?')) return;
    const { error } = await supabase.from('client_pages').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    setPages(prev => prev.filter(p => p.id !== id));
    toast.success('Deleted');
  };

  // Bulk import rows from CSV
  const handleImportRows = async (rows) => {
    if (!rows.length) return;
    const payload = rows.map(r => ({
      ...r,
      client_name: selectedClient,
      client_id: selectedClientId,
      page_category: category,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    try {
      const { data, error } = await supabase.from('client_pages').insert(payload).select();
      if (error) throw error;
      setPages(prev => [...(data || []), ...prev]);

      // Sync all focus keywords to client's past_keywords bank
      if (selectedClientId) {
        const newKws = rows.map(r => r.focus_keyword).filter(Boolean);
        if (newKws.length) {
          const { data: client } = await supabase.from('clients').select('past_keywords').eq('id', selectedClientId).single();
          const existing = (client?.past_keywords || '').split('\n').map(k => k.trim()).filter(Boolean);
          const existingLower = new Set(existing.map(k => k.toLowerCase()));
          const toAdd = newKws.filter(k => !existingLower.has(k.toLowerCase()));
          if (toAdd.length) {
            const updated = [...existing, ...toAdd].join('\n');
            await supabase.from('clients').update({ past_keywords: updated }).eq('id', selectedClientId);
          }
        }
      }
      toast.success(`Imported ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`);
    } catch (err) {
      toast.error('Import error: ' + err.message);
    }
    setShowImport(false);
  };

  // Create a content_plans entry from a page — useful when refreshing
  const handlePlanRefresh = async (p) => {
    if (!selectedClient) return;
    const now = new Date();
    const quarter = `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
    const month = now.toLocaleDateString('en-AU', { month: 'long' });
    try {
      await supabase.from('content_plans').insert({
        client_name: selectedClient,
        quarter,
        month,
        content_type: p.page_category === 'blog' ? 'Blog' : 'SEO Page',
        title: p.title || p.focus_keyword || p.url,
        is_refresh: true,
        focus_keyword: p.new_focus_keyword || p.focus_keyword || '',
        status: 'Planned',
      });
      toast.success(`Added to Content Planner — ${quarter} ${month}`);
    } catch (err) {
      toast.error('Plan error: ' + err.message);
    }
  };

  const handleExport = () => {
    const rows = pages.map(p => ({
      Category: CATEGORIES.find(c => c.id === p.page_category)?.label || p.page_category,
      Title: p.title || '',
      URL: p.url || '',
      'Focus Keyword': p.focus_keyword || '',
      Bucket: p.bucket || '',
      'Refresh Schedule': p.refresh_schedule || '',
      'Date Published': p.date_published || '',
      Refreshed: p.is_refreshed ? 'Yes' : 'No',
      'Date Refreshed': p.date_refreshed || '',
      'New FK': p.new_focus_keyword || '',
      Notes: p.notes || '',
    }));
    if (!rows.length) { toast.error('Nothing to export'); return; }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r[h] || '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedClient}-bucket-list-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link to="/seo-tools" className="text-[10px] text-gray-400 hover:text-[#F5C518] no-underline">← SEO Tools</Link>
            <h1 className="text-lg font-bold text-[#1a1a1a] leading-tight mt-1">📋 Client Bucket List</h1>
            <p className="text-[11px] text-gray-400">
              Track every page + keyword per client. Syncs with cannibalization checker + SEO Checker scores.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold uppercase text-gray-400">Client:</label>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="border border-gray-200 rounded px-2.5 py-1.5 text-xs bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518] min-w-[200px]"
            >
              <option value="">Select a client...</option>
              {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            {selectedClient && (
              <button onClick={handleExport}
                className="bg-transparent border border-gray-200 text-gray-600 rounded px-2.5 py-1.5 text-[10px] font-semibold cursor-pointer hover:border-[#F5C518]">
                📥 Export CSV
              </button>
            )}
          </div>
        </div>
      </div>

      {!selectedClient ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-sm text-gray-500">Select a client to view their bucket list</div>
          </div>
        </div>
      ) : (
        <>
          {/* Category tabs */}
          <div className="bg-white border-b border-gray-200 px-5 shrink-0 flex items-end gap-1 overflow-x-auto">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`px-3 py-2 text-[11px] font-bold uppercase tracking-wider cursor-pointer bg-transparent border-none border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                  category === cat.id
                    ? 'text-[#1a1a1a] border-[#F5C518]'
                    : 'text-gray-400 border-transparent hover:text-gray-600'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
                {counts[cat.id] > 0 && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${category === cat.id ? 'bg-[#F5C518] text-[#1a1a1a]' : 'bg-gray-100 text-gray-500'}`}>
                    {counts[cat.id]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Action bar */}
          <div className="bg-[#f8f8f6] border-b border-gray-200 px-5 py-2.5 shrink-0 flex items-center gap-2 flex-wrap">
            <button onClick={() => { setShowForm(true); setEditingId(null); }}
              className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800]">
              + Add {CATEGORIES.find(c => c.id === category)?.label.replace(/s$/, '')}
            </button>
            <button onClick={() => setShowImport(true)}
              className="bg-white border border-gray-300 text-gray-700 rounded px-3 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-[#F5C518]">
              📥 Import CSV
            </button>
            <button onClick={() => setShowScan(true)}
              className="bg-white border border-gray-300 text-gray-700 rounded px-3 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-[#F5C518]">
              🔍 Scan Website
            </button>
            {dueCount > 0 && (
              <button onClick={() => setShowDueOnly(!showDueOnly)}
                className={`rounded px-3 py-1.5 text-[11px] font-bold cursor-pointer border ${
                  showDueOnly
                    ? 'bg-red-500 text-white border-red-500'
                    : 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'
                }`}>
                ⚠ {dueCount} Due for Refresh {showDueOnly ? '(clear filter)' : ''}
              </button>
            )}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by URL, keyword, bucket..."
              className="flex-1 border border-gray-200 rounded px-2.5 py-1.5 text-xs bg-white max-w-sm"
            />
            <div className="text-[10px] text-gray-400 ml-auto">
              {filteredPages.length} {filteredPages.length === 1 ? 'entry' : 'entries'}
            </div>
          </div>

          {/* Form */}
          {showForm && (
            <div id="bucket-form" className="bg-white border-b border-gray-200 px-5 py-4 shrink-0">
              <PageForm
                category={category}
                buckets={buckets}
                initial={editingId ? pages.find(p => p.id === editingId) : null}
                onSave={handleSave}
                onCancel={() => { setShowForm(false); setEditingId(null); }}
              />
            </div>
          )}

          {/* CSV Import Modal */}
          {showImport && (
            <CsvImportModal
              category={category}
              onImport={handleImportRows}
              onClose={() => setShowImport(false)}
            />
          )}

          {/* Website Scan Modal */}
          {showScan && (
            <WebsiteScanModal
              clientName={selectedClient}
              clientId={selectedClientId}
              existingPages={pages}
              onImport={handleImportRows}
              onClose={() => setShowScan(false)}
            />
          )}

          {/* Table */}
          <div className="flex-1 overflow-auto p-5">
            {loading ? (
              <div className="text-center py-10 text-gray-400">Loading...</div>
            ) : filteredPages.length === 0 ? (
              <div className="text-center py-10">
                <div className="text-3xl mb-2 opacity-30">📭</div>
                <div className="text-sm text-gray-500">No {CATEGORIES.find(c => c.id === category)?.label.toLowerCase()} yet</div>
              </div>
            ) : (
              <PageTable
                category={category}
                pages={filteredPages}
                onEdit={(id) => { setEditingId(id); setShowForm(true); setTimeout(() => document.getElementById('bucket-form')?.scrollIntoView({ behavior: 'smooth' }), 100); }}
                onDelete={handleDelete}
                onPlanRefresh={handlePlanRefresh}
                scoreForUrl={scoreForUrl}
                reportIdForUrl={reportIdForUrl}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Page Table (shows different columns per category) ──
function PageTable({ category, pages, onEdit, onDelete, onPlanRefresh, scoreForUrl, reportIdForUrl }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-[#f8f8f6] border-b border-gray-200">
            <tr className="text-left text-gray-500">
              {category === 'video' ? (
                <>
                  <th className="px-3 py-2 font-bold uppercase text-[9px]">Title</th>
                  <th className="px-3 py-2 font-bold uppercase text-[9px]">Bucket</th>
                  <th className="px-3 py-2 font-bold uppercase text-[9px]">Video Link</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-2 font-bold uppercase text-[9px]">Focus Keyword</th>
                  <th className="px-3 py-2 font-bold uppercase text-[9px]">URL</th>
                  <th className="px-3 py-2 font-bold uppercase text-[9px]">Bucket</th>
                  <th className="px-3 py-2 font-bold uppercase text-[9px]">Score</th>
                  {(category === 'general' || category === 'service') && (
                    <th className="px-3 py-2 font-bold uppercase text-[9px]">Refresh</th>
                  )}
                  {(category === 'landing' || category === 'blog') && (
                    <>
                      <th className="px-3 py-2 font-bold uppercase text-[9px]">Published</th>
                      <th className="px-3 py-2 font-bold uppercase text-[9px]">Refreshed</th>
                    </>
                  )}
                  {category === 'blog' && (
                    <>
                      <th className="px-3 py-2 font-bold uppercase text-[9px]">AT</th>
                      <th className="px-3 py-2 font-bold uppercase text-[9px]">Live</th>
                      <th className="px-3 py-2 font-bold uppercase text-[9px]">Video</th>
                    </>
                  )}
                </>
              )}
              <th className="px-3 py-2 font-bold uppercase text-[9px] w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pages.map(p => {
              const score = category !== 'video' ? scoreForUrl(p.url) : null;
              const reportId = category !== 'video' ? reportIdForUrl(p.url) : null;
              const dueDays = category !== 'video' ? daysUntilRefresh(p) : null;
              const isDue = dueDays !== null && dueDays <= 0;
              const isSoon = dueDays !== null && dueDays > 0 && dueDays <= 30;
              return (
                <tr key={p.id} className={`border-b border-gray-100 hover:bg-[#f8f8f6] ${isDue ? 'bg-red-50/40' : ''}`}>
                  {category === 'video' ? (
                    <>
                      <td className="px-3 py-2 font-semibold text-[#1a1a1a]">{p.title || '—'}</td>
                      <td className="px-3 py-2"><span className="text-[10px] bg-[#F5C518]/20 text-[#1a1a1a] font-semibold px-1.5 py-0.5 rounded">{p.bucket || '—'}</span></td>
                      <td className="px-3 py-2">
                        {p.video_drive_link ? (
                          <a href={p.video_drive_link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-[10px]">🎬 Open</a>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-semibold text-[#1a1a1a]">
                        {p.focus_keyword || <span className="text-gray-300">—</span>}
                        {p.new_focus_keyword && (
                          <div className="text-[9px] text-blue-600 mt-0.5">→ {p.new_focus_keyword}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {p.url ? (
                          <a href={p.url} target="_blank" rel="noopener noreferrer"
                            className="text-blue-500 hover:underline text-[10px] block max-w-xs truncate">
                            {p.url.replace(/^https?:\/\//, '')}
                          </a>
                        ) : <span className="text-gray-300">—</span>}
                        {isDue && (
                          <span className="inline-block text-[9px] font-bold uppercase bg-red-500 text-white px-1.5 py-0.5 rounded mt-1" title={`Overdue by ${Math.abs(dueDays)} days`}>
                            ⚠ Refresh due
                          </span>
                        )}
                        {isSoon && !isDue && (
                          <span className="inline-block text-[9px] font-bold uppercase bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded mt-1" title={`Due in ${dueDays} days`}>
                            ⏰ Due in {dueDays}d
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {p.bucket ? <span className="text-[10px] bg-[#F5C518]/20 text-[#1a1a1a] font-semibold px-1.5 py-0.5 rounded">{p.bucket}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {reportId ? (
                          <Link to={`/seo-checker?report=${reportId}`}
                            className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded no-underline ${scoreColor(score)}`}>
                            {score}%
                          </Link>
                        ) : (
                          <Link to="/seo-checker"
                            className="text-[9px] text-gray-400 hover:text-[#F5C518] no-underline">
                            Audit →
                          </Link>
                        )}
                      </td>
                      {(category === 'general' || category === 'service') && (
                        <td className="px-3 py-2 text-[10px] text-gray-500">
                          {REFRESH_SCHEDULES.find(s => s.value === p.refresh_schedule)?.label || '—'}
                        </td>
                      )}
                      {(category === 'landing' || category === 'blog') && (
                        <>
                          <td className="px-3 py-2 text-[10px] text-gray-500">
                            {p.date_published ? new Date(p.date_published).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                          <td className="px-3 py-2 text-[10px]">
                            {p.is_refreshed ? (
                              <span className="text-green-600 font-semibold">Yes · {p.date_refreshed || ''}</span>
                            ) : <span className="text-gray-300">No</span>}
                          </td>
                        </>
                      )}
                      {category === 'blog' && (
                        <>
                          <td className="px-3 py-2 text-center">{p.approved_in_airtable ? '✓' : <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2 text-center">{p.is_published ? '✓' : <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2 text-center">
                            {p.has_video ? (
                              p.video_drive_link ? (
                                <a href={p.video_drive_link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">🎬</a>
                              ) : '✓'
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                        </>
                      )}
                    </>
                  )}
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {category !== 'video' && (
                      <button onClick={() => onPlanRefresh(p)}
                        className="text-[10px] text-gray-400 hover:text-blue-600 bg-transparent border-none cursor-pointer mr-1"
                        title="Add to Content Planner as a refresh">📅</button>
                    )}
                    <button onClick={() => onEdit(p.id)} className="text-[10px] text-gray-400 hover:text-[#F5C518] bg-transparent border-none cursor-pointer mr-1" title="Edit">✏️</button>
                    <button onClick={() => onDelete(p.id)} className="text-[10px] text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer" title="Delete">🗑</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Add / Edit Form ──
function PageForm({ category, buckets, initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    page_category: initial?.page_category || category,
    title: initial?.title || '',
    url: initial?.url || '',
    focus_keyword: initial?.focus_keyword || '',
    bucket: initial?.bucket || '',
    refresh_schedule: initial?.refresh_schedule || '',
    date_published: initial?.date_published || '',
    is_refreshed: initial?.is_refreshed || false,
    date_refreshed: initial?.date_refreshed || '',
    new_focus_keyword: initial?.new_focus_keyword || '',
    index_setting: initial?.index_setting || (category === 'landing' ? 'noindex' : 'index'),
    approved_in_airtable: initial?.approved_in_airtable || false,
    is_published: initial?.is_published || false,
    has_video: initial?.has_video || false,
    video_drive_link: initial?.video_drive_link || '',
    notes: initial?.notes || '',
  });

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => {
      const next = { ...f, [key]: value };
      // When Refreshed is newly ticked, auto-default date_refreshed to today
      // and pre-fill new_focus_keyword hint if empty
      if (key === 'is_refreshed' && value === true) {
        if (!next.date_refreshed) next.date_refreshed = new Date().toISOString().split('T')[0];
      }
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  const activeCat = form.page_category || category;
  const isVideo = activeCat === 'video';
  const isGeneralOrService = activeCat === 'general' || activeCat === 'service';
  const isLandingOrBlog = activeCat === 'landing' || activeCat === 'blog';
  const isBlog = activeCat === 'blog';

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-center gap-3 mb-3">
        <div className="text-[11px] font-bold uppercase text-[#F5C518]">
          {initial?.id ? 'Edit' : 'Add'} Page
        </div>
        <div>
          <select value={form.page_category} onChange={set('page_category')} className="input-f text-[11px] font-semibold">
            {CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        {isVideo ? (
          <>
            <div className="md:col-span-2">
              <Label>Video Title</Label>
              <input value={form.title} onChange={set('title')} required placeholder="e.g. Spring campaign 30s"
                className="input-f" />
            </div>
            <div>
              <Label>Bucket / Theme</Label>
              <input value={form.bucket} onChange={set('bucket')} list="buckets-list" placeholder="e.g. Business Loans"
                className="input-f" />
            </div>
            <div className="md:col-span-3">
              <Label>Video Link (Google Drive / YouTube / Vimeo)</Label>
              <input value={form.video_drive_link} onChange={set('video_drive_link')} placeholder="https://..."
                className="input-f" />
            </div>
          </>
        ) : (
          <>
            <div className="md:col-span-2">
              <Label>URL</Label>
              <input value={form.url} onChange={set('url')} required placeholder="https://..."
                className="input-f" />
            </div>
            <div>
              <Label>Bucket / Theme</Label>
              <input value={form.bucket} onChange={set('bucket')} list="buckets-list" placeholder="e.g. Business Loans"
                className="input-f" />
            </div>
            <div>
              <Label>Focus Keyword</Label>
              <input value={form.focus_keyword} onChange={set('focus_keyword')} placeholder="main focus keyphrase"
                className="input-f" />
            </div>
            <div>
              <Label>Index Setting</Label>
              <select value={form.index_setting} onChange={set('index_setting')} className="input-f">
                <option value="index">Index</option>
                <option value="noindex">No-Index</option>
              </select>
            </div>
          </>
        )}
        <datalist id="buckets-list">
          {buckets.map(b => <option key={b} value={b} />)}
        </datalist>

        {isGeneralOrService && (
          <div>
            <Label>Refresh Schedule</Label>
            <select value={form.refresh_schedule} onChange={set('refresh_schedule')} className="input-f">
              {REFRESH_SCHEDULES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        )}

        {isLandingOrBlog && (
          <>
            <div>
              <Label>Date Originally Published</Label>
              <input type="date" value={form.date_published} onChange={set('date_published')} className="input-f" />
            </div>
            <div className="flex items-center gap-2 md:col-span-2 pt-4">
              <label className="flex items-center gap-1.5 text-[11px] text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.is_refreshed} onChange={set('is_refreshed')} />
                Refreshed?
              </label>
              {form.is_refreshed && (
                <>
                  <input type="date" value={form.date_refreshed} onChange={set('date_refreshed')}
                    className="input-f" style={{ width: 'auto' }} />
                  <input value={form.new_focus_keyword} onChange={set('new_focus_keyword')}
                    placeholder="new focus keyword (optional)" className="input-f flex-1" />
                </>
              )}
            </div>
          </>
        )}

        {isBlog && (
          <>
            <div className="flex items-center gap-4 md:col-span-3 pt-2 border-t border-gray-100">
              <label className="flex items-center gap-1.5 text-[11px] text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.approved_in_airtable} onChange={set('approved_in_airtable')} />
                Approved by client AND in Airtable
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.is_published} onChange={set('is_published')} />
                Published
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.has_video} onChange={set('has_video')} />
                Video on page
              </label>
            </div>
            {form.has_video && (
              <div className="md:col-span-3">
                <Label>Video Drive Link</Label>
                <input value={form.video_drive_link} onChange={set('video_drive_link')} placeholder="https://drive.google.com/..."
                  className="input-f" />
              </div>
            )}
          </>
        )}
      </div>

      {!isVideo && (
        <div className="mb-3">
          <Label>Notes</Label>
          <textarea value={form.notes} onChange={set('notes')} rows={2}
            placeholder="Any additional notes..."
            className="input-f resize-y" />
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit"
          className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-4 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800]">
          {initial?.id ? 'Save Changes' : 'Add Entry'}
        </button>
        <button type="button" onClick={onCancel}
          className="bg-transparent border border-gray-300 text-gray-600 rounded px-4 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-gray-400">
          Cancel
        </button>
      </div>

      <style>{`
        .input-f { width:100%; border:1px solid #e5e7eb; border-radius:5px; padding:6px 10px; font-size:12px; background:#f8f8f6; }
        .input-f:focus { outline:none; border-color:#F5C518; background:white; }
      `}</style>
    </form>
  );
}

function Label({ children }) {
  return <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{children}</label>;
}

// ── CSV Import Modal ──
// Very forgiving parser: splits on commas OR tabs, strips quotes, header-based column mapping.
function parseCsvOrTsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const splitLine = (line) => {
    // Handle quoted fields containing the delim
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === delim && !inQuotes) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const headers = splitLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  const rows = lines.slice(1).map(line => {
    const values = splitLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
  return { headers, rows };
}

// Map common header variants to our field names
const HEADER_ALIASES = {
  url: ['url', 'url_link', 'link', 'page_url', 'page'],
  focus_keyword: ['focus_keyword', 'focus_kw', 'fk', 'keyword', 'focus', 'used_focus_keywords', 'used_focus_keyword'],
  bucket: ['bucket', 'buckets', 'focus_bucket', 'theme', 'category', 'focus_or_bucket'],
  refresh_schedule: ['refresh_schedule', 'refresh'],
  date_published: ['date_published', 'publish_date', 'published', 'date_originally_published', 'date'],
  is_refreshed: ['refreshed', 'is_refreshed', 'refreshed_yes_or_no'],
  date_refreshed: ['date_refreshed', 'refresh_date'],
  new_focus_keyword: ['new_focus_keyword', 'new_fk', 'new_keyword'],
  approved_in_airtable: ['approved_by_client_and_in_at', 'approved_in_airtable', 'in_at', 'approved', 'approved_and_in_at'],
  is_published: ['published', 'live', 'is_published'],
  has_video: ['video_on_page', 'has_video'],
  video_drive_link: ['video_g_drive_link', 'video_link', 'video_drive_link', 'drive_link'],
  notes: ['notes', 'note'],
  title: ['title', 'page_title', 'name'],
};

function mapRowToPayload(row) {
  const payload = {};
  Object.entries(HEADER_ALIASES).forEach(([field, aliases]) => {
    for (const alias of aliases) {
      if (row[alias] !== undefined && row[alias] !== '') {
        payload[field] = row[alias];
        break;
      }
    }
  });
  // Coerce booleans
  ['is_refreshed', 'approved_in_airtable', 'is_published', 'has_video'].forEach(f => {
    if (payload[f] !== undefined) {
      const v = payload[f].toString().trim().toLowerCase();
      payload[f] = ['yes', 'y', 'true', '1', '✓', 'x'].includes(v);
    }
  });
  // Coerce dates — leave as string, let Postgres parse
  ['date_published', 'date_refreshed'].forEach(f => {
    if (payload[f]) {
      const d = new Date(payload[f]);
      if (!isNaN(d)) payload[f] = d.toISOString().split('T')[0];
      else delete payload[f];
    }
  });
  return payload;
}

function CsvImportModal({ category, onImport, onClose }) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState({ headers: [], rows: [] });
  const [mapped, setMapped] = useState([]);

  const handleParse = () => {
    const result = parseCsvOrTsv(text);
    setParsed(result);
    const mappedRows = result.rows.map(mapRowToPayload).filter(r => r.url || r.title || r.focus_keyword);
    setMapped(mappedRows);
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(reader.result);
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <div className="text-[10px] font-bold uppercase text-[#F5C518]">Import CSV / TSV</div>
            <div className="text-sm font-semibold text-[#1a1a1a] mt-0.5">
              Bulk import into {CATEGORIES.find(c => c.id === category)?.label}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-[#1a1a1a] bg-transparent border-none text-xl cursor-pointer leading-none p-1">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="text-[11px] text-gray-500 mb-3 leading-relaxed">
            Paste rows from your existing Google Sheet below (or upload a CSV). The first row should be headers.
            Common names are auto-detected: <code className="text-[10px] bg-gray-100 px-1">URL</code>, <code className="text-[10px] bg-gray-100 px-1">Focus KW</code>, <code className="text-[10px] bg-gray-100 px-1">Bucket</code>, <code className="text-[10px] bg-gray-100 px-1">Refreshed</code>, <code className="text-[10px] bg-gray-100 px-1">Date Published</code>, <code className="text-[10px] bg-gray-100 px-1">Notes</code>, etc.
          </div>

          <div className="mb-3">
            <input type="file" accept=".csv,.tsv,.txt" onChange={handleFile}
              className="text-[11px] mb-2" />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={`URL,Focus KW,Bucket,Refreshed\nhttps://example.com/page,keyword here,Business Loans,No`}
              className="w-full border border-gray-200 rounded px-2.5 py-2 text-[11px] font-mono bg-[#f8f8f6] resize-y focus:outline-none focus:border-[#F5C518]"
            />
            <button onClick={handleParse} disabled={!text.trim()}
              className="mt-2 bg-[#1a1a1a] text-white border-none rounded px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#333] disabled:opacity-40">
              Preview {parsed.rows.length ? 'again' : ''}
            </button>
          </div>

          {mapped.length > 0 && (
            <div className="bg-[#f8f8f6] rounded-lg p-3 border border-gray-200">
              <div className="text-[10px] font-bold uppercase text-gray-500 mb-2">
                Preview — {mapped.length} {mapped.length === 1 ? 'row' : 'rows'} detected
              </div>
              <div className="max-h-64 overflow-y-auto bg-white rounded border border-gray-200">
                <table className="w-full text-[10px]">
                  <thead className="bg-[#f8f8f6] border-b border-gray-200 sticky top-0">
                    <tr className="text-left text-gray-500">
                      <th className="px-2 py-1.5 font-bold uppercase text-[9px]">URL / Title</th>
                      <th className="px-2 py-1.5 font-bold uppercase text-[9px]">Focus KW</th>
                      <th className="px-2 py-1.5 font-bold uppercase text-[9px]">Bucket</th>
                      <th className="px-2 py-1.5 font-bold uppercase text-[9px]">Refreshed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapped.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="px-2 py-1 truncate max-w-xs">{r.url || r.title || '—'}</td>
                        <td className="px-2 py-1">{r.focus_keyword || '—'}</td>
                        <td className="px-2 py-1">{r.bucket || '—'}</td>
                        <td className="px-2 py-1">{r.is_refreshed ? '✓' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {mapped.length > 50 && (
                <div className="text-[9px] text-gray-400 mt-1">Showing first 50 of {mapped.length}</div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between shrink-0 bg-[#fafafa]">
          <div className="text-[10px] text-gray-500">
            {mapped.length > 0 ? `Ready to import ${mapped.length} rows into ${CATEGORIES.find(c => c.id === category)?.label}` : 'Paste data and click Preview'}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="bg-transparent border border-gray-300 text-gray-600 rounded px-4 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-gray-400">
              Cancel
            </button>
            <button onClick={() => onImport(mapped)} disabled={!mapped.length}
              className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-4 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40">
              ✓ Import {mapped.length || ''} {mapped.length === 1 ? 'Row' : 'Rows'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Website Scan Modal ──
function WebsiteScanModal({ clientName, clientId, existingPages, onImport, onClose }) {
  const [domain, setDomain] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState('');
  const [discovered, setDiscovered] = useState([]);
  const [selections, setSelections] = useState({});

  useEffect(() => {
    if (!clientName) return;
    supabase.from('client_brand_voice')
      .select('website_url')
      .eq('client_name', clientName)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.website_url) {
          try {
            const url = new URL(data.website_url.startsWith('http') ? data.website_url : 'https://' + data.website_url);
            setDomain(url.hostname);
          } catch { setDomain(data.website_url); }
        }
      });
  }, [clientName]);

  const existingUrls = new Set((existingPages || []).map(p => (p.url || '').toLowerCase().trim().replace(/\/$/, '')));
  const existingKws = new Set((existingPages || []).map(p => (p.focus_keyword || '').toLowerCase().trim()).filter(Boolean));

  const guessCategory = (url, title) => {
    const u = (url || '').toLowerCase();
    const t = (title || '').toLowerCase();
    if (u.includes('/blog/') || u.includes('/news/') || u.includes('/article')) return 'blog';
    if (u.includes('/landing') || u.includes('/lp/') || u.includes('/offer')) return 'landing';
    if (u.includes('/service') || u.includes('/what-we-do') || u.includes('/our-')) return 'service';
    if (t.includes('blog') || t.includes('tips') || t.includes('guide') || t.includes('how to') || t.includes('reasons')) return 'blog';
    if (t.includes('service') || t.includes('solution')) return 'service';
    return 'general';
  };

  const handleScan = async () => {
    if (!domain.trim()) return toast.error('Enter a domain');
    if (!dfs.isConfigured()) return toast.error('DataForSEO not configured');

    setScanning(true);
    setDiscovered([]);
    setSelections({});

    try {
      setScanStep('Fetching ranked pages from DataForSEO...');
      const ranked = await dfs.getRankedKeywordsForDomain(domain.trim(), 100);

      setScanStep(`Processing ${ranked.length} keywords...`);
      const pageMap = {};
      ranked.forEach(kw => {
        const url = (kw.url || '').replace(/\/$/, '');
        if (!url) return;
        if (!pageMap[url]) pageMap[url] = { url, keywords: [], bestKeyword: null, bestSv: 0, bestRank: 999 };
        pageMap[url].keywords.push(kw);
        if ((kw.search_volume || 0) > pageMap[url].bestSv) {
          pageMap[url].bestSv = kw.search_volume;
          pageMap[url].bestKeyword = kw.keyword;
        }
        if ((kw.rank || 999) < pageMap[url].bestRank) pageMap[url].bestRank = kw.rank;
      });

      const pages = Object.values(pageMap);
      setScanStep(`Found ${pages.length} pages — fetching titles...`);

      const titleData = await Promise.all(pages.slice(0, 30).map(async (p) => {
        try {
          const crawl = await dfs.crawlPage(p.url);
          return { url: p.url, title: crawl?.meta?.title || '', h1: (crawl?.meta?.htags?.h1 || [])[0] || '', wordCount: crawl?.meta?.content?.plain_text_word_count || 0 };
        } catch { return { url: p.url, title: '', h1: '', wordCount: 0 }; }
      }));
      const titleMap = {};
      titleData.forEach(t => { titleMap[t.url] = t; });

      const results = pages.map(p => {
        const td = titleMap[p.url] || {};
        const urlClean = p.url.toLowerCase().trim().replace(/\/$/, '');
        return {
          url: p.url, title: td.title || '', wordCount: td.wordCount || 0,
          focus_keyword: p.bestKeyword || (td.title || '').split(/[|–:—]/)[0].trim().substring(0, 60),
          category: guessCategory(p.url, td.title || td.h1),
          rank: p.bestRank, sv: p.bestSv, keywordCount: p.keywords.length,
          isDuplicate: existingUrls.has(urlClean),
          kwDuplicate: p.bestKeyword ? existingKws.has(p.bestKeyword.toLowerCase()) : false,
        };
      }).sort((a, b) => (a.isDuplicate ? 1 : 0) - (b.isDuplicate ? 1 : 0) || b.sv - a.sv);

      setDiscovered(results);
      const sel = {};
      results.forEach((r, i) => { sel[i] = !r.isDuplicate; });
      setSelections(sel);

      const newCount = results.filter(r => !r.isDuplicate).length;
      toast.success(`Found ${results.length} pages · ${newCount} new · ${results.length - newCount} already in bucket list`);
    } catch (err) {
      toast.error('Scan error: ' + err.message);
    }
    setScanning(false);
    setScanStep('');
  };

  const handleImportSelected = () => {
    const selected = discovered.filter((_, i) => selections[i]).map(d => ({
      url: d.url, focus_keyword: d.focus_keyword, page_category: d.category,
    }));
    if (!selected.length) return toast.error('Select at least one page');
    onImport(selected);
    onClose();
  };

  const selectedCount = Object.values(selections).filter(Boolean).length;
  const newCount = discovered.filter(r => !r.isDuplicate).length;

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <div className="text-[10px] font-bold uppercase text-[#F5C518]">🔍 Scan Website</div>
            <div className="text-sm font-semibold text-[#1a1a1a] mt-0.5">Discover pages for {clientName}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-[#1a1a1a] bg-transparent border-none text-xl cursor-pointer">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex gap-2 mb-4">
            <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="e.g. professionallendingsolutions.com.au"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518]" />
            <button onClick={handleScan} disabled={scanning || !domain.trim()}
              className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-lg px-5 py-2 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40 shrink-0">
              {scanning ? (scanStep || 'Scanning...') : '🔍 Scan'}
            </button>
          </div>

          {discovered.length > 0 && (
            <div className="bg-[#f8f8f6] rounded-lg p-3 mb-4 flex items-center justify-between flex-wrap gap-2">
              <div className="text-[11px] text-gray-600">
                Found <b>{discovered.length}</b> pages · <b className="text-green-600">{newCount}</b> new · <b className="text-gray-400">{discovered.length - newCount}</b> already added · <b className="text-[#F5C518]">{selectedCount}</b> selected
              </div>
              <div className="flex gap-2">
                <button onClick={() => { const s = {}; discovered.forEach((r, i) => { s[i] = !r.isDuplicate; }); setSelections(s); }}
                  className="text-[10px] text-gray-500 bg-white border border-gray-200 rounded px-2 py-1 cursor-pointer hover:border-[#F5C518]">New only</button>
                <button onClick={() => { const s = {}; discovered.forEach((_, i) => { s[i] = true; }); setSelections(s); }}
                  className="text-[10px] text-gray-500 bg-white border border-gray-200 rounded px-2 py-1 cursor-pointer hover:border-[#F5C518]">All</button>
                <button onClick={() => setSelections({})}
                  className="text-[10px] text-gray-500 bg-white border border-gray-200 rounded px-2 py-1 cursor-pointer hover:border-gray-400">Clear</button>
              </div>
            </div>
          )}

          {discovered.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-[11px]">
                <thead className="bg-[#f8f8f6] border-b border-gray-200 sticky top-0">
                  <tr className="text-left text-gray-500">
                    <th className="px-3 py-2 w-8"></th>
                    <th className="px-3 py-2 font-bold uppercase text-[9px]">Page</th>
                    <th className="px-3 py-2 font-bold uppercase text-[9px]">Focus Keyword</th>
                    <th className="px-3 py-2 font-bold uppercase text-[9px]">Category</th>
                    <th className="px-3 py-2 font-bold uppercase text-[9px] text-right">SV</th>
                    <th className="px-3 py-2 font-bold uppercase text-[9px] text-right">Rank</th>
                    <th className="px-3 py-2 font-bold uppercase text-[9px] text-right">Words</th>
                    <th className="px-3 py-2 font-bold uppercase text-[9px]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {discovered.map((page, i) => (
                    <tr key={i} className={`border-b border-gray-100 ${page.isDuplicate ? 'opacity-40 bg-gray-50' : selections[i] ? 'bg-green-50/30' : ''}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selections[i] || false} onChange={e => setSelections(s => ({ ...s, [i]: e.target.checked }))} className="accent-[#F5C518]" />
                      </td>
                      <td className="px-3 py-2 max-w-[220px]">
                        <div className="text-[11px] font-semibold text-[#1a1a1a] truncate" title={page.title}>{page.title || page.url}</div>
                        <div className="text-[9px] text-gray-400 truncate">{page.url.replace(/^https?:\/\//, '')}</div>
                      </td>
                      <td className="px-3 py-2">
                        <input value={page.focus_keyword} onChange={e => setDiscovered(prev => prev.map((d, j) => j === i ? { ...d, focus_keyword: e.target.value } : d))}
                          className="border border-gray-200 rounded px-1.5 py-1 text-[10px] bg-[#f8f8f6] w-full max-w-[160px]" />
                      </td>
                      <td className="px-3 py-2">
                        <select value={page.category} onChange={e => setDiscovered(prev => prev.map((d, j) => j === i ? { ...d, category: e.target.value } : d))}
                          className="border border-gray-200 rounded px-1.5 py-1 text-[10px] bg-[#f8f8f6]">
                          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{page.sv > 0 ? page.sv.toLocaleString() : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {page.rank < 999 ? <span className={`font-semibold ${page.rank <= 3 ? 'text-green-600' : page.rank <= 10 ? 'text-orange-500' : 'text-gray-500'}`}>#{page.rank}</span> : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500">{page.wordCount > 0 ? page.wordCount.toLocaleString() : '—'}</td>
                      <td className="px-3 py-2">
                        {page.isDuplicate ? <span className="text-[9px] font-bold bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">Already added</span> :
                         page.kwDuplicate ? <span className="text-[9px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">KW overlap</span> :
                         <span className="text-[9px] font-bold bg-green-50 text-green-600 px-1.5 py-0.5 rounded">New</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {scanning && (
            <div className="text-center py-10">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-[#F5C518] rounded-full animate-spin mx-auto mb-3"></div>
              <div className="text-[11px] text-gray-500">{scanStep}</div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between shrink-0 bg-[#fafafa]">
          <div className="text-[10px] text-gray-500">{selectedCount > 0 ? `${selectedCount} pages selected` : 'Scan a domain to discover pages'}</div>
          <div className="flex gap-2">
            <button onClick={onClose} className="bg-transparent border border-gray-300 text-gray-600 rounded px-4 py-1.5 text-[11px] cursor-pointer">Cancel</button>
            <button onClick={handleImportSelected} disabled={selectedCount === 0}
              className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-4 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-30">
              ✓ Import {selectedCount} Page{selectedCount !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
