import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import { startBackgroundScan, onScanProgress, isScanning as isBgScanning, resumeScan, cancelScan } from '../lib/backgroundScanner';
import toast from 'react-hot-toast';

const PSI_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const ENV_PSI_KEY = import.meta.env.VITE_GOOGLE_PSI_KEY;
const THRESHOLD = 85;

function scoreColor(score) {
  if (score == null) return { bg: 'bg-gray-100', text: 'text-gray-400', ring: 'stroke-gray-300' };
  if (score >= 90) return { bg: 'bg-green-50', text: 'text-green-700', ring: 'stroke-green-500' };
  if (score >= 50) return { bg: 'bg-orange-50', text: 'text-orange-600', ring: 'stroke-orange-400' };
  return { bg: 'bg-red-50', text: 'text-red-600', ring: 'stroke-red-500' };
}

function ScoreCircle({ score, size = 40 }) {
  const colors = scoreColor(score);
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = score != null ? circ * (1 - score / 100) : circ;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth="3" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" className={colors.ring} strokeWidth="3"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <span className={`absolute text-[10px] font-bold ${colors.text}`}>{score ?? '—'}</span>
    </div>
  );
}

async function runPageSpeed(url, strategy = 'mobile', apiKey = '') {
  const keyParam = apiKey ? `&key=${apiKey}` : '';
  const apiUrl = `${PSI_API}?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&category=accessibility&category=best-practices&category=seo${keyParam}`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`PageSpeed API error ${res.status}`);
  const data = await res.json();
  const cats = data.lighthouseResult?.categories || {};
  const audits = data.lighthouseResult?.audits || {};
  return {
    performance: Math.round((cats.performance?.score || 0) * 100),
    accessibility: Math.round((cats.accessibility?.score || 0) * 100),
    bestPractices: Math.round((cats['best-practices']?.score || 0) * 100),
    seo: Math.round((cats.seo?.score || 0) * 100),
    lcp: audits['largest-contentful-paint']?.numericValue ? (audits['largest-contentful-paint'].numericValue / 1000).toFixed(1) : null,
    cls: audits['cumulative-layout-shift']?.numericValue?.toFixed(3) || null,
    fcp: audits['first-contentful-paint']?.numericValue ? (audits['first-contentful-paint'].numericValue / 1000).toFixed(1) : null,
    tbt: audits['total-blocking-time']?.numericValue ? Math.round(audits['total-blocking-time'].numericValue) : null,
    si: audits['speed-index']?.numericValue ? (audits['speed-index'].numericValue / 1000).toFixed(1) : null,
  };
}

