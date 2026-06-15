import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import toast from 'react-hot-toast';

// Discriminator stored in contact_phone column — keeps shoot_planner schema unchanged
const AGREEMENT_TAG = '__AGREEMENT__';

const CONTENT_TYPES = ['Podcast', 'Content Arbitrage', 'Both'];
const STATUS_OPTIONS = ['Planned', 'Recorded', 'In Edit', 'Complete'];

const STATUS_STYLE = {
  Planned:    { dot: 'bg-gray-400',   pill: 'bg-gray-100 text-gray-600' },
  Recorded:   { dot: 'bg-blue-500',   pill: 'bg-blue-100 text-blue-700' },
  'In Edit':  { dot: 'bg-orange-400', pill: 'bg-orange-100 text-orange-700' },
  Complete:   { dot: 'bg-green-500',  pill: 'bg-green-100 text-green-700' },
};

const CONTENT_STYLE = {
  Podcast:            'bg-purple-100 text-purple-700',
  'Content Arbitrage':'bg-yellow-100 text-yellow-800',
  Both:               'bg-pink-100 text-pink-700',
};

// Pastel colours per client index for calendar
const CLIENT_COLORS = [
  'bg-blue-200 text-blue-900', 'bg-purple-200 text-purple-900',
  'bg-green-200 text-green-900', 'bg-orange-200 text-orange-900',
  'bg-pink-200 text-pink-900', 'bg-teal-200 text-teal-900',
  'bg-red-200 text-red-900', 'bg-indigo-200 text-indigo-900',
];

function clientColor(index) { return CLIENT_COLORS[index % CLIENT_COLORS.length]; }

function monthDays(year, month) {
  const first = new Date(year, month, 1).getDay(); // 0=Sun
  const days = new Date(year, month + 1, 0).getDate();
  // Pad to start on Monday
  const startPad = (first === 0 ? 6 : first - 1);
  return { days, startPad };
}

