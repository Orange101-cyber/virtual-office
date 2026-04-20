import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import toast from 'react-hot-toast';

const CATEGORIES = [
  { id: 'general', label: 'General Pages', icon: '🏠' },
  { id: 'service', label: 'Service Pages', icon: '💼' },
  { id: 'landing', label: 'Landing Pages', icon: '🎯' },
  { id: 'blog', label: 'Blogs', icon: '📝' },
  { id: 'video', label: 'Videos', icon: '🎬' },
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
      setPages(pagesRes.data || []);
      setReports(reportsRes.data || []);
      const bvBuckets = (bvRes.data?.services || '').split('\n').map(s => s.trim()).filter(Boolean);
      setBuckets(bvBuckets);
      setLoading(false);
    });
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
  }, [pages, category, search]);

  // Count per category for tab badges
  const counts = useMemo(() => {
    const c = {};
    CATEGORIES.forEach(cat => { c[cat.id] = pages.filter(p => p.page_category === cat.id).length; });
    return c;
  }, [pages]);

  const handleSave = async (data) => {
    const payload = {
      ...data,
      client_name: selectedClient,
      client_id: selectedClientId,
      page_category: category,
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
          <div className="bg-[#f8f8f6] border-b border-gray-200 px-5 py-2.5 shrink-0 flex items-center gap-2">
            <button onClick={() => { setShowForm(true); setEditingId(null); }}
              className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800]">
              + Add {CATEGORIES.find(c => c.id === category)?.label.replace(/s$/, '')}
            </button>
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
            <div className="bg-white border-b border-gray-200 px-5 py-4 shrink-0">
              <PageForm
                category={category}
                buckets={buckets}
                initial={editingId ? pages.find(p => p.id === editingId) : null}
                onSave={handleSave}
                onCancel={() => { setShowForm(false); setEditingId(null); }}
              />
            </div>
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
                onEdit={(id) => { setEditingId(id); setShowForm(true); }}
                onDelete={handleDelete}
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
function PageTable({ category, pages, onEdit, onDelete, scoreForUrl, reportIdForUrl }) {
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
              return (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-[#f8f8f6]">
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
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => onEdit(p.id)} className="text-[10px] text-gray-400 hover:text-[#F5C518] bg-transparent border-none cursor-pointer mr-1">✏️</button>
                    <button onClick={() => onDelete(p.id)} className="text-[10px] text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer">🗑</button>
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
    title: initial?.title || '',
    url: initial?.url || '',
    focus_keyword: initial?.focus_keyword || '',
    bucket: initial?.bucket || '',
    refresh_schedule: initial?.refresh_schedule || '',
    date_published: initial?.date_published || '',
    is_refreshed: initial?.is_refreshed || false,
    date_refreshed: initial?.date_refreshed || '',
    new_focus_keyword: initial?.new_focus_keyword || '',
    approved_in_airtable: initial?.approved_in_airtable || false,
    is_published: initial?.is_published || false,
    has_video: initial?.has_video || false,
    video_drive_link: initial?.video_drive_link || '',
    notes: initial?.notes || '',
  });

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [key]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  const isVideo = category === 'video';
  const isGeneralOrService = category === 'general' || category === 'service';
  const isLandingOrBlog = category === 'landing' || category === 'blog';
  const isBlog = category === 'blog';

  return (
    <form onSubmit={handleSubmit}>
      <div className="text-[11px] font-bold uppercase text-[#F5C518] mb-3">
        {initial?.id ? 'Edit' : 'Add'} {CATEGORIES.find(c => c.id === category)?.label.replace(/s$/, '')}
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
