import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAdmin } from '../hooks/useAdmin';
import toast from 'react-hot-toast';

const STAGES = [
  { id: 'New', label: 'New', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'Contacted', label: 'Contacted', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 'Proposal', label: 'Proposal', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'Won', label: 'Won', color: 'bg-green-50 text-green-700 border-green-200' },
  { id: 'Lost', label: 'Lost', color: 'bg-red-50 text-red-600 border-red-200' },
];
const stageMeta = (id) => STAGES.find(s => s.id === id) || STAGES[0];

const SOURCES = ['Referral', 'Website', 'Cold outreach', 'Social', 'Event', 'Existing client', 'Other'];

const EMPTY = {
  record_type: 'lead', stage: 'New', first_name: '', last_name: '', email: '',
  phone: '', company: '', website: '', source: '', owner: '', deal_value: '',
  tags: [], notes: [], last_contacted: '',
};

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function CRM() {
  const { currentUser } = useAdmin();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');   // all | lead | client
  const [stageFilter, setStageFilter] = useState('all');
  const [editing, setEditing] = useState(null);          // contact object or EMPTY (new)
  const [saving, setSaving] = useState(false);
  const [newNote, setNewNote] = useState('');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('crm_contacts')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) toast.error('Could not load CRM: ' + error.message);
    setContacts(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return contacts.filter(c => {
      if (typeFilter !== 'all' && c.record_type !== typeFilter) return false;
      if (stageFilter !== 'all' && c.stage !== stageFilter) return false;
      if (!q) return true;
      const hay = [c.first_name, c.last_name, c.email, c.company, c.phone, (c.tags || []).join(' ')]
        .join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [contacts, search, typeFilter, stageFilter]);

  const stats = useMemo(() => ({
    leads: contacts.filter(c => c.record_type === 'lead').length,
    clients: contacts.filter(c => c.record_type === 'client').length,
    pipeline: contacts
      .filter(c => !['Won', 'Lost'].includes(c.stage))
      .reduce((sum, c) => sum + (Number(c.deal_value) || 0), 0),
  }), [contacts]);

  const openNew = () => { setNewNote(''); setEditing({ ...EMPTY }); };
  const openEdit = (c) => { setNewNote(''); setEditing({ ...EMPTY, ...c, tags: c.tags || [], notes: c.notes || [] }); };

  const saveContact = async () => {
    if (!editing) return;
    if (!editing.email && !editing.first_name && !editing.company) {
      toast.error('Add at least a name, company, or email');
      return;
    }
    setSaving(true);
    const payload = {
      record_type: editing.record_type,
      stage: editing.stage,
      first_name: editing.first_name?.trim() || null,
      last_name: editing.last_name?.trim() || null,
      email: editing.email?.trim() || null,
      phone: editing.phone?.trim() || null,
      company: editing.company?.trim() || null,
      website: editing.website?.trim() || null,
      source: editing.source || null,
      owner: editing.owner?.trim() || null,
      deal_value: editing.deal_value === '' || editing.deal_value == null ? null : Number(editing.deal_value),
      tags: editing.tags || [],
      notes: editing.notes || [],
      last_contacted: editing.last_contacted || null,
      updated_at: new Date().toISOString(),
    };
    let error;
    if (editing.id) {
      ({ error } = await supabase.from('crm_contacts').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('crm_contacts').insert(payload));
    }
    setSaving(false);
    if (error) { toast.error('Save failed: ' + error.message); return; }
    toast.success(editing.id ? 'Updated' : 'Added');
    setEditing(null);
    load();
  };

  const removeContact = async (c) => {
    if (!c.id || !window.confirm(`Delete ${c.first_name || c.company || c.email || 'this contact'}?`)) return;
    const { error } = await supabase.from('crm_contacts').delete().eq('id', c.id);
    if (error) { toast.error('Delete failed: ' + error.message); return; }
    toast.success('Deleted');
    setEditing(null);
    load();
  };

  // Quick inline stage change from the table
  const changeStage = async (c, stage) => {
    setContacts(prev => prev.map(x => x.id === c.id ? { ...x, stage } : x));
    const { error } = await supabase.from('crm_contacts')
      .update({ stage, updated_at: new Date().toISOString() }).eq('id', c.id);
    if (error) { toast.error('Could not update stage'); load(); }
  };

  const addNote = () => {
    const text = newNote.trim();
    if (!text) return;
    const note = { text, at: new Date().toISOString(), by: currentUser?.name || currentUser?.email || 'Team' };
    setEditing(e => ({ ...e, notes: [note, ...(e.notes || [])] }));
    setNewNote('');
  };

  // Mailchimp-friendly CSV of whatever's currently filtered
  const exportCsv = () => {
    if (!filtered.length) { toast.error('Nothing to export'); return; }
    const cols = ['Email Address', 'First Name', 'Last Name', 'Company', 'Phone', 'Website', 'Type', 'Stage', 'Source', 'Tags'];
    const rows = filtered.map(c => [
      c.email, c.first_name, c.last_name, c.company, c.phone, c.website,
      c.record_type, c.stage, c.source, (c.tags || []).join(', '),
    ].map(csvCell).join(','));
    const csv = [cols.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `crm-export-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} contact${filtered.length === 1 ? '' : 's'}`);
  };

  const setField = (k, v) => setEditing(e => ({ ...e, [k]: v }));
  const tagsInput = (editing?.tags || []).join(', ');

  return (
    <div className="p-5 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-[#1a1a1a] flex items-center gap-2">👥 CRM</h1>
          <p className="text-[12px] text-gray-500 mt-0.5">Track leads &amp; clients, add notes, export for Mailchimp.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv}
            className="text-[12px] font-semibold px-3 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-[#1a1a1a]">
            ⬇ Export CSV{typeFilter !== 'all' || stageFilter !== 'all' || search ? ' (filtered)' : ''}
          </button>
          <button onClick={openNew}
            className="text-[12px] font-bold px-3 py-2 rounded-md bg-[#F5C518] hover:brightness-95 text-[#1a1a1a]">
            + Add contact
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Leads" value={stats.leads} />
        <Stat label="Clients" value={stats.clients} />
        <Stat label="Open pipeline" value={`$${stats.pipeline.toLocaleString()}`} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, company, tag…"
          className="text-[12px] px-3 py-2 rounded-md border border-gray-300 bg-white flex-1 min-w-[200px]" />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="text-[12px] px-2 py-2 rounded-md border border-gray-300 bg-white">
          <option value="all">All types</option>
          <option value="lead">Leads</option>
          <option value="client">Clients</option>
        </select>
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
          className="text-[12px] px-2 py-2 rounded-md border border-gray-300 bg-white">
          <option value="all">All stages</option>
          {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-left border-b border-gray-200">
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Company</th>
              <th className="px-3 py-2 font-semibold">Email</th>
              <th className="px-3 py-2 font-semibold">Type</th>
              <th className="px-3 py-2 font-semibold">Stage</th>
              <th className="px-3 py-2 font-semibold text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">
                No contacts yet. Click <span className="font-semibold">+ Add contact</span> to start.
              </td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} onClick={() => openEdit(c)}
                className="border-b border-gray-100 last:border-0 hover:bg-[#faf8f0] cursor-pointer">
                <td className="px-3 py-2 font-medium text-[#1a1a1a]">
                  {[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}
                  {(c.tags || []).length > 0 && (
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {c.tags.slice(0, 3).map((t, i) => (
                        <span key={i} className="text-[9px] bg-gray-100 text-gray-500 px-1.5 rounded-full">{t}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-600">{c.company || '—'}</td>
                <td className="px-3 py-2 text-gray-600">{c.email || '—'}</td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${c.record_type === 'client' ? 'bg-[#F5C518]/20 text-[#1a1a1a]' : 'bg-gray-100 text-gray-500'}`}>
                    {c.record_type}
                  </span>
                </td>
                <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                  <select value={c.stage} onChange={e => changeStage(c, e.target.value)}
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border cursor-pointer ${stageMeta(c.stage).color}`}>
                    {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 text-right text-gray-600">
                  {c.deal_value ? `$${Number(c.deal_value).toLocaleString()}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-gray-400 mt-2">
        Showing {filtered.length} of {contacts.length}. Export sends the visible list as a Mailchimp-ready CSV.
      </div>

      {/* Editor slide-over */}
      {editing && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setEditing(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-full max-w-[460px] h-full bg-white shadow-xl overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <h2 className="text-[15px] font-bold">{editing.id ? 'Edit contact' : 'New contact'}</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <Toggle label="Lead" active={editing.record_type === 'lead'} onClick={() => setField('record_type', 'lead')} />
                <Toggle label="Client" active={editing.record_type === 'client'} onClick={() => setField('record_type', 'client')} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="First name" value={editing.first_name} onChange={v => setField('first_name', v)} />
                <Field label="Last name" value={editing.last_name} onChange={v => setField('last_name', v)} />
              </div>
              <Field label="Email" type="email" value={editing.email} onChange={v => setField('email', v)} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Phone" value={editing.phone} onChange={v => setField('phone', v)} />
                <Field label="Company" value={editing.company} onChange={v => setField('company', v)} />
              </div>
              <Field label="Website" value={editing.website} onChange={v => setField('website', v)} />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500">Stage</label>
                  <select value={editing.stage} onChange={e => setField('stage', e.target.value)}
                    className="w-full text-[12px] px-2 py-1.5 mt-0.5 rounded-md border border-gray-300 bg-white">
                    {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500">Source</label>
                  <select value={editing.source || ''} onChange={e => setField('source', e.target.value)}
                    className="w-full text-[12px] px-2 py-1.5 mt-0.5 rounded-md border border-gray-300 bg-white">
                    <option value="">—</option>
                    {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Owner" value={editing.owner} onChange={v => setField('owner', v)} />
                <Field label="Est. value ($)" type="number" value={editing.deal_value} onChange={v => setField('deal_value', v)} />
              </div>
              <Field label="Last contacted" type="date" value={editing.last_contacted || ''} onChange={v => setField('last_contacted', v)} />
              <div>
                <label className="text-[11px] font-semibold text-gray-500">Tags (comma-separated · used as Mailchimp segments)</label>
                <input value={tagsInput}
                  onChange={e => setField('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                  placeholder="e.g. newsletter, seo, brisbane"
                  className="w-full text-[12px] px-2 py-1.5 mt-0.5 rounded-md border border-gray-300 bg-white" />
              </div>

              {/* Notes */}
              <div className="pt-2 border-t border-gray-100">
                <label className="text-[11px] font-semibold text-gray-500">Notes</label>
                <div className="flex gap-2 mt-1">
                  <input value={newNote} onChange={e => setNewNote(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNote(); } }}
                    placeholder="Add a note and press Enter…"
                    className="flex-1 text-[12px] px-2 py-1.5 rounded-md border border-gray-300 bg-white" />
                  <button onClick={addNote} className="text-[12px] font-semibold px-3 rounded-md bg-gray-100 hover:bg-gray-200">Add</button>
                </div>
                <div className="mt-2 space-y-2 max-h-[220px] overflow-y-auto">
                  {(editing.notes || []).length === 0 && <div className="text-[11px] text-gray-400">No notes yet.</div>}
                  {(editing.notes || []).map((n, i) => (
                    <div key={i} className="bg-gray-50 rounded-md px-2.5 py-1.5">
                      <div className="text-[12px] text-[#1a1a1a] whitespace-pre-wrap">{n.text}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5 flex items-center justify-between">
                        <span>{n.by} · {n.at ? new Date(n.at).toLocaleDateString() : ''}</span>
                        <button onClick={() => setField('notes', editing.notes.filter((_, j) => j !== i))}
                          className="hover:text-red-500">remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
              {editing.id ? (
                <button onClick={() => removeContact(editing)} className="text-[12px] text-red-500 hover:text-red-700 font-semibold">Delete</button>
              ) : <span />}
              <div className="flex gap-2">
                <button onClick={() => setEditing(null)} className="text-[12px] font-semibold px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-50">Cancel</button>
                <button onClick={saveContact} disabled={saving}
                  className="text-[12px] font-bold px-4 py-2 rounded-md bg-[#F5C518] hover:brightness-95 text-[#1a1a1a] disabled:opacity-50">
                  {saving ? 'Saving…' : editing.id ? 'Save changes' : 'Add contact'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
      <div className="text-[11px] text-gray-500 uppercase font-semibold">{label}</div>
      <div className="text-[20px] font-bold text-[#1a1a1a] mt-0.5">{value}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-500">{label}</label>
      <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)}
        className="w-full text-[12px] px-2 py-1.5 mt-0.5 rounded-md border border-gray-300 bg-white" />
    </div>
  );
}

function Toggle({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex-1 text-[12px] font-semibold py-1.5 rounded-md border ${active ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
      {label}
    </button>
  );
}
