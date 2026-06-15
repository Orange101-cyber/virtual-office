import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import toast from 'react-hot-toast';

// ─── Workflow Step Definitions ────────────────────────────────────────────────

const STEPS = [
  {
    id: 1,
    title: 'Pre-Production / Client Brief',
    dept: 'Account Manager',
    deptColor: 'bg-yellow-100 text-yellow-800',
    description:
      'Confirm content type and session plan with the client before the shoot.',
    checklist: [
      'Client briefed on session objectives',
      'Content type confirmed (Podcast or Content Arbitrage)',
      'Run sheet reviewed and sent to client',
      'Shoot date and location locked in',
      'Client has approved the outline',
    ],
    linkLabel: 'Run Sheet URL',
  },
  {
    id: 2,
    title: 'Recording',
    dept: 'Creative Team + Client',
    deptColor: 'bg-purple-100 text-purple-700',
    description:
      'Set up and capture the session using YoloBox and cameras.',
    checklist: [
      'YoloBox connected and streaming correctly',
      'Front camera angle set up',
      'Left angle camera set up',
      'Right angle camera set up',
      'Audio levels checked and recording',
      'Lighting checked',
      'SD cards formatted and have sufficient space',
      'Run sheet visible on screen for talent',
      'Recording started — all angles rolling',
      'Session complete — recording stopped',
    ],
    linkLabel: 'Recording Drive Link (raw)',
  },
  {
    id: 3,
    title: 'Ingest & Backup',
    dept: 'Video Team',
    deptColor: 'bg-blue-100 text-blue-700',
    description:
      'Get the footage off the YoloBox and safely backed up before editing begins.',
    checklist: [
      'Footage transferred from YoloBox to external hard drive',
      'Hard drive backup verified (play back a sample)',
      'RAW footage uploaded to Google Drive RAW folder (3rd backup)',
      'Google Drive upload verified — all files present',
      'Trello card created for Clean Editor to begin Step 4',
    ],
    linkLabel: 'Google Drive RAW Folder Link',
  },
  {
    id: 4,
    title: 'Clean Edit',
    dept: 'Clean Editor',
    deptColor: 'bg-teal-100 text-teal-700',
    description:
      'Cut the full footage into one clean edit and mark potential shorts.',
    checklist: [
      'Full footage reviewed end to end',
      'Junk/mistakes/dead air removed',
      'One clean full edit exported',
      'Potential shorts identified and in/out points marked on timeline',
      'Minimum 8 short clips marked (aim for 10)',
      'Clean edit uploaded to Drive',
      'Trello card moved to Step 5',
    ],
    linkLabel: 'Clean Edit Drive Link',
  },
  {
    id: 5,
    title: 'Topaz AI Enhancement',
    dept: 'Clean Editor / Tech',
    deptColor: 'bg-gray-100 text-gray-700',
    description:
      'Run the clean edit through Topaz AI to sharpen and clean up the final quality.',
    checklist: [
      'Clean edit imported into Topaz AI',
      'Topaz settings applied (resolution enhancement + noise reduction)',
      'Export started',
      'Export completed and quality reviewed',
      'Topaz output uploaded to Drive',
      'Trello card moved to Step 6',
    ],
    linkLabel: 'Topaz Output Drive Link',
  },
  {
    id: 6,
    title: 'Shorts Edit (Dopamine Hits)',
    dept: 'Video Editor',
    deptColor: 'bg-blue-100 text-blue-700',
    description:
      'Edit each short clip with dopamine-hit pacing, B-roll, captions and graphics.',
    checklist: [
      'Short 1 — dopamine edit complete',
      'Short 2 — dopamine edit complete',
      'Short 3 — dopamine edit complete',
      'Short 4 — dopamine edit complete',
      'Short 5 — dopamine edit complete',
      'Short 6 — dopamine edit complete',
      'Short 7 — dopamine edit complete',
      'Short 8 — dopamine edit complete',
      'B-roll added to each short',
      'Captions/subtitles added',
      'All 8 shorts exported and uploaded to Drive',
      'Trello card shared with Comms + Admin',
    ],
    linkLabel: 'Shorts Drive Folder Link',
  },
  {
    id: 7,
    title: 'Copy & Internal Approval',
    dept: 'Comms + Admin',
    deptColor: 'bg-pink-100 text-pink-700',
    description:
      'Write copy for each piece of content and get internal sign-off before going to the client.',
    checklist: [
      'Shorts and full edit added to Airtable',
      'Copy written for each of the 8 shorts',
      'Copy written for the full episode post',
      'Internal review completed',
      'Any edits from internal review applied',
      'Content approved internally — ready for client',
    ],
    linkLabel: 'Airtable Record Link',
  },
  {
    id: 8,
    title: 'Client Approval',
    dept: 'Account Manager + Client',
    deptColor: 'bg-yellow-100 text-yellow-800',
    description:
      'Send content to the client for their final approval.',
    checklist: [
      'Client sent content for review (link shared)',
      'Client feedback received',
      'Any requested changes applied',
      'Client formally approved the content',
      'Approval documented',
    ],
    linkLabel: 'Client Approval Link / Email Thread',
  },
  {
    id: 9,
    title: 'Publish & Schedule',
    dept: 'Admin',
    deptColor: 'bg-green-100 text-green-700',
    description:
      'Schedule or publish all approved content to the relevant platforms.',
    checklist: [
      'Shorts scheduled on social channels (2 per week for 4 weeks)',
      'Full episode uploaded to YouTube (if applicable)',
      'YouTube title, description, thumbnail set',
      'Episode published / scheduled on all agreed platforms',
      'Client notified of go-live dates',
      'Drive folder marked as COMPLETE',
      'Trello card archived',
    ],
    linkLabel: 'Published Content Links',
  },
];

