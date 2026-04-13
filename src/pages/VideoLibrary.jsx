import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const PLATFORMS = ['Facebook', 'Instagram', 'YouTube', 'TikTok', 'LinkedIn', 'Google Ads'];
const ASPECT_RATIOS = ['9:16 (Vertical)', '16:9 (Landscape)', '1:1 (Square)', '4:5 (Portrait)'];
const STATUSES = ['approved', 'revision', 'concept'];
const STATUS_COLORS = {
  approved: 'bg-green-50 text-green-700 border-green-200',
  revision: 'bg-orange-50 text-orange-700 border-orange-200',
  concept: 'bg-gray-100 text-gray-600 border-gray-200',
};
const STATUS_LABELS = { approved: 'Approved', revision: 'Needs Revision', concept: 'Concept' };

export default function VideoLibrary() {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [brandVoice, setBrandVoice] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [filterBucket, setFilterBucket] = useState('all');
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Load clients
  useEffect(() => {
    supabase.from('clients').select('id, name').order('name').then(({ data }) => {
      setClients(data || []);
    });
  }, []);

  // Load brand voice when client changes — pull target buckets from services
  useEffect(() => {
    if (!selectedClient) { setBrandVoice(null); return; }
    supabase.from('client_brand_voice')
      .select('services, target_personas, tone, key_selling_points')
      .eq('client_name', selectedClient)
      .single()
      .then(({ data }) => setBrandVoice(data || null));
  }, [selectedClient]);

  // Load videos for selected client
  useEffect(() => {
    if (!selectedClient) { setVideos([]); return; }
    setLoading(true);
    supabase.from('video_library')
      .select('*')
      .eq('client_name', selectedClient)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          // Table might not exist yet — create it
          if (error.code === '42P01' || error.message?.includes('does not exist')) {
            setVideos([]);
          } else {
            console.error(error);
          }
        } else {
          setVideos(data || []);
        }
        setLoading(false);
      });
  }, [selectedClient]);

  // Target buckets from brand voice services
  const targetBuckets = useMemo(() => {
    if (!brandVoice?.services) return [];
    return brandVoice.services
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
  }, [brandVoice]);

  // Filtered videos
  const filteredVideos = useMemo(() => {
    let result = videos;
    if (filterBucket !== 'all') {
      result = result.filter(v => v.target_bucket === filterBucket);
    }
    if (filterPlatform !== 'all') {
      result = result.filter(v => v.platform === filterPlatform);
    }
    if (filterStatus !== 'all') {
      result = result.filter(v => v.status === filterStatus);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(v =>
        (v.title || '').toLowerCase().includes(q) ||
        (v.description || '').toLowerCase().includes(q) ||
        (v.notes || '').toLowerCase().includes(q) ||
        (v.tags || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [videos, filterBucket, filterPlatform, filterStatus, searchQuery]);

  // Group videos by target bucket
  const groupedByBucket = useMemo(() => {
    const groups = {};
    filteredVideos.forEach(v => {
      const bucket = v.target_bucket || 'Uncategorised';
      if (!groups[bucket]) groups[bucket] = [];
      groups[bucket].push(v);
    });
    return groups;
  }, [filteredVideos]);

  const handleSaveVideo = async (formData) => {
    const payload = {
      ...formData,
      client_name: selectedClient,
      updated_at: new Date().toISOString(),
    };

    try {
      if (editingId) {
        const { error } = await supabase.from('video_library')
          .update(payload).eq('id', editingId);
        if (error) throw error;
        setVideos(prev => prev.map(v => v.id === editingId ? { ...v, ...payload } : v));
        toast.success('Video updated');
      } else {
        payload.created_at = new Date().toISOString();
        const { data, error } = await supabase.from('video_library')
          .insert(payload).select().single();
        if (error) throw error;
        setVideos(prev => [data, ...prev]);
        toast.success('Video added');
      }
    } catch (err) {
      toast.error('Save error: ' + err.message);
    }
    setShowAddForm(false);
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this video entry?')) return;
    const { error } = await supabase.from('video_library').delete().eq('id', id);
    if (error) {
      toast.error('Delete error: ' + error.message);
    } else {
      setVideos(prev => prev.filter(v => v.id !== id));
      toast.success('Deleted');
    }
  };

  const handleDuplicate = (video) => {
    setEditingId(null);
    setShowAddForm({
      ...video,
      id: undefined,
      title: `${video.title} (copy)`,
      status: 'concept',
      created_at: undefined,
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-[#1a1a1a] leading-tight">🎬 Video Library</h1>
            <p className="text-[11px] text-gray-400">Browse past approved video ads by client and target service</p>
          </div>

          {/* Client selector */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold uppercase text-gray-400">Client:</label>
            <select
              value={selectedClient}
              onChange={(e) => { setSelectedClient(e.target.value); setFilterBucket('all'); }}
              className="border border-gray-200 rounded px-2.5 py-1.5 text-xs bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518] min-w-[180px]"
            >
              <option value="">Select a client...</option>
              {clients.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!selectedClient ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3">🎬</div>
            <div className="text-sm text-gray-500">Select a client to view their video library</div>
            <div className="text-[11px] text-gray-400 mt-1">Target service buckets are pulled from the client's Brand Voice profile</div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5">
          {/* Brand Voice summary + controls */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 mb-4">
            {/* Filters + add */}
            <div className="bg-white border border-gray-200 rounded-lg p-3.5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-bold uppercase text-gray-400">
                  {filteredVideos.length} video{filteredVideos.length !== 1 ? 's' : ''}
                  {filterBucket !== 'all' && ` in "${filterBucket}"`}
                </div>
                <button
                  onClick={() => { setShowAddForm(true); setEditingId(null); }}
                  className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800]"
                >
                  + Add Video
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {/* Target bucket filter */}
                <select
                  value={filterBucket}
                  onChange={(e) => setFilterBucket(e.target.value)}
                  className="border border-gray-200 rounded px-2 py-1 text-[11px] bg-[#f8f8f6]"
                >
                  <option value="all">All Target Buckets</option>
                  {targetBuckets.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                  <option value="Uncategorised">Uncategorised</option>
                </select>

                <select
                  value={filterPlatform}
                  onChange={(e) => setFilterPlatform(e.target.value)}
                  className="border border-gray-200 rounded px-2 py-1 text-[11px] bg-[#f8f8f6]"
                >
                  <option value="all">All Platforms</option>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="border border-gray-200 rounded px-2 py-1 text-[11px] bg-[#f8f8f6]"
                >
                  <option value="all">All Statuses</option>
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>

                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search videos..."
                  className="border border-gray-200 rounded px-2 py-1 text-[11px] bg-[#f8f8f6] flex-1 min-w-[140px]"
                />
              </div>
            </div>

            {/* Brand voice summary card */}
            <div className="bg-white border border-gray-200 rounded-lg p-3.5">
              <div className="text-[10px] font-bold uppercase text-gray-400 mb-2">
                Brand Voice · {selectedClient}
              </div>
              {brandVoice ? (
                <div className="space-y-2">
                  {brandVoice.tone && (
                    <div>
                      <div className="text-[9px] font-bold uppercase text-gray-400">Tone</div>
                      <div className="text-[11px] text-gray-700 leading-snug">{brandVoice.tone}</div>
                    </div>
                  )}
                  {targetBuckets.length > 0 && (
                    <div>
                      <div className="text-[9px] font-bold uppercase text-gray-400">Target Services</div>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {targetBuckets.map((b, i) => (
                          <span
                            key={i}
                            onClick={() => setFilterBucket(filterBucket === b ? 'all' : b)}
                            className={`text-[10px] px-1.5 py-0.5 rounded-full border cursor-pointer transition-colors ${
                              filterBucket === b
                                ? 'bg-[#F5C518] text-[#1a1a1a] border-[#F5C518] font-bold'
                                : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#F5C518]'
                            }`}
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {brandVoice.key_selling_points && (
                    <div>
                      <div className="text-[9px] font-bold uppercase text-gray-400">Key USPs</div>
                      <div className="text-[10px] text-gray-500 leading-snug">{brandVoice.key_selling_points}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-gray-400 italic">
                  No Brand Voice set up for this client.
                  <a href="/virtual-office/brand-voice" className="text-[#F5C518] ml-1 font-semibold">
                    Set up now
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Add / Edit form */}
          {showAddForm && (
            <VideoForm
              initial={typeof showAddForm === 'object' ? showAddForm : null}
              targetBuckets={targetBuckets}
              onSave={handleSaveVideo}
              onCancel={() => { setShowAddForm(false); setEditingId(null); }}
              brandVoice={brandVoice}
            />
          )}

          {/* Video list grouped by bucket */}
          {loading ? (
            <div className="text-center text-gray-400 py-10">Loading videos...</div>
          ) : filteredVideos.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-3xl mb-2">📭</div>
              <div className="text-sm text-gray-500">No videos yet for {selectedClient}</div>
              <div className="text-[11px] text-gray-400 mt-1">
                Add past approved video ads so the team can reference them
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedByBucket).map(([bucket, bucketVideos]) => (
                <div key={bucket}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{bucket}</div>
                    <div className="flex-1 h-px bg-gray-200"></div>
                    <div className="text-[10px] text-gray-400">{bucketVideos.length} video{bucketVideos.length !== 1 ? 's' : ''}</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {bucketVideos.map(video => (
                      <VideoCard
                        key={video.id}
                        video={video}
                        onEdit={() => {
                          setEditingId(video.id);
                          setShowAddForm(video);
                        }}
                        onDelete={() => handleDelete(video.id)}
                        onDuplicate={() => handleDuplicate(video)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Video Card ──
function VideoCard({ video, onEdit, onDelete, onDuplicate }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold text-[#1a1a1a] leading-snug truncate">{video.title || 'Untitled'}</div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${STATUS_COLORS[video.status] || STATUS_COLORS.concept}`}>
                {STATUS_LABELS[video.status] || video.status}
              </span>
              {video.platform && (
                <span className="text-[9px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">{video.platform}</span>
              )}
              {video.aspect_ratio && (
                <span className="text-[9px] text-gray-400">{video.aspect_ratio}</span>
              )}
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={onDuplicate} className="text-[10px] text-gray-400 hover:text-blue-600 bg-transparent border-none cursor-pointer p-0.5" title="Duplicate as new concept">📋</button>
            <button onClick={onEdit} className="text-[10px] text-gray-400 hover:text-[#F5C518] bg-transparent border-none cursor-pointer p-0.5" title="Edit">✏️</button>
            <button onClick={onDelete} className="text-[10px] text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer p-0.5" title="Delete">🗑</button>
          </div>
        </div>

        {video.description && (
          <div className="text-[10px] text-gray-500 leading-snug mt-1 line-clamp-2">{video.description}</div>
        )}

        {/* Duration + date */}
        <div className="flex items-center gap-3 mt-2 text-[9px] text-gray-400">
          {video.duration && <span>⏱ {video.duration}</span>}
          {video.approval_date && <span>✓ {new Date(video.approval_date).toLocaleDateString('en-AU')}</span>}
          {video.video_url && (
            <a href={video.video_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
              🔗 View
            </a>
          )}
        </div>

        {/* Tags */}
        {video.tags && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {video.tags.split(',').map((tag, i) => (
              <span key={i} className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{tag.trim()}</span>
            ))}
          </div>
        )}
      </div>

      {/* Expandable notes section */}
      {video.notes && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full text-left px-3 py-1.5 text-[10px] font-semibold text-gray-400 bg-[#fafafa] hover:bg-gray-100 border-none cursor-pointer flex items-center gap-1"
          >
            {expanded ? '▾' : '▸'} Editor Notes
          </button>
          {expanded && (
            <div className="px-3 pb-3 text-[10px] text-gray-600 leading-relaxed whitespace-pre-wrap bg-[#fafafa]">
              {video.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add / Edit Form ──
function VideoForm({ initial, targetBuckets, onSave, onCancel, brandVoice }) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    description: initial?.description || '',
    target_bucket: initial?.target_bucket || (targetBuckets[0] || ''),
    platform: initial?.platform || 'Facebook',
    aspect_ratio: initial?.aspect_ratio || '9:16 (Vertical)',
    duration: initial?.duration || '',
    status: initial?.status || 'approved',
    video_url: initial?.video_url || '',
    approval_date: initial?.approval_date || new Date().toISOString().split('T')[0],
    tags: initial?.tags || '',
    notes: initial?.notes || '',
    hook: initial?.hook || '',
    cta: initial?.cta || '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    onSave(form);
  };

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-[#F5C518] rounded-lg p-4 mb-4">
      <div className="text-[11px] font-bold uppercase text-[#F5C518] mb-3">
        {initial?.id ? 'Edit Video' : 'Add Past Video'}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Title</label>
          <input value={form.title} onChange={set('title')} required
            placeholder="e.g. Spring Campaign - Property Appraisal 30s"
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6]" />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Target Service Bucket</label>
          <select value={form.target_bucket} onChange={set('target_bucket')}
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6]">
            {targetBuckets.map(b => <option key={b} value={b}>{b}</option>)}
            <option value="">Other / Uncategorised</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Platform</label>
          <select value={form.platform} onChange={set('platform')}
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6]">
            {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Aspect Ratio</label>
          <select value={form.aspect_ratio} onChange={set('aspect_ratio')}
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6]">
            {ASPECT_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Duration</label>
          <input value={form.duration} onChange={set('duration')} placeholder="e.g. 30s, 60s, 15s"
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6]" />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Status</label>
          <select value={form.status} onChange={set('status')}
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6]">
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Video URL / Drive Link</label>
          <input value={form.video_url} onChange={set('video_url')} placeholder="Paste link to the video file..."
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6]" />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Approval Date</label>
          <input type="date" value={form.approval_date} onChange={set('approval_date')}
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6]" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Hook (opening line / first 3s)</label>
          <input value={form.hook} onChange={set('hook')} placeholder="What grabs attention in the first 3 seconds?"
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6]" />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">CTA (call to action)</label>
          <input value={form.cta} onChange={set('cta')} placeholder="e.g. Book a free appraisal today"
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6]" />
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Description / Brief</label>
        <textarea value={form.description} onChange={set('description')} rows={2}
          placeholder="Short description of what this video covers..."
          className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6] resize-y" />
      </div>

      <div className="mb-3">
        <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">
          Editor Notes <span className="font-normal normal-case text-gray-400">— what worked, what to reuse, editing tips</span>
        </label>
        <textarea value={form.notes} onChange={set('notes')} rows={3}
          placeholder="e.g. The testimonial hook outperformed the B-roll opener by 2x. Use the same colour grading as the Q4 campaign..."
          className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6] resize-y" />
      </div>

      <div className="mb-3">
        <label className="block text-[10px] font-bold uppercase text-gray-400 mb-0.5">Tags (comma-separated)</label>
        <input value={form.tags} onChange={set('tags')} placeholder="testimonial, property, 30s, spring campaign"
          className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-[#f8f8f6]" />
      </div>

      <div className="flex gap-2">
        <button type="submit"
          className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-4 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800]">
          {initial?.id ? 'Save Changes' : 'Add Video'}
        </button>
        <button type="button" onClick={onCancel}
          className="bg-transparent border border-gray-300 text-gray-600 rounded px-4 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-gray-400">
          Cancel
        </button>
      </div>
    </form>
  );
}
