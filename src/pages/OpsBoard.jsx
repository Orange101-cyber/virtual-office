import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import toast from 'react-hot-toast';

const PRIORITY_LEVELS = [
  { value: 'urgent', label: 'Urgent', color: 'bg-red-500', badge: 'bg-red-50 text-red-700 border-red-200' },
  { value: 'high', label: 'High', color: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-500', badge: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  { value: 'low', label: 'Low', color: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
];

const STATUSES = [
  { value: 'new', label: 'New', color: 'bg-gray-100 text-gray-700' },
  { value: 'waiting_design', label: 'Waiting on Design', color: 'bg-purple-50 text-purple-700' },
  { value: 'in_design', label: 'In Design', color: 'bg-purple-100 text-purple-800' },
  { value: 'waiting_dev', label: 'Waiting on Dev', color: 'bg-indigo-50 text-indigo-700' },
  { value: 'in_dev', label: 'In Development', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'review', label: 'Under Review', color: 'bg-cyan-50 text-cyan-700' },
  { value: 'waiting_admin', label: 'Waiting on Admin', color: 'bg-orange-50 text-orange-700' },
  { value: 'blocked', label: 'Blocked', color: 'bg-red-50 text-red-700' },
  { value: 'complete', label: 'Complete', color: 'bg-green-50 text-green-700' },
];

const WORK_TYPES = [
  { value: 'design', label: 'Design' },
  { value: 'development', label: 'Development' },
  { value: 'design_dev', label: 'Design + Dev' },
  { value: 'content', label: 'Content' },
  { value: 'admin', label: 'Admin Only' },
  { value: 'other', label: 'Other' },
];

function getPriority(val) { return PRIORITY_LEVELS.find(p => p.value === val) || PRIORITY_LEVELS[2]; }
function getStatus(val) { return STATUSES.find(s => s.value === val) || STATUSES[0]; }
function daysAgo(dateStr) {
  if (!dateStr) return '';
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return '1 day ago';
  return `${d} days ago`;
}

export default function OpsBoard() {
  const { clients } = useClients();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [expandedCard, setExpandedCard] = useState(null);
  const [filterStatus, setFilterStatus] = useState('active'); // 'active' | 'complete' | 'all'
  const [filterPriority, setFilterPriority] = useState('all');
  const [newUpdate, setNewUpdate] = useState({});

  // Load tasks
  useEffect(() => {
    setLoading(true);
    supabase.from('ops_board')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setTasks(data || []);
        setLoading(false);
      });
  }, []);

  // Filtered + sorted tasks
  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (filterStatus === 'active') result = result.filter(t => t.status !== 'complete');
    else if (filterStatus === 'complete') result = result.filter(t => t.status === 'complete');
    if (filterPriority !== 'all') result = result.filter(t => t.priority === filterPriority);

    // Sort: urgent first, then by date
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    return result.sort((a, b) => {
      if (a.status === 'complete' && b.status !== 'complete') return 1;
      if (a.status !== 'complete' && b.status === 'complete') return -1;
      const pa = priorityOrder[a.priority] ?? 2;
      const pb = priorityOrder[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [tasks, filterStatus, filterPriority]);

  const activeCount = tasks.filter(t => t.status !== 'complete').length;
  const urgentCount = tasks.filter(t => t.priority === 'urgent' && t.status !== 'complete').length;
  const blockedCount = tasks.filter(t => t.status === 'blocked').length;
  const completedThisWeek = tasks.filter(t => {
    if (t.status !== 'complete') return false;
    const week = Date.now() - 7 * 86400000;
    return new Date(t.completed_at || t.updated_at) > week;
  }).length;

  const handleSave = async (formData) => {
    const payload = { ...formData, updated_at: new Date().toISOString() };
    try {
      if (editingId) {
        const { error } = await supabase.from('ops_board').update(payload).eq('id', editingId);
        if (error) throw error;
        setTasks(prev => prev.map(t => t.id === editingId ? { ...t, ...payload } : t));
        toast.success('Task updated');
      } else {
        payload.created_at = new Date().toISOString();
        payload.updates = JSON.stringify([{
          date: new Date().toISOString(),
          text: 'Task created',
          by: 'System',
        }]);
        const { data, error } = await supabase.from('ops_board').insert(payload).select().single();
        if (error) throw error;
        setTasks(prev => [data, ...prev]);
        toast.success('Task added');
      }
    } catch (err) {
      toast.error('Save error: ' + err.message);
    }
    setShowForm(false);
    setEditingId(null);
  };

  const handleStatusChange = async (taskId, newStatus) => {
    const extra = newStatus === 'complete' ? { completed_at: new Date().toISOString() } : {};
    const { error } = await supabase.from('ops_board')
      .update({ status: newStatus, updated_at: new Date().toISOString(), ...extra })
      .eq('id', taskId);
    if (error) { toast.error(error.message); return; }
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus, ...extra } : t));
    if (newStatus === 'complete') toast.success('Task completed!');
  };

  const handleAddUpdate = async (taskId) => {
    const text = (newUpdate[taskId] || '').trim();
    if (!text) return;
    const task = tasks.find(t => t.id === taskId);
    const existing = JSON.parse(task?.updates || '[]');
    const updated = [
      { date: new Date().toISOString(), text, by: 'Ops Manager' },
      ...existing,
    ];
    const { error } = await supabase.from('ops_board')
      .update({ updates: JSON.stringify(updated), updated_at: new Date().toISOString() })
      .eq('id', taskId);
    if (error) { toast.error(error.message); return; }
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, updates: JSON.stringify(updated) } : t));
    setNewUpdate(prev => ({ ...prev, [taskId]: '' }));
    toast.success('Update added');
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this task permanently?')) return;
    const { error } = await supabase.from('ops_board').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    setTasks(prev => prev.filter(t => t.id !== id));
    toast.success('Deleted');
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-[#1a1a1a] leading-tight">📋 Ops Board</h1>
            <p className="text-[11px] text-gray-400">Priority tasks for Ops Manager — outside normal Trello workflow</p>
          </div>
          <button
            onClick={() => { setShowForm(true); setEditingId(null); }}
            className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-4 py-2 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800]"
          >
            + Add Priority Task
          </button>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 mt-3 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#1a1a1a]"></span>
            <span className="text-gray-500"><b className="text-[#1a1a1a]">{activeCount}</b> active</span>
          </div>
          {urgentCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              <span className="text-red-600 font-bold">{urgentCount} urgent</span>
            </div>
          )}
          {blockedCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400"></span>
              <span className="text-red-500">{blockedCount} blocked</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span className="text-gray-500"><b className="text-green-600">{completedThisWeek}</b> done this week</span>
          </div>
          <div className="flex-1"></div>

          {/* Filters */}
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-[10px] bg-[#f8f8f6]">
            <option value="active">Active Tasks</option>
            <option value="complete">Completed</option>
            <option value="all">All Tasks</option>
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-[10px] bg-[#f8f8f6]">
            <option value="all">All Priorities</option>
            {PRIORITY_LEVELS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border-b border-gray-200 px-5 py-4 shrink-0">
          <TaskForm
            clients={clients}
            initial={editingId ? tasks.find(t => t.id === editingId) : null}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditingId(null); }}
          />
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="text-center text-gray-400 py-10">Loading...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-2 opacity-30">📋</div>
            <div className="text-sm text-gray-500">{filterStatus === 'active' ? 'No active tasks — nice work!' : 'No tasks found'}</div>
          </div>
        ) : (
          <div className="space-y-3 max-w-4xl mx-auto">
            {filteredTasks.map(task => {
              const priority = getPriority(task.priority);
              const status = getStatus(task.status);
              const isExpanded = expandedCard === task.id;
              const updates = JSON.parse(task.updates || '[]');
              const isComplete = task.status === 'complete';

              return (
                <div key={task.id}
                  className={`bg-white border rounded-lg overflow-hidden transition-shadow ${
                    isComplete ? 'border-green-200 opacity-60' :
                    task.status === 'blocked' ? 'border-red-300 shadow-md' :
                    task.priority === 'urgent' ? 'border-red-200 shadow-md' :
                    'border-gray-200 hover:shadow-md'
                  }`}>
                  {/* Priority strip */}
                  <div className={`h-1 ${priority.color}`}></div>

                  <div className="p-4">
                    {/* Top row */}
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={isComplete}
                        onChange={() => handleStatusChange(task.id, isComplete ? 'new' : 'complete')}
                        className="mt-1 w-4 h-4 shrink-0 cursor-pointer accent-green-600"
                      />

                      <div className="flex-1 min-w-0">
                        {/* Title row */}
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className={`text-[13px] font-bold leading-snug ${isComplete ? 'line-through text-gray-400' : 'text-[#1a1a1a]'}`}>
                            {task.title}
                          </h3>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button onClick={() => { setEditingId(task.id); setShowForm(task); }}
                              className="text-[10px] text-gray-300 hover:text-[#F5C518] bg-transparent border-none cursor-pointer">✏️</button>
                            <button onClick={() => handleDelete(task.id)}
                              className="text-[10px] text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer">🗑</button>
                          </div>
                        </div>

                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${priority.badge}`}>
                            {priority.label}
                          </span>
                          <select
                            value={task.status}
                            onChange={(e) => handleStatusChange(task.id, e.target.value)}
                            className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border-none cursor-pointer ${status.color}`}
                          >
                            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                          {task.work_type && (
                            <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              {WORK_TYPES.find(w => w.value === task.work_type)?.label || task.work_type}
                            </span>
                          )}
                          {task.client_name && (
                            <span className="text-[9px] bg-[#F5C518]/20 text-[#1a1a1a] font-semibold px-1.5 py-0.5 rounded">
                              {task.client_name}
                            </span>
                          )}
                          {task.due_date && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                              new Date(task.due_date) < new Date() && !isComplete
                                ? 'bg-red-50 text-red-600 font-bold' : 'text-gray-400'
                            }`}>
                              Due: {new Date(task.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </div>

                        {/* Description */}
                        {task.description && (
                          <div className="text-[11px] text-gray-500 leading-relaxed mb-2">{task.description}</div>
                        )}

                        {/* Links */}
                        {(task.trello_url || task.airtable_url) && (
                          <div className="flex gap-3 mb-2 text-[10px]">
                            {task.trello_url && (
                              <a href={task.trello_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">🔗 Trello Card</a>
                            )}
                            {task.airtable_url && (
                              <a href={task.airtable_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">📊 Airtable</a>
                            )}
                          </div>
                        )}

                        {/* Footer: date + expand */}
                        <div className="flex items-center justify-between text-[9px] text-gray-400">
                          <span>Added {daysAgo(task.created_at)}{task.completed_at ? ` · Completed ${daysAgo(task.completed_at)}` : ''}</span>
                          <button
                            onClick={() => setExpandedCard(isExpanded ? null : task.id)}
                            className="text-[10px] text-gray-400 hover:text-[#1a1a1a] bg-transparent border-none cursor-pointer flex items-center gap-1"
                          >
                            {isExpanded ? '▾' : '▸'} Updates ({updates.length})
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded: update log */}
                    {isExpanded && (
                      <div className="mt-3 ml-7 pt-3 border-t border-gray-100">
                        {/* Add update */}
                        <div className="flex gap-2 mb-3">
                          <input
                            type="text"
                            value={newUpdate[task.id] || ''}
                            onChange={(e) => setNewUpdate(prev => ({ ...prev, [task.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddUpdate(task.id)}
                            placeholder="Add an update..."
                            className="flex-1 border border-gray-200 rounded px-2.5 py-1.5 text-[11px] bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518]"
                          />
                          <button
                            onClick={() => handleAddUpdate(task.id)}
                            disabled={!(newUpdate[task.id] || '').trim()}
                            className="bg-[#1a1a1a] text-white border-none rounded px-3 py-1.5 text-[10px] font-bold cursor-pointer hover:bg-[#333] disabled:opacity-30"
                          >
                            Post
                          </button>
                        </div>

                        {/* Updates log */}
                        {updates.length === 0 ? (
                          <div className="text-[10px] text-gray-400 italic">No updates yet</div>
                        ) : (
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {updates.map((u, i) => (
                              <div key={i} className="flex gap-2 text-[10px]">
                                <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5 shrink-0"></div>
                                <div className="flex-1">
                                  <div className="text-gray-700">{u.text}</div>
                                  <div className="text-gray-400 text-[9px] mt-0.5">
                                    {u.by} · {new Date(u.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Task Form ──
function TaskForm({ clients, initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    description: initial?.description || '',
    priority: initial?.priority || 'high',
    status: initial?.status || 'new',
    work_type: initial?.work_type || 'design_dev',
    client_name: initial?.client_name || '',
    due_date: initial?.due_date || '',
    trello_url: initial?.trello_url || '',
    airtable_url: initial?.airtable_url || '',
    assigned_to: initial?.assigned_to || 'Ops Manager',
    notes: initial?.notes || '',
  });

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="text-[11px] font-bold uppercase text-[#F5C518] mb-3">
        {initial?.id ? 'Edit Task' : 'Add Priority Task'}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-3 mb-3">
        <div>
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Task Title</label>
          <input value={form.title} onChange={set('title')} required
            placeholder="e.g. Luke O'Kelly website redesign — homepage hero section"
            className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs bg-[#f8f8f6]" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Priority</label>
            <select value={form.priority} onChange={set('priority')}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6]">
              {PRIORITY_LEVELS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Work Type</label>
            <select value={form.work_type} onChange={set('work_type')}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6]">
              {WORK_TYPES.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Client</label>
            <select value={form.client_name} onChange={set('client_name')}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6]">
              <option value="">Internal / No Client</option>
              {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-3 mb-3">
        <div>
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Description</label>
          <textarea value={form.description} onChange={set('description')} rows={2}
            placeholder="What needs to happen and why it's a priority..."
            className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs bg-[#f8f8f6] resize-y" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Due Date</label>
            <input type="date" value={form.due_date} onChange={set('due_date')}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6]" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Assigned To</label>
            <input value={form.assigned_to} onChange={set('assigned_to')}
              placeholder="e.g. Ops Manager"
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6]" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Trello Link</label>
            <input value={form.trello_url} onChange={set('trello_url')} placeholder="https://trello.com/c/..."
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6]" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Airtable Link</label>
            <input value={form.airtable_url} onChange={set('airtable_url')} placeholder="https://airtable.com/..."
              className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs bg-[#f8f8f6]" />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit"
          className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-4 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800]">
          {initial?.id ? 'Save Changes' : 'Add Task'}
        </button>
        <button type="button" onClick={onCancel}
          className="bg-transparent border border-gray-300 text-gray-600 rounded px-4 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-gray-400">
          Cancel
        </button>
      </div>
    </form>
  );
}