const CONTENT_TYPES = ['Podcast', 'Content Arbitrage', 'Both'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDefaultHandoff() {
  const stages = {};
  STEPS.forEach((step) => {
    const checklist = {};
    step.checklist.forEach((item) => {
      checklist[item] = false;
    });
    stages[String(step.id)] = { checklist, link: '', notes: '', completed: false };
  });
  return { current_stage: 1, stages };
}

function parseHandoff(raw) {
  if (!raw) return buildDefaultHandoff();
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // Ensure all stages exist
    const base = buildDefaultHandoff();
    const merged = { ...base, ...parsed };
    STEPS.forEach((step) => {
      const key = String(step.id);
      if (!merged.stages[key]) {
        merged.stages[key] = base.stages[key];
      } else {
        // Ensure all checklist items exist
        step.checklist.forEach((item) => {
          if (merged.stages[key].checklist[item] === undefined) {
            merged.stages[key].checklist[item] = false;
          }
        });
      }
    });
    return merged;
  } catch {
    return buildDefaultHandoff();
  }
}

function stageProgress(handoff) {
  // Returns 0..9 representing how many stages are completed
  if (!handoff) return 0;
  let count = 0;
  STEPS.forEach((step) => {
    const s = handoff.stages?.[String(step.id)];
    if (s?.completed) count++;
  });
  return count;
}

