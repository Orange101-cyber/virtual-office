import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import { COPY_LIMITS } from '../lib/ideogram';
import toast from 'react-hot-toast';

const STATUSES = ['Draft', 'Approved', 'Live', 'Paused', 'Ended'];
const STATUS_COLORS = { Draft: '#94a3b8', Approved: '#F5C518', Live: '#4ADE80', Paused: '#f59e0b', Ended: '#888' };

function Label({ children }) {
  return <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{children}</label>;
}

export default function AdCopyLibrary() {
  const { clients: dbClients } = useClients();
  const [clients, setClients] = useState([]);
  const [clientFilter, setClientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [copies, setCopies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState(null);
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => {
    setClients(dbClients.map(c => c.name));
  }, [dbClients]);

  const fetchCopies = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('ad_copy').select('*').order('created_at', { ascending: false });
    if (clientFilter) query = query.eq('client_name', clientFilter);
    if (statusFilter) query = query.eq('status', statusFilter);
    const { data } = await query;
    setCopies(data || []);
    setLoading(false);
  }, [clientFilter, statusFilter]);

  useEffect(() => { fetchCopies(); }, [fetchCopies]);

  const handleSave = async (item) => {
    if (item.id) {
      await supabase.from('ad_copy').update({ ...item, updated_at: new Date().toISOString() }).eq('id', item.id);
    } else {
      await supabase.from('ad_copy').insert(item);
    }
    fetchCopies();
    setShowEdit(false);
    setEditItem(null);
    toast.success('Copy saved!');
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this copy?')) return;
    await supabase.from('ad_copy').delete().eq('id', id);
    fetchCopies();
    toast.success('Deleted');
  };

  const handleDuplicate = async (item) => {
    const { id, created_at, updated_at, ...rest } = item;
    await supabase.from('ad_copy').insert({ ...rest, headline: `${rest.headline} (copy)`, status: 'Draft' });
    fetchCopies();
    toast.success('Duplicated!');
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold text-[#1a1a1a]">Ad Copy Library</h1>
            <p className="text-[11px] text-gray-400">Saved ad copy per client. Track versions and performance.</p>
          </div>
          <button onClick={() => { setEditItem(null); setShowEdit(true); }} className="btn-primary text-[11px]">+ New Copy</button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="input-field w-auto text-[11px]">
            <option value="">All Clients</option>
            {clients.map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field w-auto text-[11px]">
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <span className="text-[10px] text-gray-400 self-center ml-2">{copies.length} items</span>
        </div>

        {/* Copy cards */}
        {loading ? (
          <div className="text-center text-gray-400 py-20">Loading...</div>
        ) : copies.length === 0 ? (
          <div className="text-center text-gray-400 py-20">
            <div className="text-3xl mb-2 opacity-30">📋</div>
            <p className="text-sm">No ad copy saved yet. Generate some in Ad Inspiration.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {copies.map(copy => (
              <div key={copy.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-[#F5C518] transition-colors group">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${STATUS_COLORS[copy.status]}20`, color: STATUS_COLORS[copy.status] }}>
                      {copy.status}
                    </span>
                    <span className="text-[9px] text-gray-400">{copy.platform}</span>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleDuplicate(copy)} className="text-[9px] text-gray-400 hover:text-[#F5C518] bg-transparent border-none cursor-pointer" title="Duplicate">⧉</button>
                    <button onClick={() => { setEditItem(copy); setShowEdit(true); }} className="text-[9px] text-gray-400 hover:text-[#F5C518] bg-transparent border-none cursor-pointer" title="Edit">✎</button>
                    <button onClick={() => handleDelete(copy.id)} className="text-[9px] text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer" title="Delete">✕</button>
                  </div>
                </div>
                <div className="text-[10px] text-gray-400 mb-1">{copy.client_name}</div>
                <div className="text-[13px] font-semibold text-[#1a1a1a] mb-1.5">{copy.headline || '(no headline)'}</div>
                {copy.primary_text && (
                  <div className="text-[11px] text-gray-600 leading-relaxed mb-2 line-clamp-3">{copy.primary_text}</div>
                )}
                {copy.cta && (
                  <div className="text-[10px] font-bold text-[#F5C518]">CTA: {copy.cta}</div>
                )}
                {copy.performance_notes && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <div className="text-[9px] font-bold uppercase text-gray-400">Performance</div>
                    <div className="text-[10px] text-gray-600 mt-0.5">{copy.performance_notes}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Edit/Add modal */}
        {showEdit && (
          <EditCopyModal
            item={editItem}
            clients={clients}
            onSave={handleSave}
            onClose={() => { setShowEdit(false); setEditItem(null); }}
          />
        )}
      </div>

      <style>{`
        .input-field { width: 100%; border: 1px solid #e5e7eb; border-radius: 5px; padding: 6px 8px; font-size: 12px; background: #f8f8f6; outline: none; }
        .input-field:focus { border-color: #F5C518; background: white; }
        .btn-primary { background: #F5C518; color: #1a1a1a; border: none; border-radius: 5px; padding: 6px 14px; font-weight: 700; cursor: pointer; }
        .btn-primary:hover { background: #e6b800; }
      `}</style>
    </div>
  );
}

function EditCopyModal({ item, clients, onSave, onClose }) {
  const [form, setForm] = useState(item || {
    client_name: clients[0] || '', platform: 'Meta', headline: '',
    primary_text: '', description: '', cta: '', status: 'Draft', performance_notes: '',
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-[500px] max-w-[95vw] max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-[15px] font-semibold mb-4">{item ? 'Edit Copy' : 'New Ad Copy'}</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Client</Label><select value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} className="input-field">{clients.map(c => <option key={c}>{c}</option>)}</select></div>
            <div><Label>Platform</Label><select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} className="input-field"><option>Meta</option><option>Google</option><option>LinkedIn</option><option>TikTok</option></select></div>
            <div><Label>Status</Label><select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="input-field">{['Draft', 'Approved', 'Live', 'Paused', 'Ended'].map(s => <option key={s}>{s}</option>)}</select></div>
          </div>
          <div><Label>Headline</Label><input value={form.headline} onChange={e => setForm(f => ({ ...f, headline: e.target.value }))} className="input-field" /></div>
          <div><Label>Primary Text</Label><textarea value={form.primary_text} onChange={e => setForm(f => ({ ...f, primary_text: e.target.value }))} rows={3} className="input-field resize-y" /></div>
          <div><Label>Description</Label><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-field" /></div>
          <div><Label>CTA</Label><input value={form.cta} onChange={e => setForm(f => ({ ...f, cta: e.target.value }))} className="input-field" /></div>
          <div><Label>Performance Notes</Label><textarea value={form.performance_notes} onChange={e => setForm(f => ({ ...f, performance_notes: e.target.value }))} rows={2} placeholder="How did this copy perform?" className="input-field resize-y" /></div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => onSave(form)} className="btn-primary">Save</button>
        </div>
      </div>
    </div>
  );
}
