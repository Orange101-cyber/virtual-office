import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getClientContext, getClientActivity, getClientStats } from '../lib/clientContext';
import toast from 'react-hot-toast';

function StatCard({ label, value, sub, color = '#1a1a1a', link }) {
  const Wrap = link ? Link : 'div';
  return (
    <Wrap to={link} className={`bg-white border border-gray-200 rounded-xl p-4 no-underline ${link ? 'hover:border-[#F5C518] cursor-pointer' : ''} transition-colors`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </Wrap>
  );
}

// Per-client blog design reference — upload PDFs of how the client's current
// blog looks, stored so we have that "memory" for previews and layout matching.
function BlogReference({ clientName }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const slug = clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const load = async () => {
    const { data } = await supabase.from('client_blog_reference')
      .select('*').eq('client_name', clientName).order('uploaded_at', { ascending: false });
    setFiles(data || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clientName]);

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf') return toast.error('Please upload a PDF');
    setBusy(true);
    try {
      const path = `${slug}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: upErr } = await supabase.storage.from('client-blogs').upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('client-blogs').getPublicUrl(path);
      const { error: insErr } = await supabase.from('client_blog_reference').insert({
        client_name: clientName, file_name: file.name, path, url: pub.publicUrl,
      });
      if (insErr) throw insErr;
      toast.success('Blog reference uploaded');
      load();
    } catch (err) { toast.error('Upload failed: ' + err.message); }
    setBusy(false);
  };

  const remove = async (f) => {
    if (!confirm(`Remove "${f.file_name}"?`)) return;
    await supabase.storage.from('client-blogs').remove([f.path]).catch(() => {});
    await supabase.from('client_blog_reference').delete().eq('id', f.id);
    load();
  };

  return (
    <div>
      <p className="text-[11px] text-gray-400 mb-2">Upload a PDF of how this client's blog currently looks, so we can match their style in previews.</p>
      <div className="space-y-2 mb-3">
        {files.length === 0 ? (
          <div className="text-[11px] text-gray-300">No blog references yet.</div>
        ) : files.map(f => (
          <div key={f.id} className="flex items-center gap-2 p-2 bg-[#f8f8f6] rounded-lg">
            <span className="text-[14px]">📄</span>
            <a href={f.url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 no-underline truncate flex-1">{f.file_name}</a>
            <span className="text-[9px] text-gray-400">{f.uploaded_at ? new Date(f.uploaded_at).toLocaleDateString('en-AU') : ''}</span>
            <button onClick={() => remove(f)} className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer text-[12px]">×</button>
          </div>
        ))}
      </div>
      <label className={`inline-block text-[11px] font-bold rounded px-3 py-1.5 cursor-pointer ${busy ? 'bg-gray-200 text-gray-400' : 'bg-[#F5C518] text-[#1a1a1a] hover:bg-[#e6b800]'}`}>
        {busy ? 'Uploading…' : '⬆ Upload blog PDF'}
        <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={busy} onChange={onUpload} />
      </label>
    </div>
  );
}

function Section({ title, children, action }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function timeAgo(dateStr) {
  const date = new Date(dateStr);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

export default function ClientHub() {
  const { clientName } = useParams();
  const [context, setContext] = useState(null);
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recentContent, setRecentContent] = useState([]);
  const [recentAds, setRecentAds] = useState([]);
  const [recentImages, setRecentImages] = useState([]);
  const [allClients, setAllClients] = useState([]);

  useEffect(() => {
    supabase.from('clients').select('name').order('name')
      .then(({ data }) => setAllClients((data || []).map(c => c.name)));
  }, []);

  useEffect(() => {
    if (!clientName) return;
    setLoading(true);

    const load = async () => {
      const ctx = await getClientContext(clientName);
      setContext(ctx);
      const s = await getClientStats(clientName, ctx?.clientId);
      setStats(s);
      const act = await getClientActivity(clientName, ctx?.clientId, 15);
      setActivity(act);

      // Recent content (briefs + plans)
      const { data: plans } = await supabase.from('content_plans')
        .select('*').eq('client_name', clientName)
        .order('updated_at', { ascending: false }).limit(5);
      setRecentContent(plans || []);

      // Recent ad copy
      const { data: ads } = await supabase.from('ad_copy')
        .select('*').eq('client_name', clientName)
        .order('created_at', { ascending: false }).limit(5);
      setRecentAds(ads || []);

      // Recent images
      const { data: images } = await supabase.from('ad_generated_images')
        .select('*').eq('client_name', clientName)
        .order('created_at', { ascending: false }).limit(6);
      setRecentImages(images || []);

      setLoading(false);
    };
    load();
  }, [clientName]);

  if (loading) {
    return <div className="h-full flex items-center justify-center text-sm text-gray-400">Loading client hub...</div>;
  }

  const ctxFields = [
    { key: 'businessDescription', label: 'Business', icon: '🏢' },
    { key: 'services', label: 'Services', icon: '🛠️' },
    { key: 'locations', label: 'Locations', icon: '📍' },
    { key: 'targetPersonas', label: 'Target Personas', icon: '👥' },
    { key: 'differentiators', label: 'Differentiators', icon: '⭐' },
    { key: 'competitors', label: 'Competitors', icon: '⚔️' },
  ];

  const profileComplete = ctxFields.filter(f => context?.[f.key]).length;
  const profileTotal = ctxFields.length;
  const profilePct = Math.round((profileComplete / profileTotal) * 100);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link to="/" className="text-[11px] text-gray-400 hover:text-[#F5C518] no-underline">← Dashboard</Link>
            <h1 className="text-2xl font-bold text-[#1a1a1a] mt-1">{clientName}</h1>
            {context?.website && <a href={context.website} target="_blank" rel="noreferrer" className="text-[11px] text-blue-500 no-underline hover:underline">{context.website}</a>}
          </div>
          <div className="flex items-center gap-2">
            <select value={clientName} onChange={e => window.location.href = `/virtual-office/client/${encodeURIComponent(e.target.value)}`}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-[#F5C518]">
              {allClients.map(c => <option key={c}>{c}</option>)}
            </select>
            <Link to="/brand-voice" className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-lg px-4 py-1.5 text-xs font-bold no-underline hover:bg-[#e6b800]">
              Edit Profile
            </Link>
          </div>
        </div>

        {/* Profile completion warning */}
        {profilePct < 50 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-orange-700">Client profile is {profilePct}% complete</div>
                <div className="text-[10px] text-orange-600 mt-0.5">Add more details to improve AI-generated content and ads for this client</div>
              </div>
              <Link to="/brand-voice" className="text-[11px] font-bold text-orange-700 hover:underline no-underline">Complete Profile →</Link>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          <StatCard label="Articles" value={stats?.articles || 0} sub="SEO reports" link="/seo-checker" />
          <StatCard label="Avg SEO Score" value={`${stats?.avgSeoScore || 0}%`}
            color={stats?.avgSeoScore >= 85 ? '#27ae60' : stats?.avgSeoScore >= 60 ? '#e67e22' : '#e74c3c'}
            link="/seo-checker" />
          <StatCard label="Planned" value={stats?.plannedContent || 0} sub="To research" link="/content-planner" />
          <StatCard label="Briefed" value={stats?.briefed || 0} sub="Ready to write" link="/content-planner" />
          <StatCard label="Ad Copy" value={stats?.adCopyCount || 0} sub="Saved drafts" link="/ad-copy-library" />
          <StatCard label="Ad Images" value={stats?.adImages || 0} sub="AI generated" link="/ad-inspiration" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          {/* Left column */}
          <div>
            {/* Client Context */}
            <Section title="Client Context" action={<Link to="/brand-voice" className="text-[10px] text-gray-400 hover:text-[#F5C518] no-underline">Edit →</Link>}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ctxFields.map(f => (
                  <div key={f.key} className="bg-[#f8f8f6] rounded-lg p-3">
                    <div className="text-[9px] font-bold uppercase text-gray-400 mb-1 flex items-center gap-1">
                      <span>{f.icon}</span>
                      <span>{f.label}</span>
                    </div>
                    <div className="text-[11px] text-gray-700 leading-relaxed">
                      {context?.[f.key] || <span className="text-gray-300 italic">Not set</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Brand voice summary */}
              {context?.tone && (
                <div className="mt-3 bg-[#F5C518]/10 border border-[#F5C518]/30 rounded-lg p-3">
                  <div className="text-[9px] font-bold uppercase text-gray-500 mb-1">🎤 Brand Voice</div>
                  <div className="text-[11px] text-gray-700 leading-relaxed">{context.tone}</div>
                  {context.keySellingPoints && (
                    <div className="mt-2 text-[10px] text-gray-600">
                      <div className="font-semibold mb-0.5">Key USPs:</div>
                      <div className="whitespace-pre-line">{context.keySellingPoints}</div>
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* Blog design reference (PDFs) */}
            <Section title="Blog Look & Feel">
              <BlogReference clientName={clientName} />
            </Section>

            {/* Recent Content */}
            {recentContent.length > 0 && (
              <Section title="Recent Content Plans" action={<Link to="/content-planner" className="text-[10px] text-gray-400 hover:text-[#F5C518] no-underline">View all →</Link>}>
                <div className="space-y-2">
                  {recentContent.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-2 bg-[#f8f8f6] rounded-lg">
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded`}
                        style={{ background: '#F5C518/20', color: '#1a1a1a', backgroundColor: 'rgba(245,197,24,0.2)' }}>
                        {item.status}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-[#1a1a1a] truncate">{item.title}</div>
                        <div className="text-[9px] text-gray-400">{item.focus_keyword || 'No keyword'} · {item.month || 'Unassigned'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Recent Ad Copy */}
            {recentAds.length > 0 && (
              <Section title="Recent Ad Copy" action={<Link to="/ad-copy-library" className="text-[10px] text-gray-400 hover:text-[#F5C518] no-underline">View all →</Link>}>
                <div className="space-y-2">
                  {recentAds.map(ad => (
                    <div key={ad.id} className="p-2 bg-[#f8f8f6] rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-bold uppercase bg-white px-1.5 py-0.5 rounded">{ad.platform}</span>
                        <span className="text-[9px] text-gray-400">{ad.status}</span>
                      </div>
                      <div className="text-[11px] font-medium text-[#1a1a1a]">{ad.headline || '(no headline)'}</div>
                      {ad.primary_text && <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{ad.primary_text}</div>}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Recent Ad Creatives */}
            {recentImages.length > 0 && (
              <Section title="Recent Ad Creatives" action={<Link to="/ad-inspiration" className="text-[10px] text-gray-400 hover:text-[#F5C518] no-underline">Generate more →</Link>}>
                <div className="grid grid-cols-3 gap-2">
                  {recentImages.map(img => (
                    <a key={img.id} href={img.image_url} target="_blank" rel="noreferrer">
                      <img src={img.image_url} alt="" className="w-full aspect-square object-cover rounded-lg border border-gray-200 hover:border-[#F5C518]" />
                    </a>
                  ))}
                </div>
              </Section>
            )}

            {/* Quick Actions */}
            <Section title="Quick Actions">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <Link to="/keyword-research" className="bg-[#f8f8f6] hover:bg-[#F5C518]/10 rounded-lg p-3 text-center no-underline transition-colors">
                  <div className="text-xl mb-1">🔑</div>
                  <div className="text-[10px] font-semibold text-[#1a1a1a]">Keyword Research</div>
                </Link>
                <Link to="/brief-generator" className="bg-[#f8f8f6] hover:bg-[#F5C518]/10 rounded-lg p-3 text-center no-underline transition-colors">
                  <div className="text-xl mb-1">📝</div>
                  <div className="text-[10px] font-semibold text-[#1a1a1a]">New Brief</div>
                </Link>
                <Link to="/article-writer" className="bg-[#f8f8f6] hover:bg-[#F5C518]/10 rounded-lg p-3 text-center no-underline transition-colors">
                  <div className="text-xl mb-1">✍️</div>
                  <div className="text-[10px] font-semibold text-[#1a1a1a]">Write Article</div>
                </Link>
                <Link to="/ad-inspiration" className="bg-[#f8f8f6] hover:bg-[#F5C518]/10 rounded-lg p-3 text-center no-underline transition-colors">
                  <div className="text-xl mb-1">✨</div>
                  <div className="text-[10px] font-semibold text-[#1a1a1a]">Ad Inspiration</div>
                </Link>
                <Link to="/ad-creative-brief" className="bg-[#f8f8f6] hover:bg-[#F5C518]/10 rounded-lg p-3 text-center no-underline transition-colors">
                  <div className="text-xl mb-1">🎨</div>
                  <div className="text-[10px] font-semibold text-[#1a1a1a]">Creative Brief</div>
                </Link>
                <Link to="/seo-checker" className="bg-[#f8f8f6] hover:bg-[#F5C518]/10 rounded-lg p-3 text-center no-underline transition-colors">
                  <div className="text-xl mb-1">🔍</div>
                  <div className="text-[10px] font-semibold text-[#1a1a1a]">SEO Audit</div>
                </Link>
              </div>
            </Section>
          </div>

          {/* Right column: Activity Feed */}
          <div>
            <Section title="Activity Feed">
              {activity.length === 0 ? (
                <div className="text-[11px] text-gray-400 py-4 text-center">No activity yet</div>
              ) : (
                <div className="space-y-2 max-h-[700px] overflow-y-auto">
                  {activity.map((a, i) => (
                    <Link key={i} to={a.link} className="flex items-start gap-2 p-2 bg-[#f8f8f6] rounded-lg hover:bg-[#F5C518]/5 no-underline transition-colors">
                      <span className="text-base shrink-0">{a.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-[#1a1a1a] truncate">{a.title}</div>
                        <div className="text-[9px] text-gray-400">{a.subtitle}</div>
                        <div className="text-[9px] text-gray-300">{timeAgo(a.date)}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