function monthLabel(dateStr) {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── New Production Modal ─────────────────────────────────────────────────────

function NewProductionModal({ agreements, onSave, onClose }) {
  const [form, setForm] = useState({
    client_name: '',
    shoot_date: '',
    episode_title: '',
    content_type: '',
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

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_name) return toast.error('Please select a client.');
    if (!form.shoot_date) return toast.error('Please set a date.');
    onSave(form);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[16px] font-bold text-[#1a1a1a]">New Production</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-[18px] leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
              Client *
            </label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
              value={form.client_name}
              onChange={(e) => handleClientChange(e.target.value)}
            >
              <option value="">Select client…</option>
              {agreements.map((a) => (
                <option key={a.id} value={a.client_name}>
                  {a.client_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
              Episode Title
            </label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
              placeholder="What's this production about?"
              value={form.episode_title}
              onChange={(e) => set('episode_title', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Date *
              </label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
                value={form.shoot_date}
                onChange={(e) => set('shoot_date', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Content Type
              </label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
                value={form.content_type}
                onChange={(e) => set('content_type', e.target.value)}
              >
                <option value="">Select…</option>
                {CONTENT_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 bg-[#F5C518] text-[#1a1a1a] font-semibold py-2 rounded-lg text-[12px] hover:brightness-95 transition"
            >
              Create Production
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-500 text-[12px] hover:text-gray-700 px-3"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Step Panel ───────────────────────────────────────────────────────────────

function StepPanel({ step, stageData, isActive, isCompleted, isFuture, onUpdate, onComplete }) {
  const [expanded, setExpanded] = useState(isActive);

  useEffect(() => {
    if (isActive) setExpanded(true);
  }, [isActive]);

  const allChecked = step.checklist.every((item) => stageData.checklist[item]);

  function toggleCheck(item) {
    const updated = {
      ...stageData,
      checklist: { ...stageData.checklist, [item]: !stageData.checklist[item] },
    };
    onUpdate(updated);
  }

  function setLink(val) {
    onUpdate({ ...stageData, link: val });
  }

  function setNotes(val) {
    onUpdate({ ...stageData, notes: val });
  }

  // Dot color
  let dotColor = 'bg-gray-300';
  if (isCompleted) dotColor = 'bg-green-500';
  else if (isActive) dotColor = 'bg-[#F5C518]';

  return (
    <div
      className={`rounded-xl border transition-all ${
        isActive
          ? 'border-[#F5C518] shadow-md'
          : isCompleted
          ? 'border-green-200 bg-green-50/40'
          : 'border-gray-200'
      } overflow-hidden`}
    >
      {/* Step header — always visible */}
      <div
        className={`flex items-center gap-4 px-5 py-3 cursor-pointer ${
          isActive ? 'bg-[#F5C518]/10' : 'bg-white hover:bg-gray-50'
        } transition`}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Step number / check circle */}
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
            isCompleted
              ? 'bg-green-500 text-white'
              : isActive
              ? 'bg-[#F5C518] text-[#1a1a1a]'
              : 'bg-gray-100 text-gray-400'
          }`}
        >
          {isCompleted ? '✓' : step.id}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p
              className={`text-[13px] font-bold ${
                isFuture && !isActive ? 'text-gray-400' : 'text-[#1a1a1a]'
              }`}
            >
              {step.title}
            </p>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${step.deptColor}`}>
              {step.dept}
            </span>
          </div>
          {isCompleted && (
            <p className="text-[10px] text-green-600 font-semibold mt-0.5">
              Complete
            </p>
          )}
          {isActive && !isCompleted && (
            <p className="text-[10px] text-[#b89000] font-semibold mt-0.5">
              Current step — {step.checklist.filter((i) => stageData.checklist[i]).length}/
              {step.checklist.length} items done
            </p>
          )}
        </div>

        <span className="text-gray-300 text-[11px] flex-shrink-0">
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-5 pb-5 pt-3 border-t border-gray-100 bg-white space-y-4">
          {/* Description */}
          <p className="text-[11px] text-gray-500 italic">{step.description}</p>

          {/* Checklist */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Checklist
            </p>
            {step.checklist.map((item) => (
              <label
                key={item}
                className="flex items-start gap-2.5 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={!!stageData.checklist[item]}
                  onChange={() => toggleCheck(item)}
                  className="mt-0.5 accent-[#F5C518] w-3.5 h-3.5 flex-shrink-0"
                />
                <span
                  className={`text-[12px] transition ${
                    stageData.checklist[item]
                      ? 'line-through text-gray-300'
                      : 'text-gray-700 group-hover:text-[#1a1a1a]'
                  }`}
                >
                  {item}
                </span>
              </label>
            ))}
          </div>

          {/* Link field */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              {step.linkLabel}
            </label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
              placeholder="https://…"
              value={stageData.link || ''}
              onChange={(e) => setLink(e.target.value)}
            />
            {stageData.link && (
              <a
                href={stageData.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-blue-600 hover:underline mt-1 inline-block"
              >
                Open link →
              </a>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Notes
            </label>
            <textarea
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#F5C518] resize-none"
              placeholder="Any notes for this step…"
              value={stageData.notes || ''}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Complete button */}
          {!isCompleted && (
            <button
              onClick={onComplete}
              disabled={!allChecked}
              className={`w-full py-2.5 rounded-lg text-[12px] font-semibold transition ${
                allChecked
                  ? 'bg-[#F5C518] text-[#1a1a1a] hover:brightness-95'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {allChecked
                ? `Mark Step ${step.id} Complete →`
                : `Complete all ${step.checklist.length - step.checklist.filter((i) => stageData.checklist[i]).length} remaining items to proceed`}
            </button>
          )}

          {isCompleted && (
            <div className="flex items-center gap-2 text-green-600 text-[11px] font-semibold">
              <span className="w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-[10px]">
                ✓
              </span>
              Step complete
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EditWorkflow() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSessionId = searchParams.get('session');

  const [sessions, setSessions] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(initialSessionId || null);
  const [handoff, setHandoff] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const saveTimerRef = useRef(null);
  const { clients } = useClients();

  // Load all sessions + agreements
  async function loadData() {
    setLoading(true);
    const { data, error } = await supabase
      .from('shoot_planner')
      .select('*')
      .order('shoot_date', { ascending: false });

    if (error && error.code !== '42P01') {
      toast.error('Failed to load productions');
      console.error(error);
      setLoading(false);
      return;
    }

    const rows = data || [];
    setSessions(rows.filter((r) => r.shoot_type !== 'agreement'));
    setAgreements(
      rows
        .filter((r) => r.shoot_type === 'agreement')
        .map((r) => ({
          ...r,
          timeline_parsed: (() => {
            try {
              return typeof r.timeline === 'string' ? JSON.parse(r.timeline) : r.timeline || {};
            } catch {
              return {};
            }
          })(),
        }))
    );
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  // When sessions load and we have an initial ID from URL, select it
  useEffect(() => {
    if (initialSessionId && sessions.length > 0) {
      selectSession(initialSessionId, sessions);
    }
  }, [sessions.length]);

  function selectSession(id, sessionList) {
    const list = sessionList || sessions;
    const session = list.find((s) => String(s.id) === String(id));
    if (!session) return;
    setSelectedId(String(id));
    setHandoff(parseHandoff(session.handoff));
    setSearchParams({ session: id });
  }

  // Auto-save with 1s debounce
  function scheduleAutoSave(updatedHandoff) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      persistHandoff(updatedHandoff);
    }, 1000);
  }

  async function persistHandoff(h) {
    if (!selectedId) return;
    setSaving(true);
    const { error } = await supabase
      .from('shoot_planner')
      .update({ handoff: JSON.stringify(h) })
      .eq('id', selectedId);
    setSaving(false);
    if (error) {
      toast.error('Auto-save failed');
      console.error(error);
    }
  }

  function updateStageData(stepId, updatedStageData) {
    setHandoff((prev) => {
      const next = {
        ...prev,
        stages: { ...prev.stages, [String(stepId)]: updatedStageData },
      };
      scheduleAutoSave(next);
      return next;
    });
  }

  function markStepComplete(stepId) {
    setHandoff((prev) => {
      const nextStage = Math.min(stepId + 1, 9);
      const next = {
        ...prev,
        current_stage: stepId >= prev.current_stage ? nextStage : prev.current_stage,
        stages: {
          ...prev.stages,
          [String(stepId)]: { ...prev.stages[String(stepId)], completed: true },
        },
      };
      // Immediately save on step complete
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      persistHandoff(next);
      return next;
    });
    toast.success(`Step ${stepId} complete!`);
  }

  async function createProduction(form) {
    const payload = {
      shoot_type: 'session',
      client_name: form.client_name,
      shoot_date: form.shoot_date,
      objectives: form.episode_title,
      location: form.content_type,
      contact_name: 'Planned',
      handoff: JSON.stringify(buildDefaultHandoff()),
    };

    const { data, error } = await supabase
      .from('shoot_planner')
      .insert(payload)
      .select()
      .single();

    if (error) {
      toast.error('Failed to create production');
      console.error(error);
      return;
    }

    toast.success('Production created');
    setShowNewModal(false);
    await loadData();
    // Select the new session
    setSelectedId(String(data.id));
    setHandoff(parseHandoff(data.handoff));
    setSearchParams({ session: data.id });
  }

  // Derived: currently selected session
  const selectedSession = sessions.find((s) => String(s.id) === String(selectedId));

  // Sessions grouped by month for sidebar
  const sessionsByMonth = (() => {
    const groups = {};
    sessions.forEach((s) => {
      const key = monthLabel(s.shoot_date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return groups;
  })();

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f8f8f6] flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 flex-shrink-0">
        <Link
          to="/video-hub"
          className="text-[11px] text-gray-400 hover:text-[#F5C518] transition"
        >
          ← Video Hub
        </Link>
        <div className="flex-1">
          <h1 className="text-[18px] font-bold text-[#1a1a1a] leading-tight">
            Edit Workflow
          </h1>
          <p className="text-[11px] text-gray-400">9-step video production tracker</p>
        </div>
        {saving && (
          <span className="text-[10px] text-gray-400 animate-pulse">Saving…</span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
        <div className="w-[280px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <button
              onClick={() => setShowNewModal(true)}
              className="w-full bg-[#F5C518] text-[#1a1a1a] font-semibold py-2.5 rounded-lg text-[12px] hover:brightness-95 transition"
            >
              + New Production
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {loading ? (
              <div className="text-center py-8 text-gray-400 text-[11px]">Loading…</div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-[11px] px-4">
                No productions yet. Create one to get started.
              </div>
            ) : (
              Object.entries(sessionsByMonth).map(([month, monthSessions]) => (
                <div key={month} className="mb-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide px-4 py-1">
                    {month}
                  </p>
                  {monthSessions.map((s) => {
                    const h = parseHandoff(s.handoff);
                    const completed = stageProgress(h);
                    const isSelected = String(s.id) === String(selectedId);
                    const pct = Math.round((completed / 9) * 100);

                    // Sidebar dot color
                    let dotColor = 'bg-gray-300';
                    if (completed === 9) dotColor = 'bg-green-500';
                    else if (completed > 0) dotColor = 'bg-blue-500';

                    return (
                      <button
                        key={s.id}
                        onClick={() => selectSession(s.id)}
                        className={`w-full text-left px-4 py-3 transition ${
                          isSelected
                            ? 'bg-[#F5C518]/10 border-r-2 border-[#F5C518]'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div
                            className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dotColor}`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold text-[#1a1a1a] truncate">
                              {s.client_name}
                            </p>
                            <p className="text-[10px] text-gray-400 truncate">
                              {s.objectives || 'Untitled'}
                            </p>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {formatDate(s.shoot_date)}
                            </p>
                            {/* Mini progress bar */}
                            <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  completed === 9 ? 'bg-green-500' : 'bg-[#F5C518]'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <p className="text-[9px] text-gray-300 mt-0.5">
                              Stage {completed === 0 ? 1 : Math.min(h.current_stage, 9)} of 9
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── MAIN AREA ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {!selectedSession ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-[12px]">
              Select a production from the left, or create a new one.
            </div>
          ) : (
            <div className="p-6 max-w-3xl mx-auto">
              {/* Production header */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-1">
                      Production
                    </p>
                    <h2 className="text-[20px] font-bold text-[#1a1a1a] leading-tight">
                      {selectedSession.client_name}
                    </h2>
                    <p className="text-[13px] text-gray-500 mt-0.5">
                      {selectedSession.objectives || 'Untitled'}
                    </p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="text-[11px] text-gray-400">
                        {formatDate(selectedSession.shoot_date)}
                      </span>
                      {selectedSession.location && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                          {selectedSession.location}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-gray-400 mb-1">Progress</p>
                    <p className="text-[22px] font-bold text-[#1a1a1a]">
                      {stageProgress(handoff)}/9
                    </p>
                    <p className="text-[10px] text-gray-400">stages complete</p>
                  </div>
                </div>

                {/* 9-dot progress row */}
                <div className="flex items-center gap-1.5 mt-4">
                  {STEPS.map((step) => {
                    const isComp = handoff?.stages?.[String(step.id)]?.completed;
                    const isCurr = !isComp && String(step.id) === String(handoff?.current_stage);
                    return (
                      <div
                        key={step.id}
                        title={`Step ${step.id}: ${step.title}`}
                        className={`flex-1 h-2 rounded-full transition-all ${
                          isComp
                            ? 'bg-green-500'
                            : isCurr
                            ? 'bg-[#F5C518]'
                            : 'bg-gray-200'
                        }`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1 px-0.5">
                  <span className="text-[9px] text-gray-400">Pre-Production</span>
                  <span className="text-[9px] text-gray-400">Publish</span>
                </div>
              </div>

              {/* Steps */}
              {handoff && (
                <div className="space-y-3">
                  {STEPS.map((step) => {
                    const stageKey = String(step.id);
                    const stageData = handoff.stages[stageKey] || {
                      checklist: {},
                      link: '',
                      notes: '',
                      completed: false,
                    };
                    const isCompleted = !!stageData.completed;
                    const isActive =
                      !isCompleted &&
                      String(step.id) === String(handoff.current_stage);
                    const isFuture = step.id > (handoff.current_stage || 1) && !isCompleted;

                    return (
                      <StepPanel
                        key={step.id}
                        step={step}
                        stageData={stageData}
                        isActive={isActive}
                        isCompleted={isCompleted}
                        isFuture={isFuture}
                        onUpdate={(updated) => updateStageData(step.id, updated)}
                        onComplete={() => markStepComplete(step.id)}
                      />
                    );
                  })}
                </div>
              )}

              {/* All complete */}
              {handoff && stageProgress(handoff) === 9 && (
                <div className="mt-6 bg-green-50 border border-green-200 rounded-xl p-5 text-center">
                  <p className="text-[20px] mb-1">🎉</p>
                  <p className="text-[14px] font-bold text-green-700">
                    Production Complete!
                  </p>
                  <p className="text-[11px] text-green-600 mt-1">
                    All 9 steps are done for {selectedSession.client_name}.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* New Production Modal */}
      {showNewModal && (
        <NewProductionModal
          agreements={agreements}
          onSave={createProduction}
          onClose={() => setShowNewModal(false)}
        />
      )}
    </div>
  );
}
