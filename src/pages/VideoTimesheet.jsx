import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const PIN_CODE = '1954';
const STAFF_NAME = 'Carlos';
const COMPANY = 'Campaigns You Love';

function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function formatDate(date) {
  return new Date(date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function hoursMinsBetween(start, end) {
  const diff = (new Date(end) - new Date(start)) / 1000 / 60;
  const h = Math.floor(diff / 60);
  const m = Math.round(diff % 60);
  return { h, m, decimal: +(diff / 60).toFixed(2), display: `${h}h ${m}m` };
}
function weekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}
function weekLabel(date) {
  const ws = weekStart(date);
  const we = new Date(ws);
  we.setDate(we.getDate() + 6);
  return `${ws.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${we.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export default function VideoTimesheet() {
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [clockedIn, setClockedIn] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showWeek, setShowWeek] = useState(weekStart(new Date()).toISOString());
  const [note, setNote] = useState('');

  // Load entries
  useEffect(() => {
    if (!authenticated) return;
    setLoading(true);
    supabase.from('video_timesheets')
      .select('*')
      .eq('staff_name', STAFF_NAME)
      .order('clock_in', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) {
          if (error.code === '42P01') setEntries([]);
          else console.error(error);
        } else {
          setEntries(data || []);
          const active = (data || []).find(e => !e.clock_out);
          if (active) setClockedIn(active);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [authenticated]);

  // Entries for selected week
  const weekEntries = useMemo(() => {
    const ws = new Date(showWeek);
    const we = new Date(ws);
    we.setDate(we.getDate() + 7);
    return entries.filter(e => {
      const d = new Date(e.clock_in);
      return d >= ws && d < we && e.clock_out;
    }).sort((a, b) => new Date(a.clock_in) - new Date(b.clock_in));
  }, [entries, showWeek]);

  const weekTotal = useMemo(() => {
    let mins = 0;
    weekEntries.forEach(e => {
      if (e.clock_out) {
        const breakMins = e.break_minutes || 0;
        mins += (new Date(e.clock_out) - new Date(e.clock_in)) / 1000 / 60 - breakMins;
      }
    });
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return { h, m, decimal: +(mins / 60).toFixed(2), display: `${h}h ${m}m` };
  }, [weekEntries]);

  // Available weeks
  const availableWeeks = useMemo(() => {
    const weeks = new Set();
    entries.forEach(e => weeks.add(weekStart(e.clock_in).toISOString()));
    // Add current week if not present
    weeks.add(weekStart(new Date()).toISOString());
    return Array.from(weeks).sort((a, b) => new Date(b) - new Date(a));
  }, [entries]);

  const handlePinSubmit = (e) => {
    e?.preventDefault();
    if (pin === PIN_CODE) {
      setAuthenticated(true);
      toast.success(`Welcome, ${STAFF_NAME}`);
    } else {
      toast.error('Incorrect PIN');
      setPin('');
    }
  };

  const handleClockIn = async () => {
    const now = new Date().toISOString();
    try {
      const { data, error } = await supabase.from('video_timesheets')
        .insert({ staff_name: STAFF_NAME, clock_in: now, note: note || null })
        .select().single();
      if (error) throw error;
      setEntries(prev => [data, ...prev]);
      setClockedIn(data);
      setNote('');
      toast.success('Clocked in at ' + formatTime(now));
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleClockOut = async () => {
    if (!clockedIn) return;
    const now = new Date().toISOString();
    try {
      const { error } = await supabase.from('video_timesheets')
        .update({ clock_out: now, updated_at: now })
        .eq('id', clockedIn.id);
      if (error) throw error;
      setEntries(prev => prev.map(e => e.id === clockedIn.id ? { ...e, clock_out: now } : e));
      const dur = hoursMinsBetween(clockedIn.clock_in, now);
      toast.success(`Clocked out — ${dur.display} today`);
      setClockedIn(null);
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleEditSave = async () => {
    try {
      const { error } = await supabase.from('video_timesheets')
        .update({
          clock_in: editForm.clock_in,
          clock_out: editForm.clock_out,
          break_minutes: parseInt(editForm.break_minutes) || 0,
          note: editForm.note || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingId);
      if (error) throw error;
      setEntries(prev => prev.map(e => e.id === editingId ? { ...e, ...editForm, break_minutes: parseInt(editForm.break_minutes) || 0 } : e));
      setEditingId(null);
      toast.success('Entry updated');
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this timesheet entry?')) return;
    const { error } = await supabase.from('video_timesheets').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    setEntries(prev => prev.filter(e => e.id !== id));
    if (clockedIn?.id === id) setClockedIn(null);
    toast.success('Deleted');
  };

  const handleExportPdf = () => {
    if (!weekEntries.length) return toast.error('No entries this week');
    const ws = weekLabel(showWeek);

    const rows = weekEntries.map(e => {
      const dur = hoursMinsBetween(e.clock_in, e.clock_out);
      const breakMins = e.break_minutes || 0;
      const netHrs = +(dur.decimal - breakMins / 60).toFixed(2);
      return { date: formatDate(e.clock_in), in: formatTime(e.clock_in), out: formatTime(e.clock_out), break: breakMins, gross: dur.display, net: netHrs, note: e.note || '' };
    });

    const invoice = `
╔══════════════════════════════════════════════════╗
║                 TIMESHEET INVOICE                ║
╚══════════════════════════════════════════════════╝

To: ${COMPANY}
From: ${STAFF_NAME} — Creative Director (Video)
Period: ${ws}
Generated: ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}

${'─'.repeat(50)}
${'Day'.padEnd(16)} ${'In'.padEnd(10)} ${'Out'.padEnd(10)} ${'Break'.padEnd(7)} ${'Net Hrs'.padEnd(8)} Notes
${'─'.repeat(50)}
${rows.map(r => `${r.date.padEnd(16)} ${r.in.padEnd(10)} ${r.out.padEnd(10)} ${(r.break + 'm').padEnd(7)} ${(r.net + 'h').padEnd(8)} ${r.note}`).join('\n')}
${'─'.repeat(50)}

TOTAL HOURS: ${weekTotal.display} (${weekTotal.decimal} decimal hours)

${'─'.repeat(50)}
Signed: ________________________     Date: ________

${STAFF_NAME}
Creative Director — Video
${COMPANY}
`.trim();

    const blob = new Blob([invoice], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Timesheet-${STAFF_NAME}-${ws.replace(/[^a-zA-Z0-9]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Invoice downloaded');
  };

  // ── PIN Screen ──
  if (!authenticated) {
    return (
      <div className="h-full flex items-center justify-center bg-[#1a1a1a]">
        <form onSubmit={handlePinSubmit} className="bg-white rounded-2xl p-8 w-80 text-center shadow-2xl">
          <div className="text-4xl mb-3">⏱️</div>
          <h2 className="text-lg font-bold text-[#1a1a1a] mb-1">Video Timesheet</h2>
          <p className="text-[11px] text-gray-400 mb-5">Enter your 4-digit PIN to continue</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="• • • •"
            autoFocus
            className="w-full text-center text-2xl tracking-[0.5em] font-bold border-2 border-gray-200 rounded-xl px-4 py-3 bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518] mb-4"
          />
          <button type="submit" disabled={pin.length < 4}
            className="w-full bg-[#F5C518] text-[#1a1a1a] border-none rounded-xl py-3 text-sm font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-30">
            Unlock
          </button>
        </form>
      </div>
    );
  }

  // ── Main Timesheet ──
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="bg-white border-b border-gray-200 px-5 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#1a1a1a]">⏱️ Timesheet — {STAFF_NAME}</h1>
            <p className="text-[11px] text-gray-400">Creative Director · Video</p>
          </div>
          <div className="flex items-center gap-3">
            {clockedIn ? (
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-[11px] text-green-700 font-semibold">
                  Clocked in since {formatTime(clockedIn.clock_in)}
                </span>
                <button onClick={handleClockOut}
                  className="bg-red-500 text-white border-none rounded-lg px-4 py-2 text-[11px] font-bold cursor-pointer hover:bg-red-600">
                  🔴 Clock Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input value={note} onChange={e => setNote(e.target.value)}
                  placeholder="What are you working on today?"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-[11px] bg-[#f8f8f6] w-64" />
                <button onClick={handleClockIn}
                  className="bg-green-600 text-white border-none rounded-lg px-4 py-2 text-[11px] font-bold cursor-pointer hover:bg-green-700">
                  🟢 Clock In
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-4xl mx-auto">
          {/* Week selector + stats */}
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="flex items-center gap-2">
              <select value={showWeek} onChange={e => setShowWeek(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-xs bg-[#f8f8f6] font-semibold">
                {availableWeeks.map(w => (
                  <option key={w} value={w}>{weekLabel(w)}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-[9px] font-bold uppercase text-gray-400">Week Total</div>
                <div className="text-xl font-bold text-[#1a1a1a]">{weekTotal.display}</div>
                <div className="text-[10px] text-gray-400">{weekTotal.decimal} decimal hours</div>
              </div>
              <button onClick={handleExportPdf} disabled={!weekEntries.length}
                className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-lg px-4 py-2.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-30">
                📄 Download Invoice
              </button>
            </div>
          </div>

          {/* Today's status banner */}
          {clockedIn && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>
                <div>
                  <div className="text-[12px] font-bold text-green-800">Currently Working</div>
                  <div className="text-[11px] text-green-600">
                    Clocked in at {formatTime(clockedIn.clock_in)}
                    {clockedIn.note && <span className="text-gray-500 ml-2">— {clockedIn.note}</span>}
                  </div>
                </div>
              </div>
              <div className="text-lg font-bold text-green-700">
                {hoursMinsBetween(clockedIn.clock_in, new Date().toISOString()).display}
              </div>
            </div>
          )}

          {/* Weekly entries table */}
          {loading ? (
            <div className="text-center py-10 text-gray-400">Loading...</div>
          ) : weekEntries.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-3xl mb-2 opacity-30">⏱️</div>
              <div className="text-sm text-gray-500">No completed entries this week</div>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-[#f8f8f6] border-b border-gray-200 text-left text-gray-500">
                    <th className="px-4 py-2.5 font-semibold">Day</th>
                    <th className="px-3 py-2.5 font-semibold">Clock In</th>
                    <th className="px-3 py-2.5 font-semibold">Clock Out</th>
                    <th className="px-3 py-2.5 font-semibold">Break</th>
                    <th className="px-3 py-2.5 font-semibold">Net Hours</th>
                    <th className="px-3 py-2.5 font-semibold">Notes</th>
                    <th className="px-3 py-2.5 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {weekEntries.map(entry => {
                    const dur = hoursMinsBetween(entry.clock_in, entry.clock_out);
                    const breakMins = entry.break_minutes || 0;
                    const netHrs = +(dur.decimal - breakMins / 60).toFixed(2);
                    const isEditing = editingId === entry.id;

                    if (isEditing) {
                      return (
                        <tr key={entry.id} className="border-b border-gray-100 bg-[#F5C518]/5">
                          <td className="px-4 py-2">{formatDate(entry.clock_in)}</td>
                          <td className="px-3 py-2"><input type="datetime-local" value={editForm.clock_in?.slice(0, 16)} onChange={e => setEditForm(f => ({ ...f, clock_in: e.target.value + ':00.000Z' }))} className="border border-gray-200 rounded px-1.5 py-1 text-[11px] w-40" /></td>
                          <td className="px-3 py-2"><input type="datetime-local" value={editForm.clock_out?.slice(0, 16)} onChange={e => setEditForm(f => ({ ...f, clock_out: e.target.value + ':00.000Z' }))} className="border border-gray-200 rounded px-1.5 py-1 text-[11px] w-40" /></td>
                          <td className="px-3 py-2"><input type="number" value={editForm.break_minutes || 0} onChange={e => setEditForm(f => ({ ...f, break_minutes: e.target.value }))} className="border border-gray-200 rounded px-1.5 py-1 text-[11px] w-16" /></td>
                          <td className="px-3 py-2">—</td>
                          <td className="px-3 py-2"><input value={editForm.note || ''} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} className="border border-gray-200 rounded px-1.5 py-1 text-[11px] w-full" /></td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <button onClick={handleEditSave} className="text-[10px] text-green-600 font-bold bg-transparent border-none cursor-pointer mr-1">Save</button>
                            <button onClick={() => setEditingId(null)} className="text-[10px] text-gray-400 bg-transparent border-none cursor-pointer">Cancel</button>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={entry.id} className="border-b border-gray-100 hover:bg-[#f8f8f6]">
                        <td className="px-4 py-2.5 font-semibold text-[#1a1a1a]">{formatDate(entry.clock_in)}</td>
                        <td className="px-3 py-2.5 text-gray-700">{formatTime(entry.clock_in)}</td>
                        <td className="px-3 py-2.5 text-gray-700">{formatTime(entry.clock_out)}</td>
                        <td className="px-3 py-2.5 text-gray-500">{breakMins > 0 ? `${breakMins}m` : '—'}</td>
                        <td className="px-3 py-2.5 font-bold text-[#1a1a1a]">{netHrs}h</td>
                        <td className="px-3 py-2.5 text-gray-500 text-[11px] max-w-[200px] truncate">{entry.note || '—'}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <button onClick={() => { setEditingId(entry.id); setEditForm({ clock_in: entry.clock_in, clock_out: entry.clock_out, break_minutes: entry.break_minutes || 0, note: entry.note || '' }); }}
                            className="text-[10px] text-gray-400 hover:text-[#F5C518] bg-transparent border-none cursor-pointer mr-1">✏️</button>
                          <button onClick={() => handleDelete(entry.id)}
                            className="text-[10px] text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer">🗑</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#f8f8f6] border-t border-gray-200">
                    <td colSpan={4} className="px-4 py-2.5 text-right text-[11px] font-bold text-gray-500 uppercase">Week Total</td>
                    <td className="px-3 py-2.5 font-bold text-[#1a1a1a] text-[13px]">{weekTotal.decimal}h</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Quick add manual entry */}
          <div className="mt-4 text-center">
            <button
              onClick={() => {
                const now = new Date();
                const today9am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0).toISOString();
                const today5pm = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0).toISOString();
                setEditingId('new');
                setEditForm({ clock_in: today9am, clock_out: today5pm, break_minutes: 30, note: '' });
              }}
              className="text-[11px] text-gray-400 hover:text-[#F5C518] bg-transparent border-none cursor-pointer"
            >
              + Add manual entry (for days missed)
            </button>

            {editingId === 'new' && (
              <div className="mt-3 bg-white border border-[#F5C518] rounded-xl p-4 text-left max-w-lg mx-auto">
                <div className="text-[10px] font-bold uppercase text-[#F5C518] mb-2">Add Manual Entry</div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">Clock In</label>
                    <input type="datetime-local" value={editForm.clock_in?.slice(0, 16)}
                      onChange={e => setEditForm(f => ({ ...f, clock_in: new Date(e.target.value).toISOString() }))}
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-[#f8f8f6]" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">Clock Out</label>
                    <input type="datetime-local" value={editForm.clock_out?.slice(0, 16)}
                      onChange={e => setEditForm(f => ({ ...f, clock_out: new Date(e.target.value).toISOString() }))}
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-[#f8f8f6]" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">Break (mins)</label>
                    <input type="number" value={editForm.break_minutes || 0}
                      onChange={e => setEditForm(f => ({ ...f, break_minutes: e.target.value }))}
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-[#f8f8f6]" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">Notes</label>
                    <input value={editForm.note || ''}
                      onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
                      placeholder="What you worked on"
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-[#f8f8f6]" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={async () => {
                    try {
                      const { data, error } = await supabase.from('video_timesheets').insert({
                        staff_name: STAFF_NAME,
                        clock_in: editForm.clock_in,
                        clock_out: editForm.clock_out,
                        break_minutes: parseInt(editForm.break_minutes) || 0,
                        note: editForm.note || null,
                      }).select().single();
                      if (error) throw error;
                      setEntries(prev => [data, ...prev]);
                      setEditingId(null);
                      toast.success('Entry added');
                    } catch (err) { toast.error(err.message); }
                  }}
                    className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-4 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800]">
                    Add Entry
                  </button>
                  <button onClick={() => setEditingId(null)}
                    className="bg-transparent border border-gray-300 text-gray-600 rounded px-4 py-1.5 text-[11px] cursor-pointer">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