// ── Run Sheet Panel (slide-in) ────────────────────────────────────────────────
function RunSheetPanel({ agreement, onClose, onEdit, onNewSession }) {
  if (!agreement) return null;
  const tl = agreement._tl || {};
  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="flex-1 bg-black/30" />
      <div
        className="w-[420px] bg-white h-full overflow-y-auto shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#1a1a1a] text-white px-5 py-4 flex items-start justify-between shrink-0">
          <div>
            <div className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">Run Sheet</div>
            <div className="text-[18px] font-bold leading-tight">{agreement.client_name}</div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CONTENT_STYLE[agreement.objectives] || 'bg-gray-700 text-gray-300'}`}>
                {agreement.objectives || 'Podcast'}
              </span>
              {tl.frequency && (
                <span className="text-[10px] text-gray-400">{tl.frequency}</span>
              )}
              {tl.shorts_per_session != null && (
                <span className="text-[10px] text-gray-400">{tl.shorts_per_session} shorts/session</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-[20px] leading-none mt-1">×</button>
        </div>

        <div className="flex-1 p-5 space-y-5">
          {/* Deliverables */}
          {tl.deliverables && (
            <div>
              <div className="text-[10px] font-bold uppercase text-gray-400 tracking-wide mb-1.5">Agreed Deliverables</div>
              <div className="bg-[#f8f8f6] rounded-lg px-3 py-2.5 text-[12px] text-gray-700 whitespace-pre-wrap leading-relaxed">
                {tl.deliverables}
              </div>
            </div>
          )}

          {/* Run sheet notes */}
          {agreement.notes && (
            <div>
              <div className="text-[10px] font-bold uppercase text-gray-400 tracking-wide mb-1.5">Session Notes / Run Sheet</div>
              <div className="bg-[#f8f8f6] rounded-lg px-3 py-2.5 text-[12px] text-gray-700 whitespace-pre-wrap leading-relaxed">
                {agreement.notes}
              </div>
            </div>
          )}

          {/* Links */}
          <div className="space-y-2">
            {tl.run_sheet_url && (
              <a href={tl.run_sheet_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 bg-blue-50 hover:bg-blue-100 transition rounded-lg px-3 py-2.5 text-[12px] text-blue-700 font-semibold">
                📄 Open Run Sheet Doc →
              </a>
            )}
            {tl.drive_link && (
              <a href={tl.drive_link} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 bg-green-50 hover:bg-green-100 transition rounded-lg px-3 py-2.5 text-[12px] text-green-700 font-semibold">
                📁 Google Drive Folder →
              </a>
            )}
            {tl.trello_link && (
              <a href={tl.trello_link} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 bg-blue-50 hover:bg-blue-100 transition rounded-lg px-3 py-2.5 text-[12px] text-blue-700 font-semibold">
                📋 Trello Board →
              </a>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-gray-200 flex gap-2 shrink-0">
          <button onClick={onNewSession}
            className="flex-1 bg-[#F5C518] text-[#1a1a1a] font-bold rounded-lg py-2.5 text-[12px] hover:bg-[#e6b800] transition">
            + Schedule Session
          </button>
          <button onClick={onEdit}
            className="bg-white border border-gray-200 text-gray-600 rounded-lg px-4 py-2.5 text-[12px] hover:border-gray-400 transition">
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Agreement Form Modal ──────────────────────────────────────────────────────
function AgreementModal({ clients, initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || {
    client_name: '', content_type: 'Podcast', frequency: '',
    shorts_per_session: 8, deliverables: '', run_sheet_notes: '',
    run_sheet_url: '', drive_link: '', trello_link: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="text-[14px] font-bold text-[#1a1a1a]">{initial ? 'Edit' : 'New'} Client Agreement</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-[20px]">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Client *</label>
              <select value={form.client_name} onChange={e => set('client_name', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] bg-[#f8f8f6]">
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Content Type</label>
              <select value={form.content_type} onChange={e => set('content_type', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] bg-[#f8f8f6]">
                {CONTENT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Shorts / Session</label>
              <input type="number" min={1} value={form.shorts_per_session}
                onChange={e => set('shorts_per_session', Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] bg-[#f8f8f6]" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Recording Frequency</label>
            <input value={form.frequency} onChange={e => set('frequency', e.target.value)}
              placeholder="e.g. Once every 2–3 months"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] bg-[#f8f8f6]" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Agreed Deliverables</label>
            <textarea rows={3} value={form.deliverables} onChange={e => set('deliverables', e.target.value)}
              placeholder="Full episode + 8 shorts, 2 per week posting…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] bg-[#f8f8f6] resize-none" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Run Sheet Notes</label>
            <textarea rows={4} value={form.run_sheet_notes} onChange={e => set('run_sheet_notes', e.target.value)}
              placeholder="What happens each session? Format, order, any specific requirements…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] bg-[#f8f8f6] resize-none" />
          </div>
          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Run Sheet URL (Google Doc)</label>
              <input value={form.run_sheet_url} onChange={e => set('run_sheet_url', e.target.value)}
                placeholder="https://docs.google.com/…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] bg-[#f8f8f6]" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Google Drive Folder</label>
              <input value={form.drive_link} onChange={e => set('drive_link', e.target.value)}
                placeholder="https://drive.google.com/…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] bg-[#f8f8f6]" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Trello Board</label>
              <input value={form.trello_link} onChange={e => set('trello_link', e.target.value)}
                placeholder="https://trello.com/…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] bg-[#f8f8f6]" />
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-200 flex gap-2">
          <button onClick={() => {
            if (!form.client_name) return toast.error('Select a client');
            onSave(form);
          }} className="flex-1 bg-[#F5C518] text-[#1a1a1a] font-bold rounded-lg py-2.5 text-[12px] hover:bg-[#e6b800] transition">
            Save Agreement
          </button>
          <button onClick={onClose} className="bg-white border border-gray-200 text-gray-600 rounded-lg px-4 py-2.5 text-[12px]">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Session Form Modal ────────────────────────────────────────────────────────
function SessionModal({ agreements, prefillClient, onSave, onClose }) {
  const [form, setForm] = useState({
    client_name: prefillClient || '', shoot_date: '', episode_title: '',
    content_type: '', status: 'Planned', notes: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function pickClient(name) {
    const a = agreements.find(a => a.client_name === name);
    setForm(f => ({ ...f, client_name: name, content_type: a ? (a.objectives || '') : f.content_type }));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="text-[14px] font-bold text-[#1a1a1a]">Schedule Recording Session</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-[20px]">×</button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Client *</label>
              <select value={form.client_name} onChange={e => pickClient(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] bg-[#f8f8f6]">
                <option value="">Select…</option>
                {agreements.map(a => <option key={a.id} value={a.client_name}>{a.client_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Date *</label>
              <input type="date" value={form.shoot_date} onChange={e => set('shoot_date', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] bg-[#f8f8f6]" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] bg-[#f8f8f6]">
                {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Episode / Session Title</label>
            <input value={form.episode_title} onChange={e => set('episode_title', e.target.value)}
              placeholder="What's this session about?"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] bg-[#f8f8f6]" />
          </div>
          {form.content_type && (
            <div className="text-[11px] text-gray-500 bg-[#f8f8f6] rounded-lg px-3 py-2">
              Content type from agreement: <b>{form.content_type}</b>
            </div>
          )}
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Anything specific for this session?"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] bg-[#f8f8f6] resize-none" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-200 flex gap-2">
          <button onClick={() => {
            if (!form.client_name) return toast.error('Select a client');
            if (!form.shoot_date) return toast.error('Set a date');
            onSave(form);
          }} className="flex-1 bg-[#F5C518] text-[#1a1a1a] font-bold rounded-lg py-2.5 text-[12px] hover:bg-[#e6b800] transition">
            Schedule Session
          </button>
          <button onClick={onClose} className="bg-white border border-gray-200 text-gray-600 rounded-lg px-4 py-2.5 text-[12px]">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ShootPlanner() {
  const navigate = useNavigate();
  const { clients } = useClients();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('register');

  // Modals / panels
  const [showAgreementModal, setShowAgreementModal] = useState(false);
  const [editingAgreement, setEditingAgreement] = useState(null);
  const [runSheetFor, setRunSheetFor] = useState(null); // agreement object
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [sessionPrefillClient, setSessionPrefillClient] = useState('');

  // Calendar nav
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  async function loadData() {
    setLoading(true);
    const { data, error } = await supabase.from('shoot_planner').select('*').order('shoot_date', { ascending: false });
    if (error && error.code !== '42P01') { toast.error('Failed to load data'); console.error(error); }
    setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  // Split by discriminator
  const agreements = useMemo(() =>
    rows
      .filter(r => r.contact_phone === AGREEMENT_TAG)
      .map(r => ({
        ...r,
        _tl: (() => { try { return JSON.parse(r.timeline || '{}'); } catch { return {}; } })(),
      })),
    [rows]
  );

  const sessions = useMemo(() =>
    rows.filter(r => r.contact_phone !== AGREEMENT_TAG),
    [rows]
  );

  // Client name → index for stable colour
  const clientColorMap = useMemo(() => {
    const map = {};
    agreements.forEach((a, i) => { map[a.client_name] = i; });
    return map;
  }, [agreements]);

  // ── CRUD: agreements ────────────────────────────────────────────────────────
  async function saveAgreement(form) {
    const timeline = JSON.stringify({
      frequency: form.frequency,
      shorts_per_session: form.shorts_per_session,
      deliverables: form.deliverables,
      run_sheet_url: form.run_sheet_url,
      drive_link: form.drive_link,
      trello_link: form.trello_link,
    });
    const payload = {
      contact_phone: AGREEMENT_TAG,
      client_name: form.client_name,
      objectives: form.content_type,
      notes: form.run_sheet_notes,
      timeline,
      shoot_date: null,
    };
    let err;
    if (editingAgreement) {
      ({ error: err } = await supabase.from('shoot_planner').update(payload).eq('id', editingAgreement.id));
    } else {
      ({ error: err } = await supabase.from('shoot_planner').insert({ ...payload, created_at: new Date().toISOString() }));
    }
    if (err) { toast.error('Failed to save: ' + err.message); return; }
    toast.success(editingAgreement ? 'Agreement updated' : 'Client added');
    setShowAgreementModal(false);
    setEditingAgreement(null);
    setRunSheetFor(null);
    loadData();
  }

  async function deleteAgreement(id) {
    if (!confirm('Remove this client from the video register?')) return;
    const { error } = await supabase.from('shoot_planner').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Removed');
    setRunSheetFor(null);
    loadData();
  }

  // ── CRUD: sessions ──────────────────────────────────────────────────────────
  async function saveSession(form) {
    const payload = {
      client_name: form.client_name,
      shoot_date: form.shoot_date,
      objectives: form.episode_title,
      notes: form.notes,
      contact_name: form.status,
      location: form.content_type,
      contact_phone: '',
      handoff: JSON.stringify({ current_stage: 1, stages: {} }),
    };
    const { data, error } = await supabase.from('shoot_planner').insert(payload).select().single();
    if (error) { toast.error('Failed to schedule: ' + error.message); return; }
    toast.success('Session scheduled');
    setShowSessionModal(false);
    setSessionPrefillClient('');
    await loadData();
    // Navigate to edit workflow for this session
    navigate(`/edit-workflow?session=${data.id}`);
  }

  // ── Calendar helpers ────────────────────────────────────────────────────────
  const { days, startPad } = useMemo(() => monthDays(calYear, calMonth), [calYear, calMonth]);

  const sessionsByDay = useMemo(() => {
    const map = {};
    sessions.forEach(s => {
      if (!s.shoot_date) return;
      const d = new Date(s.shoot_date + 'T00:00:00');
      if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(s);
      }
    });
    return map;
  }, [sessions, calYear, calMonth]);

  const monthName = new Date(calYear, calMonth, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  // Stats
  const thisMonthSessions = useMemo(() => {
    return sessions.filter(s => {
      if (!s.shoot_date) return false;
      const d = new Date(s.shoot_date + 'T00:00:00');
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
  }, [sessions]);

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f8f8f6]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link to="/video-hub" className="text-[10px] text-gray-400 hover:text-[#F5C518] no-underline">← Video Hub</Link>
            <h1 className="text-lg font-bold text-[#1a1a1a] leading-tight mt-0.5">📋 Shoot Planner</h1>
            <p className="text-[11px] text-gray-400">Client video register · recording schedule</p>
          </div>
          <div className="flex gap-2">
            {tab === 'register' && (
              <button onClick={() => { setEditingAgreement(null); setShowAgreementModal(true); }}
                className="bg-[#F5C518] text-[#1a1a1a] font-bold rounded-lg px-3 py-1.5 text-[11px] hover:bg-[#e6b800] transition">
                + Add Client
              </button>
            )}
            {tab === 'schedule' && (
              <button onClick={() => { setSessionPrefillClient(''); setShowSessionModal(true); }}
                className="bg-[#F5C518] text-[#1a1a1a] font-bold rounded-lg px-3 py-1.5 text-[11px] hover:bg-[#e6b800] transition">
                + Schedule Session
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-5 shrink-0 flex items-end gap-1">
        {[{ key: 'register', label: '👥 Client Register' }, { key: 'schedule', label: '📅 Recording Schedule' }].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-3 py-2 text-[11px] font-bold uppercase tracking-wider cursor-pointer bg-transparent border-none border-b-2 whitespace-nowrap ${
              tab === key ? 'text-[#1a1a1a] border-[#F5C518]' : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-[12px]">Loading…</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── CLIENT REGISTER ──────────────────────────────────────────────── */}
          {tab === 'register' && (
            <div>
              {agreements.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-4xl mb-3">🎬</div>
                  <div className="text-sm font-semibold text-gray-600 mb-1">No clients yet</div>
                  <div className="text-[11px] text-gray-400 mb-4">Add your first client to set up their video agreement and run sheet</div>
                  <button onClick={() => setShowAgreementModal(true)}
                    className="bg-[#F5C518] text-[#1a1a1a] font-bold rounded-lg px-5 py-2.5 text-[12px] hover:bg-[#e6b800] transition">
                    + Add First Client
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {agreements.map(a => {
                    const tl = a._tl || {};
                    const colIdx = clientColorMap[a.client_name] ?? 0;
                    const clientSessions = sessions.filter(s => s.client_name === a.client_name);
                    const nextSession = clientSessions.filter(s => new Date(s.shoot_date + 'T00:00:00') >= now).sort((x, y) => new Date(x.shoot_date) - new Date(y.shoot_date))[0];

                    return (
                      <div key={a.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                        {/* Colour bar */}
                        <div className={`h-1.5 ${CLIENT_COLORS[colIdx % CLIENT_COLORS.length].split(' ')[0]}`} />

                        <div className="p-4">
                          {/* Client name + badges */}
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div>
                              <div className="text-[14px] font-bold text-[#1a1a1a]">{a.client_name}</div>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${CONTENT_STYLE[a.objectives] || 'bg-gray-100 text-gray-600'}`}>
                                  {a.objectives || 'Podcast'}
                                </span>
                                {tl.frequency && (
                                  <span className="text-[10px] text-gray-400">{tl.frequency}</span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-[10px] text-gray-400">Shorts/session</div>
                              <div className="text-[18px] font-bold text-[#1a1a1a]">{tl.shorts_per_session ?? 8}</div>
                            </div>
                          </div>

                          {/* Stats row */}
                          <div className="flex items-center gap-3 text-[10px] text-gray-500 mb-3 pb-3 border-b border-gray-100">
                            <span>{clientSessions.length} sessions total</span>
                            <span>·</span>
                            <span className="text-green-600 font-semibold">
                              {clientSessions.filter(s => s.contact_name === 'Complete').length} complete
                            </span>
                            {nextSession && (
                              <>
                                <span>·</span>
                                <span className="text-blue-600 font-semibold">
                                  Next: {new Date(nextSession.shoot_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                </span>
                              </>
                            )}
                          </div>

                          {/* Quick deliverables preview */}
                          {tl.deliverables && (
                            <div className="text-[10px] text-gray-500 line-clamp-2 mb-3">{tl.deliverables}</div>
                          )}

                          {/* Action buttons */}
                          <div className="flex gap-2">
                            <button onClick={() => setRunSheetFor(a)}
                              className="flex-1 bg-[#f8f8f6] hover:bg-[#F5C518]/10 border border-gray-200 hover:border-[#F5C518] rounded-lg py-2 text-[11px] font-semibold text-gray-700 transition text-center cursor-pointer">
                              📄 Run Sheet
                            </button>
                            <button onClick={() => { setSessionPrefillClient(a.client_name); setShowSessionModal(true); }}
                              className="flex-1 bg-[#F5C518] hover:bg-[#e6b800] rounded-lg py-2 text-[11px] font-bold text-[#1a1a1a] transition text-center cursor-pointer">
                              + Session
                            </button>
                            <button onClick={() => { setEditingAgreement(a); setShowAgreementModal(true); }}
                              className="bg-white border border-gray-200 hover:border-gray-400 rounded-lg px-3 py-2 text-[11px] text-gray-500 transition cursor-pointer">
                              ✏️
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── RECORDING SCHEDULE ───────────────────────────────────────────── */}
          {tab === 'schedule' && (
            <div className="space-y-5">
              {/* Summary strip */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'This Month', value: thisMonthSessions.length, sub: 'sessions' },
                  { label: 'Planned', value: sessions.filter(s => s.contact_name === 'Planned').length, sub: 'upcoming' },
                  { label: 'In Progress', value: sessions.filter(s => ['Recorded', 'In Edit'].includes(s.contact_name)).length, sub: 'in edit/post' },
                  { label: 'Complete', value: sessions.filter(s => s.contact_name === 'Complete').length, sub: 'all time' },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <div className="text-[10px] text-gray-400 font-semibold uppercase">{label}</div>
                    <div className="text-[22px] font-bold text-[#1a1a1a]">{value}</div>
                    <div className="text-[10px] text-gray-400">{sub}</div>
                  </div>
                ))}
              </div>

              {/* Calendar */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* Calendar header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
                  <button onClick={() => { const d = new Date(calYear, calMonth - 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
                    className="text-gray-400 hover:text-gray-700 bg-transparent border-none text-[16px] cursor-pointer px-2">‹</button>
                  <div className="text-[13px] font-bold text-[#1a1a1a]">{monthName}</div>
                  <button onClick={() => { const d = new Date(calYear, calMonth + 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
                    className="text-gray-400 hover:text-gray-700 bg-transparent border-none text-[16px] cursor-pointer px-2">›</button>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 border-b border-gray-100">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                    <div key={d} className="text-[10px] font-bold text-gray-400 text-center py-2 uppercase">{d}</div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7">
                  {/* Pad empty cells */}
                  {Array.from({ length: startPad }).map((_, i) => (
                    <div key={`pad-${i}`} className="min-h-[80px] border-b border-r border-gray-100 bg-gray-50/50" />
                  ))}
                  {/* Day cells */}
                  {Array.from({ length: days }).map((_, i) => {
                    const day = i + 1;
                    const daySessions = sessionsByDay[day] || [];
                    const isToday = calYear === now.getFullYear() && calMonth === now.getMonth() && day === now.getDate();
                    const colInRow = (startPad + i) % 7;
                    const isLastCol = colInRow === 6;

                    return (
                      <div key={day} className={`min-h-[80px] border-b border-gray-100 p-1.5 ${isLastCol ? '' : 'border-r'} ${isToday ? 'bg-[#F5C518]/5' : ''}`}>
                        <div className={`text-[11px] font-bold mb-1 w-5 h-5 flex items-center justify-center rounded-full ${
                          isToday ? 'bg-[#F5C518] text-[#1a1a1a]' : 'text-gray-500'
                        }`}>{day}</div>
                        {daySessions.map(s => {
                          const colIdx = clientColorMap[s.client_name] ?? 0;
                          return (
                            <div key={s.id} onClick={() => navigate(`/edit-workflow?session=${s.id}`)}
                              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded mb-0.5 truncate cursor-pointer hover:opacity-80 transition ${clientColor(colIdx)}`}
                              title={`${s.client_name}: ${s.objectives || 'Session'}`}>
                              {s.client_name}
                            </div>
                          );
                        })}
                        {/* Click empty day to add session */}
                        <button onClick={() => {
                          setSessionPrefillClient('');
                          setShowSessionModal(true);
                        }}
                          className="opacity-0 hover:opacity-100 w-full text-[9px] text-gray-400 hover:text-[#F5C518] bg-transparent border-none cursor-pointer transition text-left">
                          + add
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Session list below calendar */}
              {sessions.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase">All Sessions</div>
                  <div className="divide-y divide-gray-100">
                    {[...sessions].sort((a, b) => new Date(b.shoot_date) - new Date(a.shoot_date)).map(s => {
                      const status = s.contact_name || 'Planned';
                      const st = STATUS_STYLE[status] || STATUS_STYLE.Planned;
                      const colIdx = clientColorMap[s.client_name] ?? 0;
                      const d = s.shoot_date ? new Date(s.shoot_date + 'T00:00:00') : null;
                      return (
                        <div key={s.id} className="flex items-center gap-4 px-5 py-3 hover:bg-[#f8f8f6] transition">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                          <div className={`w-1 h-10 rounded-full shrink-0 ${CLIENT_COLORS[colIdx % CLIENT_COLORS.length].split(' ')[0]}`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-semibold text-[#1a1a1a]">{s.client_name}</div>
                            <div className="text-[10px] text-gray-400 truncate">{s.objectives || 'Untitled session'}</div>
                          </div>
                          <div className="text-[11px] text-gray-500 shrink-0">
                            {d ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                          </div>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${st.pill}`}>{status}</span>
                          <button onClick={() => navigate(`/edit-workflow?session=${s.id}`)}
                            className="text-[10px] text-gray-400 hover:text-[#F5C518] bg-transparent border-none cursor-pointer shrink-0">
                            Open →
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Run Sheet Panel */}
      {runSheetFor && (
        <RunSheetPanel
          agreement={runSheetFor}
          onClose={() => setRunSheetFor(null)}
          onEdit={() => { setEditingAgreement(runSheetFor); setShowAgreementModal(true); setRunSheetFor(null); }}
          onNewSession={() => { setSessionPrefillClient(runSheetFor.client_name); setRunSheetFor(null); setShowSessionModal(true); }}
        />
      )}

      {/* Agreement Modal */}
      {showAgreementModal && (
        <AgreementModal
          clients={clients}
          initial={editingAgreement ? {
            client_name: editingAgreement.client_name,
            content_type: editingAgreement.objectives || 'Podcast',
            frequency: editingAgreement._tl?.frequency || '',
            shorts_per_session: editingAgreement._tl?.shorts_per_session ?? 8,
            deliverables: editingAgreement._tl?.deliverables || '',
            run_sheet_notes: editingAgreement.notes || '',
            run_sheet_url: editingAgreement._tl?.run_sheet_url || '',
            drive_link: editingAgreement._tl?.drive_link || '',
            trello_link: editingAgreement._tl?.trello_link || '',
          } : undefined}
          onSave={saveAgreement}
          onClose={() => { setShowAgreementModal(false); setEditingAgreement(null); }}
        />
      )}

      {/* Session Modal */}
      {showSessionModal && (
        <SessionModal
          agreements={agreements}
          prefillClient={sessionPrefillClient}
          onSave={saveSession}
          onClose={() => { setShowSessionModal(false); setSessionPrefillClient(''); }}
        />
      )}
    </div>
  );
}