export default function SiteHealth() {
  const { clients } = useClients();
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [psiKey, setPsiKey] = useState(ENV_PSI_KEY || '');
  const [bgProgress, setBgProgress] = useState({ current: 0, total: 0, url: '', done: false });
  const scanning = isBgScanning();
  const [showAddUrl, setShowAddUrl] = useState(false);
  const [addForm, setAddForm] = useState({ client_name: '', url: '' });
  const [filterClient, setFilterClient] = useState('all');
  const [filterIssues, setFilterIssues] = useState(false);
  const [filterTypes, setFilterTypes] = useState(new Set());

  // Load saved scans
  // Load PSI key from app_settings if not in env
  useEffect(() => {
    if (ENV_PSI_KEY) return;
    supabase.from('app_settings').select('value').eq('key', 'google_psi_key').maybeSingle()
      .then(({ data }) => { if (data?.value) setPsiKey(data.value); })
      .catch(() => {});
  }, []);

  const reloadScans = useCallback(() => {
    supabase.from('site_health').select('*').order('client_name').order('url')
      .then(({ data }) => { if (data) setScans(data); });
  }, []);

  // Resume any interrupted scan + reload when each URL finishes
  useEffect(() => {
    resumeScan();
    const unsub = onScanProgress((progress) => {
      setBgProgress(progress);
      // Reload when a URL just finished (url becomes empty after save)
      if (!progress.url || progress.done) {
        reloadScans();
      }
      if (progress.done) {
        toast.success('All scans complete');
      }
    });
    return unsub;
  }, [reloadScans]);

  useEffect(() => {
    supabase.from('site_health')
      .select('*')
      .order('client_name')
      .order('url')
      .then(({ data, error }) => {
        if (error && error.code !== '42P01') console.error(error);
        setScans(data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Check if any scan is stale (7+ days old)
  const staleDays = 7;
  const staleScans = scans.filter(s => {
    if (!s.last_scanned) return true;
    return (Date.now() - new Date(s.last_scanned).getTime()) > staleDays * 86400000;
  });

  const hasIssues = (s) => s.mobile_performance < THRESHOLD || s.mobile_accessibility < THRESHOLD || s.mobile_best_practices < THRESHOLD || s.mobile_seo < THRESHOLD;

  const PAGE_TYPES = [
    { id: 'general', label: 'General Pages', icon: '🏠' },
    { id: 'service', label: 'Service Pages', icon: '💼' },
    { id: 'landing', label: 'Landing Pages', icon: '🎯' },
    { id: 'blog', label: 'Blogs', icon: '📝' },
  ];

  const guessPageType = (url) => {
    const u = (url || '').toLowerCase();
    if (u.includes('/blog/') || u.includes('/news/') || u.includes('/article') || u.includes('-guide') || u.includes('-tips')) return 'blog';
    if (u.includes('/landing') || u.includes('/lp/') || u.includes('/offer')) return 'landing';
    if (u.includes('/service') || u.includes('/what-we-do') || u.includes('/our-') || u.match(/\/(mortgage|loan|broker|property|real-estate)/)) return 'service';
    return 'general';
  };

  const toggleType = (typeId) => {
    setFilterTypes(prev => {
      const next = new Set(prev);
      if (next.has(typeId)) next.delete(typeId);
      else next.add(typeId);
      return next;
    });
  };

  const issueCount = scans.filter(hasIssues).length;

  const filteredScans = useMemo(() => {
    let result = scans;
    if (filterClient !== 'all') result = result.filter(s => s.client_name === filterClient);
    if (filterIssues) result = result.filter(hasIssues);
    if (filterTypes.size > 0) result = result.filter(s => filterTypes.has(guessPageType(s.url)));
    return result;
  }, [scans, filterClient, filterIssues, filterTypes]);

  // Unique clients in scans
  const scanClients = [...new Set(scans.map(s => s.client_name))].sort();

  const handleAddUrl = async () => {
    if (!addForm.client_name || !addForm.url) return toast.error('Select client and enter URL');
    const url = addForm.url.trim();
    if (scans.some(s => s.url.toLowerCase() === url.toLowerCase())) return toast.error('URL already added');

    const { data, error } = await supabase.from('site_health').insert({
      client_name: addForm.client_name, url, created_at: new Date().toISOString(),
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setScans(prev => [...prev, data]);
    setAddForm({ client_name: addForm.client_name, url: '' });
    toast.success('URL added — click Scan to audit it');
  };

  const handleImportFromBucketList = async (clientName) => {
    const { data } = await supabase.from('client_pages').select('url').eq('client_name', clientName);
    if (!data?.length) return toast.error('No pages in bucket list for this client');
    const existing = new Set(scans.map(s => s.url.toLowerCase().replace(/\/$/, '')));
    const newUrls = data.map(p => p.url).filter(Boolean).filter(u => !existing.has(u.toLowerCase().replace(/\/$/, '')));
    if (!newUrls.length) return toast('All bucket list URLs already added');

    const rows = newUrls.slice(0, 10).map(u => ({ client_name: clientName, url: u, created_at: new Date().toISOString() }));
    const { data: inserted, error } = await supabase.from('site_health').insert(rows).select();
    if (error) { toast.error(error.message); return; }
    setScans(prev => [...prev, ...(inserted || [])]);
    toast.success(`Added ${rows.length} URLs from bucket list`);
  };

  const [singleScanning, setSingleScanning] = useState(null);

  const handleScanUrl = async (id) => {
    if (singleScanning === id) return;
    const scan = scans.find(s => s.id === id);
    if (!scan) return;
    setSingleScanning(id);
    try {
      const key = psiKey || '';
      const mobile = await runPageSpeed(scan.url, 'mobile', key);
      const desktop = await runPageSpeed(scan.url, 'desktop', key);
      const payload = {
        mobile_performance: mobile.performance, mobile_accessibility: mobile.accessibility,
        mobile_best_practices: mobile.bestPractices, mobile_seo: mobile.seo,
        mobile_lcp: mobile.lcp, mobile_cls: mobile.cls, mobile_fcp: mobile.fcp, mobile_tbt: mobile.tbt,
        desktop_performance: desktop.performance, desktop_accessibility: desktop.accessibility,
        desktop_best_practices: desktop.bestPractices, desktop_seo: desktop.seo,
        desktop_lcp: desktop.lcp, desktop_cls: desktop.cls,
        last_scanned: new Date().toISOString(),
      };
      const { error } = await supabase.from('site_health').update(payload).eq('id', id);
      if (error) throw error;
      setScans(prev => prev.map(s => s.id === id ? { ...s, ...payload } : s));
      toast.success(`Scanned ${scan.url}`);
    } catch (err) {
      toast.error(`Scan failed: ${err.message}`);
    }
    setSingleScanning(null);
  };

  const handleScanAll = () => {
    if (scanning) return;
    const staleMs = 7 * 86400000;
    const pool = filterClient !== 'all' ? scans.filter(s => s.client_name === filterClient) : scans;
    const toScan = pool.filter(s => {
      const isStale = !s.last_scanned || (Date.now() - new Date(s.last_scanned).getTime()) > staleMs;
      const belowThreshold = s.mobile_performance < THRESHOLD || s.mobile_accessibility < THRESHOLD || s.mobile_best_practices < THRESHOLD || s.mobile_seo < THRESHOLD;
      return isStale || belowThreshold;
    });
    if (!toScan.length) return toast('All pages are healthy and recently scanned — nothing to do');
    startBackgroundScan(toScan.map(s => s.id));
    toast(`Scanning ${toScan.length} URLs (stale or below ${THRESHOLD}) — you can leave this page`);
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this URL from monitoring?')) return;
    await supabase.from('site_health').delete().eq('id', id);
    setScans(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="bg-white border-b border-gray-200 px-5 py-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link to="/seo-tools" className="text-[10px] text-gray-400 hover:text-[#F5C518] no-underline">← SEO Tools</Link>
            <h1 className="text-lg font-bold text-[#1a1a1a] mt-1">🏥 Site Health Dashboard</h1>
            <p className="text-[11px] text-gray-400">PageSpeed Insights scores for all client sites — flag anything below {THRESHOLD}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowAddUrl(!showAddUrl)}
              className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800]">
              + Add URL
            </button>
            <button onClick={handleScanAll} disabled={!!scanning || !scans.length}
              className="bg-[#1a1a1a] text-white border-none rounded px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#333] disabled:opacity-40">
              {scanning ? `Scanning ${bgProgress.current}/${bgProgress.total}...` : '🔄 Scan All'}
            </button>
          </div>
        </div>

        {/* Background scan progress */}
        {scanning && bgProgress.total > 0 && !bgProgress.done && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mt-3 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin shrink-0"></div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-blue-700">
                Scanning {bgProgress.current}/{bgProgress.total} — you can leave this page
              </div>
              <div className="text-[10px] text-blue-500 truncate">{bgProgress.url}</div>
            </div>
            <div className="w-32 h-1.5 bg-blue-100 rounded-full overflow-hidden shrink-0">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${bgProgress.total > 0 ? (bgProgress.current / bgProgress.total) * 100 : 0}%` }}></div>
            </div>
            <button onClick={() => { cancelScan(); toast('Scan cancelled'); }}
              className="text-[10px] text-red-500 font-bold bg-transparent border border-red-300 rounded px-2 py-1 cursor-pointer hover:bg-red-50 shrink-0">
              ✕ Cancel
            </button>
          </div>
        )}

        {/* Stats + filters */}
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-[11px] bg-[#f8f8f6]">
            <option value="all">All Clients</option>
            {scanClients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Page type multi-select */}
          <div className="flex gap-1">
            {PAGE_TYPES.map(pt => (
              <button key={pt.id} onClick={() => toggleType(pt.id)}
                className={`text-[10px] font-semibold rounded px-2 py-1 cursor-pointer border transition-colors ${
                  filterTypes.has(pt.id)
                    ? 'bg-[#F5C518] text-[#1a1a1a] border-[#F5C518]'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-[#F5C518]'
                }`}>
                {pt.icon} {pt.label}
              </button>
            ))}
            {filterTypes.size > 0 && (
              <button onClick={() => setFilterTypes(new Set())}
                className="text-[9px] text-gray-400 bg-transparent border-none cursor-pointer hover:text-gray-600">✕</button>
            )}
          </div>

          {issueCount > 0 && (
            <button onClick={() => setFilterIssues(!filterIssues)}
              className={`text-[11px] font-bold rounded px-3 py-1 cursor-pointer border ${filterIssues ? 'bg-red-500 text-white border-red-500' : 'bg-red-50 text-red-700 border-red-300'}`}>
              ⚠ {issueCount} below {THRESHOLD}
            </button>
          )}

          {staleScans.length > 0 && (
            <span className="text-[10px] text-orange-500">⏰ {staleScans.length} scan{staleScans.length !== 1 ? 's' : ''} older than {staleDays} days</span>
          )}

          <span className="text-[10px] text-gray-400 ml-auto">{scans.length} URLs monitored</span>
        </div>
      </div>

      {/* Add URL form */}
      {showAddUrl && (
        <div className="bg-white border-b border-gray-200 px-5 py-3 shrink-0">
          <div className="flex gap-2 items-end max-w-3xl">
            <div>
              <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">Client</label>
              <select value={addForm.client_name} onChange={e => setAddForm(f => ({ ...f, client_name: e.target.value }))}
                className="border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-[#f8f8f6] w-48">
                <option value="">Select...</option>
                {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">URL</label>
              <input value={addForm.url} onChange={e => setAddForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://clientwebsite.com.au/" onKeyDown={e => e.key === 'Enter' && handleAddUrl()}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-[#f8f8f6]" />
            </div>
            <button onClick={handleAddUrl} className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800]">Add</button>
            {addForm.client_name && (
              <button onClick={() => handleImportFromBucketList(addForm.client_name)}
                className="bg-white border border-gray-300 text-gray-700 rounded px-3 py-1.5 text-[11px] cursor-pointer hover:border-[#F5C518]">
                📋 Import from Bucket List
              </button>
            )}
          </div>
        </div>
      )}

      {/* Results table */}
      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="text-center py-10 text-gray-400">Loading...</div>
        ) : filteredScans.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-2 opacity-30">🏥</div>
            <div className="text-sm text-gray-500">{scans.length === 0 ? 'Add client URLs to start monitoring' : 'No issues found'}</div>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-[#f8f8f6] border-b border-gray-200 text-left">
                  <th className="px-3 py-2.5 font-bold text-gray-500 uppercase text-[9px]">Client</th>
                  <th className="px-3 py-2.5 font-bold text-gray-500 uppercase text-[9px]">URL</th>
                  <th className="px-3 py-2.5 font-bold text-gray-500 uppercase text-[9px] text-center" colSpan={4}>Mobile</th>
                  <th className="px-3 py-2.5 font-bold text-gray-500 uppercase text-[9px] text-center" colSpan={4}>Desktop</th>
                  <th className="px-3 py-2.5 font-bold text-gray-500 uppercase text-[9px] text-center">LCP</th>
                  <th className="px-3 py-2.5 font-bold text-gray-500 uppercase text-[9px]">Last Scan</th>
                  <th className="px-3 py-2.5 w-24"></th>
                </tr>
                <tr className="bg-[#f8f8f6] border-b border-gray-200 text-[8px] text-gray-400 uppercase">
                  <th colSpan={2}></th>
                  <th className="px-1 py-1 text-center" title="Performance — page speed and load efficiency">Perf</th>
                  <th className="px-1 py-1 text-center" title="Accessibility — how usable the site is for all users">Acc</th>
                  <th className="px-1 py-1 text-center" title="Best Practices — security, modern standards, no errors">BP</th>
                  <th className="px-1 py-1 text-center" title="SEO — search engine optimisation fundamentals">SEO</th>
                  <th className="px-1 py-1 text-center" title="Performance — page speed and load efficiency">Perf</th>
                  <th className="px-1 py-1 text-center" title="Accessibility — how usable the site is for all users">Acc</th>
                  <th className="px-1 py-1 text-center" title="Best Practices — security, modern standards, no errors">BP</th>
                  <th className="px-1 py-1 text-center" title="SEO — search engine optimisation fundamentals">SEO</th>
                  <th className="px-1 py-1 text-center" title="Largest Contentful Paint — how long until the main content loads">Mobile</th>
                  <th colSpan={2}></th>
                </tr>
              </thead>
              <tbody>
                {filteredScans.map(scan => {
                  const isUrlScanning = singleScanning === scan.id || (scanning && bgProgress.url === scan.url);
                  const needsAttention = hasIssues(scan);
                  const isStale = !scan.last_scanned || (Date.now() - new Date(scan.last_scanned).getTime()) > staleDays * 86400000;
                  return (
                    <tr key={scan.id} className={`border-b border-gray-100 hover:bg-[#f8f8f6] ${needsAttention ? 'bg-red-50/30' : ''}`}>
                      <td className="px-3 py-2 font-semibold text-[#1a1a1a] whitespace-nowrap">{scan.client_name}</td>
                      <td className="px-3 py-2 max-w-[200px]">
                        <a href={scan.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-[10px] truncate block">
                          {scan.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </a>
                      </td>
                      {/* Mobile scores */}
                      <td className="px-1 py-2 text-center"><ScoreCircle score={scan.mobile_performance} size={32} /></td>
                      <td className="px-1 py-2 text-center"><ScoreCircle score={scan.mobile_accessibility} size={32} /></td>
                      <td className="px-1 py-2 text-center"><ScoreCircle score={scan.mobile_best_practices} size={32} /></td>
                      <td className="px-1 py-2 text-center"><ScoreCircle score={scan.mobile_seo} size={32} /></td>
                      {/* Desktop scores */}
                      <td className="px-1 py-2 text-center"><ScoreCircle score={scan.desktop_performance} size={32} /></td>
                      <td className="px-1 py-2 text-center"><ScoreCircle score={scan.desktop_accessibility} size={32} /></td>
                      <td className="px-1 py-2 text-center"><ScoreCircle score={scan.desktop_best_practices} size={32} /></td>
                      <td className="px-1 py-2 text-center"><ScoreCircle score={scan.desktop_seo} size={32} /></td>
                      {/* LCP */}
                      <td className="px-1 py-2 text-center">
                        {scan.mobile_lcp ? (
                          <span className={`text-[10px] font-bold ${parseFloat(scan.mobile_lcp) <= 2.5 ? 'text-green-600' : parseFloat(scan.mobile_lcp) <= 4 ? 'text-orange-500' : 'text-red-500'}`}>
                            {scan.mobile_lcp}s
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-[10px] text-gray-400 whitespace-nowrap">
                        {scan.last_scanned ? (
                          <span className={isStale ? 'text-orange-500' : ''}>
                            {new Date(scan.last_scanned).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                            {isStale && ' ⏰'}
                          </span>
                        ) : <span className="text-gray-300">Never</span>}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => handleScanUrl(scan.id)} disabled={singleScanning === scan.id}
                          className="text-[10px] text-blue-500 hover:text-blue-700 bg-transparent border-none cursor-pointer mr-1 disabled:opacity-30">
                          {isUrlScanning ? '...' : '🔄'}
                        </button>
                        <button onClick={() => handleDelete(scan.id)}
                          className="text-[10px] text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer">🗑</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
