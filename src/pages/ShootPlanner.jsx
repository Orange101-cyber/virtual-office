import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import toast from 'react-hot-toast';

const CONTENT_TYPES = ['Podcast', 'Content Arbitrage', 'Both'];

const STATUS_OPTIONS = ['Planned', 'Recorded', 'In Edit', 'Complete'];

const STATUS_COLORS = {
  Planned: 'bg-gray-100 text-gray-600',
  Recorded: 'bg-blue-100 text-blue-700',
  'In Edit': 'bg-orange-100 text-orange-700',
  Complete: 'bg-green-100 text-green-700',
};

const CONTENT_TYPE_BADGE = {
  Podcast: 'bg-purple-100 text-purple-700',
  'Content Arbitrage': 'bg-yellow-100 text-yellow-800',
  Both: 'bg-pink-100 text-pink-700',
};

function Badge({ label, colorClass }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${colorClass}`}>
      {label}
    </span>
  );
}

function monthKey(dateStr) {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleString('default', { month: 'long', year: 'numeric' });
}

// ─── Agreement Form ───────────────────────────────────────────────────────────
function AgreementForm({ clients, initial, onSave, onCancel }) {
  const [form, setForm] = useState(
    initial || {
      client_name: '',
      content_type: 'Podcast',
      frequency: '',
      shorts_per_session: 8,
      deliverables: '',
      run_sheet_notes: '',
      run_sheet_url: '',
      drive_link: '',
      trello_link: '',
    }
  );

  function set(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_name) return toast.error('Please select a client.');
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1">Client *</label>
          <select
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
            value={form.client_name}
            onChange={(e) => set('client_name', e.target.value)}
          >
            <option value="">Select client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1">Content Type</label>
          <select
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
            value={form.content_type}
            onChange={(e) => set('content_type', e.target.value)}
          >
            {CONTENT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1">Recording Frequency</label>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
            placeholder="e.g. Once every 2–3 months"
            value={form.frequency}
            onChange={(e) => set('frequency', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1">Shorts per Session</label>
          <input
            type="number"
            min={1}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
            value={form.shorts_per_session}
            onChange={(e) => set('shorts_per_session', Number(e.target.value))}
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-gray-600 mb-1">Agreed Deliverables</label>
        <textarea
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
          placeholder="What are we delivering each session?"
          value={form.deliverables}
          onChange={(e) => set('deliverables', e.target.value)}
        />
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-gray-600 mb-1">Run Sheet Notes</label>
        <textarea
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
          placeholder="What happens each session? Steps, format, flow…"
          value={form.run_sheet_notes}
          onChange={(e) => set('run_sheet_notes', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1">Run Sheet URL</label>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
            placeholder="https://docs.google.com/…"
            value={form.run_sheet_url}
            onChange={(e) => set('run_sheet_url', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1">Google Drive Folder</label>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
            placeholder="https://drive.google.com/…"
            value={form.drive_link}
            onChange={(e) => set('drive_link', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-gray-600 mb-1">Trello Board Link</label>
        <input
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
          placeholder="https://trello.com/…"
          value={form.trello_link}
          onChange={(e) => set('trello_link', e.target.value)}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="bg-[#F5C518] text-[#1a1a1a] font-semibold px-4 py-2 rounded-lg text-[12px] hover:brightness-95 transition"
        >
          Save Agreement
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-gray-500 text-[12px] hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Session Form ─────────────────────────────────────────────────────────────
function SessionForm({ agreements, onSave, onCancel }) {
  const [form, setForm] = useState({
    client_name: '',
    shoot_date: '',
    episode_title: '',
    content_type: '',
    status: 'Planned',
    notes: '',
  });

  function set(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  function handleClientChange(clientName) {
    const agreement = agreements.find((a) => a.client_name === clientName);
    setForm((f) => ({
      ...f,
      client_name: clientName,
      content_type: agreement ? (agreement.objectives || '') : f.content_type,
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_name) return toast.error('Please select a client.');
    if (!form.shoot_date) return toast.error('Please set a date.');
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1">Client *</label>
          <select
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
            value={form.client_name}
            onChange={(e) => handleClientChange(e.target.value)}
          >
            <option value="">Select client…</option>
            {agreements.map((a) => (
              <option key={a.id} value={a.client_name}>{a.client_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1">Date *</label>
          <input
            type="date"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
            value={form.shoot_date}
            onChange={(e) => set('shoot_date', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-gray-600 mb-1">Episode Title / Description</label>
        <input
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
          placeholder="What's this session about?"
          value={form.episode_title}
          onChange={(e) => set('episode_title', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1">Content Type</label>
          <select
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
            value={form.content_type}
            onChange={(e) => set('content_type', e.target.value)}
          >
            <option value="">Select…</option>
            {CONTENT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1">Status</label>
          <select
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
            value={form.status}
            onChange={(e) => set('status', e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-gray-600 mb-1">Notes</label>
        <textarea
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
          placeholder="Anything specific about this session?"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="bg-[#F5C518] text-[#1a1a1a] font-semibold px-4 py-2 rounded-lg text-[12px] hover:brightness-95 transition"
        >
          Save Session
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-gray-500 text-[12px] hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ShootPlanner() {
  const [tab, setTab] = useState('register');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAgreementForm, setShowAgreementForm] = useState(false);
  const [editingAgreement, setEditingAgreement] = useState(null);
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [expandedSession, setExpandedSession] = useState(null);

  const { clients } = useClients();

  async function loadData() {
    setLoading(true);
    const { data, error } = await supabase
      .from('shoot_planner')
      .select('*')
      .order('shoot_date', { ascending: false });

    if (error) {
      if (error.code === '42P01') {
        setRows([]);
      } else {
        toast.error('Failed to load data');
        console.error(error);
      }
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const agreements = useMemo(
    () =>
      rows
        .filter((r) => r.shoot_type === 'agreement')
        .map((r) => ({
          ...r,
          timeline_parsed: (() => {
            try {
              return typeof r.timeline === 'string'
                ? JSON.parse(r.timeline)
                : r.timeline || {};
            } catch {
              return {};
            }
          })(),
        })),
    [rows]
  );

  const sessions = useMemo(
    () => rows.filter((r) => r.shoot_type !== 'agreement'),
    [rows]
  );

  // ── Agreement CRUD ──────────────────────────────────────────────────────────
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
      shoot_type: 'agreement',
      client_name: form.client_name,
      objectives: form.content_type,
      notes: form.run_sheet_notes,
      timeline,
    };

    if (editingAgreement) {
      const { error } = await supabase
        .from('shoot_planner')
        .update(payload)
        .eq('id', editingAgreement.id);
      if (error) return toast.error('Failed to update agreement');
      toast.success('Agreement updated');
    } else {
      const { error } = await supabase.from('shoot_planner').insert(payload);
      if (error) return toast.error('Failed to save agreement');
      toast.success('Agreement saved');
    }

    setShowAgreementForm(false);
    setEditingAgreement(null);
    loadData();
  }

  async function deleteAgreement(id) {
    if (!window.confirm('Delete this client agreement?')) return;
    const { error } = await supabase.from('shoot_planner').delete().eq('id', id);
    if (error) return toast.error('Failed to delete');
    toast.success('Deleted');
    loadData();
  }

  function startEditAgreement(agreement) {
    setEditingAgreement(agreement);
    setShowAgreementForm(true);
  }

  // ── Session CRUD ────────────────────────────────────────────────────────────
  async function saveSession(form) {
    const payload = {
      shoot_type: 'session',
      client_name: form.client_name,
      shoot_date: form.shoot_date,
      objectives: form.episode_title,
      notes: form.notes,
      contact_name: form.status,
      location: form.content_type,
    };

    const { error } = await supabase.from('shoot_planner').insert(payload);
    if (error) return toast.error('Failed to save session');
    toast.success('Session saved');
    setShowSessionForm(false);
    loadData();
  }

  // ── Sessions grouped by month ───────────────────────────────────────────────
  const sessionsByMonth = useMemo(() => {
    const groups = {};
    const sorted = [...sessions].sort(
      (a, b) => new Date(b.shoot_date) - new Date(a.shoot_date)
    );
    sorted.forEach((s) => {
      const key = monthKey(s.shoot_date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return groups;
  }, [sessions]);

  const thisMonthKey = monthKey(new Date().toISOString().slice(0, 10));
  const thisMonthSessions = sessionsByMonth[thisMonthKey] || [];
  const thisMonthClients = new Set(thisMonthSessions.map((s) => s.client_name)).size;

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f8f8f6]">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/video-hub"
            className="text-[11px] text-gray-400 hover:text-[#F5C518] transition"
          >
            ← Video Hub
          </Link>
          <div>
            <h1 className="text-[18px] font-bold text-[#1a1a1a] leading-tight">
              Shoot Planner
            </h1>
            <p className="text-[11px] text-gray-400">
              Client video register &amp; recording schedule
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'register' && (
            <button
              onClick={() => {
                setEditingAgreement(null);
                setShowAgreementForm(true);
              }}
              className="bg-[#F5C518] text-[#1a1a1a] font-semibold px-4 py-2 rounded-lg text-[12px] hover:brightness-95 transition"
            >
              + Add Client Agreement
            </button>
          )}
          {tab === 'schedule' && (
            <button
              onClick={() => setShowSessionForm(true)}
              className="bg-[#F5C518] text-[#1a1a1a] font-semibold px-4 py-2 rounded-lg text-[12px] hover:brightness-95 transition"
            >
              + New Session
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-6">
          {[
            { key: 'register', label: 'Client Register' },
            { key: 'schedule', label: 'Recording Schedule' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`py-3 text-[12px] font-semibold border-b-2 transition ${
                tab === key
                  ? 'border-[#F5C518] text-[#1a1a1a]'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 max-w-5xl mx-auto">
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-[12px]">Loading…</div>
        ) : (
          <>
            {/* ── CLIENT REGISTER TAB ─────────────────────────────────────────── */}
            {tab === 'register' && (
              <div className="space-y-4">
                {showAgreementForm && (
                  <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                    <h3 className="text-[14px] font-bold text-[#1a1a1a] mb-4">
                      {editingAgreement ? 'Edit Agreement' : 'New Client Agreement'}
                    </h3>
                    <AgreementForm
                      clients={clients}
                      initial={
                        editingAgreement
                          ? {
                              client_name: editingAgreement.client_name,
                              content_type: editingAgreement.objectives || 'Podcast',
                              frequency:
                                editingAgreement.timeline_parsed?.frequency || '',
                              shorts_per_session:
                                editingAgreement.timeline_parsed?.shorts_per_session ?? 8,
                              deliverables:
                                editingAgreement.timeline_parsed?.deliverables || '',
                              run_sheet_notes: editingAgreement.notes || '',
                              run_sheet_url:
                                editingAgreement.timeline_parsed?.run_sheet_url || '',
                              drive_link:
                                editingAgreement.timeline_parsed?.drive_link || '',
                              trello_link:
                                editingAgreement.timeline_parsed?.trello_link || '',
                            }
                          : undefined
                      }
                      onSave={saveAgreement}
                      onCancel={() => {
                        setShowAgreementForm(false);
                        setEditingAgreement(null);
                      }}
                    />
                  </div>
                )}

                {agreements.length === 0 && !showAgreementForm && (
                  <div className="text-center py-16 text-gray-400 text-[12px]">
                    No client agreements yet. Click "Add Client Agreement" to get started.
                  </div>
                )}

                {agreements.map((a) => {
                  const tl = a.timeline_parsed || {};
                  return (
                    <div
                      key={a.id}
                      className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#F5C518] flex items-center justify-center font-bold text-[#1a1a1a] text-[13px]">
                            {(a.client_name || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-[14px] font-bold text-[#1a1a1a]">
                              {a.client_name}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge
                                label={a.objectives || 'Podcast'}
                                colorClass={
                                  CONTENT_TYPE_BADGE[a.objectives] ||
                                  'bg-gray-100 text-gray-600'
                                }
                              />
                              {tl.frequency && (
                                <span className="text-[10px] text-gray-400">
                                  {tl.frequency}
                                </span>
                              )}
                              {tl.shorts_per_session !== undefined && (
                                <span className="text-[10px] text-gray-400">
                                  {tl.shorts_per_session} shorts/session
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEditAgreement(a)}
                            className="text-[11px] text-gray-500 hover:text-[#1a1a1a] transition px-2 py-1 rounded border border-gray-200 hover:border-gray-400"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteAgreement(a.id)}
                            className="text-[11px] text-red-400 hover:text-red-600 transition px-2 py-1 rounded border border-red-100 hover:border-red-300"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-4">
                        {tl.deliverables && (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                              Deliverables
                            </p>
                            <p className="text-[11px] text-gray-600 whitespace-pre-wrap">
                              {tl.deliverables}
                            </p>
                          </div>
                        )}
                        {a.notes && (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                              Run Sheet Notes
                            </p>
                            <p className="text-[11px] text-gray-600 whitespace-pre-wrap">
                              {a.notes}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-3">
                        {tl.run_sheet_url && (
                          <a
                            href={tl.run_sheet_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-600 hover:underline"
                          >
                            Run Sheet →
                          </a>
                        )}
                        {tl.drive_link && (
                          <a
                            href={tl.drive_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-600 hover:underline"
                          >
                            Google Drive →
                          </a>
                        )}
                        {tl.trello_link && (
                          <a
                            href={tl.trello_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-600 hover:underline"
                          >
                            Trello Board →
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── RECORDING SCHEDULE TAB ─────────────────────────────────────── */}
            {tab === 'schedule' && (
              <div className="space-y-6">
                {/* Summary banner */}
                <div className="bg-[#1a1a1a] text-white rounded-xl px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5 uppercase tracking-wide">
                      {thisMonthKey}
                    </p>
                    <p className="text-[14px] font-bold">
                      {thisMonthSessions.length}{' '}
                      {thisMonthSessions.length === 1 ? 'session' : 'sessions'} this month
                      {thisMonthClients > 0 &&
                        ` · ${thisMonthClients} ${thisMonthClients === 1 ? 'client' : 'clients'}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 mb-0.5">All time</p>
                    <p className="text-[13px] font-semibold">
                      {sessions.filter((s) => s.contact_name === 'Complete').length}{' '}
                      <span className="text-gray-400 font-normal">of</span> {sessions.length}{' '}
                      complete
                    </p>
                  </div>
                </div>

                {showSessionForm && (
                  <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                    <h3 className="text-[14px] font-bold text-[#1a1a1a] mb-4">
                      New Recording Session
                    </h3>
                    <SessionForm
                      agreements={agreements}
                      onSave={saveSession}
                      onCancel={() => setShowSessionForm(false)}
                    />
                  </div>
                )}

                {sessions.length === 0 && !showSessionForm && (
                  <div className="text-center py-16 text-gray-400 text-[12px]">
                    No sessions recorded yet. Click "New Session" to add one.
                  </div>
                )}

                {Object.entries(sessionsByMonth).map(([month, monthSessions]) => (
                  <div key={month}>
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-[12px] font-bold text-[#1a1a1a]">{month}</h3>
                      <span className="text-[10px] text-gray-400">
                        {monthSessions.length}{' '}
                        {monthSessions.length === 1 ? 'session' : 'sessions'}
                      </span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>

                    <div className="space-y-2">
                      {monthSessions.map((s) => {
                        const status = s.contact_name || 'Planned';
                        const contentType = s.location || '';
                        const isExpanded = expandedSession === s.id;
                        const dateObj = s.shoot_date
                          ? new Date(s.shoot_date + 'T00:00:00')
                          : null;

                        return (
                          <div
                            key={s.id}
                            className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
                          >
                            <div
                              className="flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-gray-50 transition"
                              onClick={() =>
                                setExpandedSession(isExpanded ? null : s.id)
                              }
                            >
                              {/* Date block */}
                              <div className="text-center min-w-[44px]">
                                <p className="text-[10px] text-gray-400 uppercase leading-none">
                                  {dateObj
                                    ? dateObj.toLocaleString('default', { month: 'short' })
                                    : '—'}
                                </p>
                                <p className="text-[20px] font-bold text-[#1a1a1a] leading-tight">
                                  {dateObj ? dateObj.getDate() : '?'}
                                </p>
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold text-[#1a1a1a] truncate">
                                  {s.client_name}
                                </p>
                                <p className="text-[11px] text-gray-400 truncate">
                                  {s.objectives || 'Untitled session'}
                                </p>
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                                {contentType && (
                                  <Badge
                                    label={contentType}
                                    colorClass={
                                      CONTENT_TYPE_BADGE[contentType] ||
                                      'bg-gray-100 text-gray-600'
                                    }
                                  />
                                )}
                                <Badge
                                  label={status}
                                  colorClass={
                                    STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'
                                  }
                                />
                                <span className="text-gray-300 text-[11px] ml-1">
                                  {isExpanded ? '▲' : '▼'}
                                </span>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="px-5 pb-4 border-t border-gray-100 pt-3 bg-gray-50">
                                {s.notes && (
                                  <p className="text-[11px] text-gray-600 mb-3 whitespace-pre-wrap">
                                    {s.notes}
                                  </p>
                                )}
                                <Link
                                  to={`/edit-workflow?session=${s.id}`}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1a1a1a] hover:text-[#F5C518] transition"
                                >
                                  Open in Edit Workflow →
                                </Link>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
