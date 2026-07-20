import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// Futuristic "brain" analytics dashboard — an animated neural core surrounded by
// live agency data (clients, rankings, content, audits) so the team can see the
// work happening at a glance. Dark, neon, always moving.

const NEON = { cyan: '#22d3ee', purple: '#a78bfa', yellow: '#F5C518', green: '#34d399', pink: '#f472b6' };

function useCountUp(target, ms = 1200) {
  const [v, setV] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const from = ref.current, start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = Math.round(from + (target - from) * eased);
      setV(val); ref.current = val;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export default function AnalyticsDashboard() {
  const [stats, setStats] = useState(null);
  const [feed, setFeed] = useState([]);
  const [clientNames, setClientNames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [clientsR, plansR, reportsR, kwR, snapsR, auditsR, pagesR] = await Promise.all([
        supabase.from('clients').select('name, archived'),
        supabase.from('content_plans').select('client_name, title, status, created_at').order('created_at', { ascending: false }).limit(60),
        supabase.from('reports').select('article_title, name, updated_at').order('updated_at', { ascending: false }).limit(40),
        supabase.from('rank_tracker_keywords').select('client_name'),
        supabase.from('rank_tracker_snapshots').select('position, captured_on, features').order('captured_on', { ascending: false }).limit(3000),
        supabase.from('site_audits').select('client_name, summary, tasks, audited_on').order('audited_on', { ascending: false }).limit(40),
        supabase.from('client_pages').select('client_name'),
      ]);

      const clients = (clientsR.data || []).filter(c => c.archived !== true);
      const plans = plansR.data || [];
      const reports = reportsR.data || [];
      const kws = kwR.data || [];
      const snaps = snapsR.data || [];
      const audits = auditsR.data || [];
      const pages = pagesR.data || [];

      const ranked = snaps.filter(s => s.position != null);
      const avgPos = ranked.length ? (ranked.reduce((a, s) => a + s.position, 0) / ranked.length) : null;
      const aioCited = snaps.filter(s => s.features?.ai_overview_cited).length;
      const openTasks = audits.reduce((a, x) => a + (x.tasks || []).filter(t => !t.done).length, 0);

      setStats({
        clients: clients.length,
        keywords: kws.length,
        avgPos: avgPos != null ? avgPos.toFixed(1) : '—',
        plansTotal: plans.length,
        plansPublished: plans.filter(p => (p.status || '').toLowerCase().includes('publish')).length,
        articles: reports.length,
        audits: audits.length,
        openTasks,
        pages: pages.length,
        aioCited,
      });

      setClientNames(clients.map(c => c.name).slice(0, 16));

      // Build a live activity feed from the most recent work across tables.
      const items = [
        ...plans.map(p => ({ icon: '✍️', color: NEON.cyan, text: `Planned “${p.title || 'content'}”`, sub: p.client_name, ts: p.created_at })),
        ...reports.map(r => ({ icon: '📝', color: NEON.green, text: `Article: ${r.article_title || r.name || 'draft'}`, sub: '', ts: r.updated_at })),
        ...audits.map(a => ({ icon: '🩺', color: NEON.yellow, text: a.summary || 'Site audit completed', sub: a.client_name, ts: a.audited_on })),
      ].filter(i => i.ts).sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, 24);
      setFeed(items);
      setLoading(false);
    })().catch(e => { console.error(e); setLoading(false); });
  }, []);

  return (
    <div className="relative h-full overflow-hidden bg-[#070b16] text-white">
      <Brain clientNames={clientNames} />

      {/* Overlay grid + content */}
      <div className="relative z-10 h-full overflow-y-auto">
        <div className="px-6 pt-5 pb-2 flex items-center gap-3">
          <div className="text-lg font-bold tracking-wide" style={{ textShadow: `0 0 20px ${NEON.cyan}66` }}>CYL Intelligence</div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border" style={{ borderColor: NEON.green + '55', color: NEON.green }}>
            ● LIVE
          </span>
          <div className="ml-auto text-[10px] text-white/40 font-mono">{loading ? 'syncing…' : 'all systems nominal'}</div>
        </div>

        {/* Stat ring */}
        <div className="px-6 grid grid-cols-2 md:grid-cols-5 gap-3 mt-2">
          <Stat label="Clients" value={stats?.clients ?? 0} color={NEON.cyan} />
          <Stat label="Keywords Tracked" value={stats?.keywords ?? 0} color={NEON.purple} />
          <Stat label="Avg Position" value={stats?.avgPos ?? '—'} color={NEON.yellow} raw />
          <Stat label="Articles" value={stats?.articles ?? 0} color={NEON.green} />
          <Stat label="AI Citations" value={stats?.aioCited ?? 0} color={NEON.pink} />
        </div>

        <div className="px-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 mt-4 pb-8">
          {/* Secondary metrics under the brain */}
          <div className="flex flex-col justify-end">
            <div className="grid grid-cols-3 gap-3 mt-auto">
              <MiniStat label="Content Planned" value={stats?.plansTotal ?? 0} color={NEON.cyan} />
              <MiniStat label="Published" value={stats?.plansPublished ?? 0} color={NEON.green} />
              <MiniStat label="Pages Tracked" value={stats?.pages ?? 0} color={NEON.purple} />
              <MiniStat label="Audits Run" value={stats?.audits ?? 0} color={NEON.yellow} />
              <MiniStat label="Open Fixes" value={stats?.openTasks ?? 0} color={NEON.pink} />
              <MiniStat label="Clients Live" value={stats?.clients ?? 0} color={NEON.cyan} />
            </div>
          </div>

          {/* Live activity feed */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/10 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: NEON.green }} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">Live Activity</span>
            </div>
            <div className="max-h-[340px] overflow-y-auto">
              {feed.length === 0 ? (
                <div className="p-6 text-center text-[11px] text-white/30">{loading ? 'Reading the neural stream…' : 'No recent activity.'}</div>
              ) : feed.map((f, i) => (
                <div key={i} className="px-4 py-2 border-b border-white/5 flex items-start gap-2.5 hover:bg-white/[0.04]">
                  <span className="text-[13px]">{f.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-white/85 truncate">{f.text}</div>
                    <div className="text-[9px] font-mono" style={{ color: f.color + 'cc' }}>{f.sub || '—'} · {timeAgo(f.ts)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function timeAgo(ts) {
  const d = (Date.now() - new Date(ts)) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function Stat({ label, value, color, raw }) {
  const num = useCountUp(typeof value === 'number' ? value : 0);
  return (
    <div className="rounded-xl border p-3 backdrop-blur-sm" style={{ borderColor: color + '33', background: `linear-gradient(135deg, ${color}14, transparent)` }}>
      <div className="text-[9px] font-bold uppercase tracking-wider text-white/50">{label}</div>
      <div className="text-3xl font-bold mt-0.5" style={{ color, textShadow: `0 0 18px ${color}55` }}>{raw ? value : num.toLocaleString()}</div>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  const num = useCountUp(typeof value === 'number' ? value : 0);
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
      <div className="text-[8px] font-bold uppercase tracking-wider text-white/40">{label}</div>
      <div className="text-xl font-bold" style={{ color }}>{num.toLocaleString()}</div>
    </div>
  );
}

// Animated neural core — a canvas of nodes (clients) feeding a pulsing centre.
function Brain({ clientNames }) {
  const canvasRef = useRef(null);
  const namesRef = useRef(clientNames);
  namesRef.current = clientNames;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf, W, H, dpr;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let nodes = [];
    const build = () => {
      const names = namesRef.current.length ? namesRef.current : ['Client'];
      const n = Math.max(6, Math.min(16, names.length));
      nodes = Array.from({ length: n }, (_, i) => {
        const ang = (i / n) * Math.PI * 2;
        const rad = 0.34 + (i % 3) * 0.05; // vary ring radius
        return {
          ang, rad, name: names[i] || '',
          phase: Math.random() * Math.PI * 2,
          hue: [NEON.cyan, NEON.purple, NEON.green, NEON.pink, NEON.yellow][i % 5],
          pulses: Array.from({ length: 2 }, () => Math.random()),
        };
      });
    };
    build();
    const rebuildTimer = setInterval(build, 4000); // reflect any client-list change

    let t = 0;
    const loop = () => {
      t += 0.016;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H * 0.52;
      const R = Math.min(W, H);

      // rotating faint rings around the core
      for (let r = 0; r < 3; r++) {
        ctx.beginPath();
        ctx.arc(cx, cy, R * (0.12 + r * 0.06) + Math.sin(t + r) * 3, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(34,211,238,${0.05 - r * 0.012})`;
        ctx.lineWidth = 1; ctx.stroke();
      }

      // edges + travelling pulses (data flowing into the core)
      nodes.forEach((nd) => {
        const nx = cx + Math.cos(nd.ang + t * 0.05) * R * nd.rad;
        const ny = cy + Math.sin(nd.ang + t * 0.05) * R * nd.rad;
        nd._x = nx; nd._y = ny;
        const grad = ctx.createLinearGradient(nx, ny, cx, cy);
        grad.addColorStop(0, nd.hue + '00');
        grad.addColorStop(1, nd.hue + '44');
        ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(cx, cy);
        ctx.strokeStyle = grad; ctx.lineWidth = 1; ctx.stroke();

        nd.pulses.forEach((p, pi) => {
          p += 0.006 + pi * 0.002; if (p > 1) p -= 1; nd.pulses[pi] = p;
          const px = nx + (cx - nx) * p, py = ny + (cy - ny) * p;
          ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fillStyle = nd.hue; ctx.shadowColor = nd.hue; ctx.shadowBlur = 8;
          ctx.fill(); ctx.shadowBlur = 0;
        });
      });

      // client nodes
      nodes.forEach((nd) => {
        const r = 4 + Math.sin(t * 2 + nd.phase) * 1.5;
        ctx.beginPath(); ctx.arc(nd._x, nd._y, r, 0, Math.PI * 2);
        ctx.fillStyle = nd.hue; ctx.shadowColor = nd.hue; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
        if (nd.name) {
          ctx.font = '9px ui-monospace, monospace';
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.textAlign = nd._x < cx ? 'right' : 'left';
          ctx.fillText(nd.name.slice(0, 18), nd._x + (nd._x < cx ? -8 : 8), nd._y + 3);
        }
      });

      // pulsing core "brain"
      const coreR = R * 0.07 + Math.sin(t * 2) * 4;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.2);
      cg.addColorStop(0, 'rgba(245,197,24,0.9)');
      cg.addColorStop(0.4, 'rgba(167,139,250,0.35)');
      cg.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.beginPath(); ctx.arc(cx, cy, coreR * 2.2, 0, Math.PI * 2); ctx.fillStyle = cg; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.shadowColor = NEON.yellow; ctx.shadowBlur = 30; ctx.fill(); ctx.shadowBlur = 0;

      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(raf); clearInterval(rebuildTimer); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ opacity: 0.9 }} />;
}
