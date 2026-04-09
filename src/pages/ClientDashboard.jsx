import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DASHBOARD_CLIENTS = [
  { slug: 'invida', name: 'Invida', table: 'monthly_reports' },
];

function formatMonth(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-');
  return `${MONTHS_SHORT[parseInt(m, 10) - 1]} ${y}`;
}

function fmtNum(n) {
  if (n === null || n === undefined || n === '') return '—';
  return Number(n).toLocaleString();
}

function fmtMoney(n) {
  if (n === null || n === undefined || n === '') return '$0';
  return '$' + Number(n).toLocaleString();
}

function trend(curr, prev) {
  if (!prev || prev === 0 || !curr) return null;
  return Math.round(((Number(curr) - Number(prev)) / Number(prev)) * 100);
}

// ── Client List View ──
function ClientList({ onSelect }) {
  return (
    <div className="h-full overflow-y-auto" style={{ background: '#0a0e1a' }}>
      <div className="max-w-5xl mx-auto px-8 py-12">
        <div className="mb-8">
          <h1 className="font-syne text-2xl font-bold text-white mb-1" style={{ fontFamily: 'Syne, system-ui, sans-serif' }}>Client Dashboards</h1>
          <p className="text-sm text-[#64748b]" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Select a client to view their performance data.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {DASHBOARD_CLIENTS.map((client) => (
            <button
              key={client.slug}
              onClick={() => onSelect(client)}
              className="text-left p-6 rounded-2xl border cursor-pointer transition-all hover:-translate-y-1"
              style={{ background: '#111827', borderColor: 'rgba(255,255,255,0.07)' }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#00e5b0', boxShadow: '0 0 12px #00e5b0' }} />
                <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,229,176,0.12)', color: '#00e5b0' }}>
                  Active
                </span>
              </div>
              <h3 className="font-syne text-lg font-bold text-white mb-1" style={{ fontFamily: 'Syne, system-ui, sans-serif' }}>{client.name}</h3>
              <p className="text-xs text-[#64748b]" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Performance Dashboard</p>
            </button>
          ))}
          <div className="rounded-2xl border-2 border-dashed p-6 flex items-center justify-center text-center opacity-40" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <span className="text-xs text-[#64748b]" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>+ More clients coming soon</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Metric Card ──
function MetricCard({ label, value, sub, change, color = 'green', prefix = '' }) {
  const colors = { green: '#00e5b0', blue: '#3b82f6', amber: '#f59e0b', pink: '#ec4899', red: '#ef4444' };
  const borderColor = colors[color];
  const isUp = change !== null && change !== undefined && change >= 0;
  const changeColor = isUp ? '#00e5b0' : '#ef4444';

  return (
    <div className="rounded-2xl p-5 relative overflow-hidden border transition-colors" style={{ background: '#111827', borderColor: 'rgba(255,255,255,0.07)' }}>
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: borderColor, opacity: 0.7 }} />
      <div className="text-[11px] uppercase tracking-wider font-medium mb-2" style={{ color: '#64748b', fontFamily: 'DM Sans, system-ui, sans-serif' }}>{label}</div>
      <div className="font-syne text-[28px] font-bold text-[#f1f5f9] leading-none mb-2" style={{ fontFamily: 'Syne, system-ui, sans-serif' }}>
        {prefix}{value}
      </div>
      {change !== null && change !== undefined && (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: isUp ? 'rgba(0,229,176,0.1)' : 'rgba(239,68,68,0.1)', color: changeColor }}>
          {isUp ? '↑' : '↓'} {Math.abs(change)}% vs prev
        </span>
      )}
      {sub && <div className="text-[11px] mt-2" style={{ color: '#64748b', fontFamily: 'DM Sans, system-ui, sans-serif' }}>{sub}</div>}
    </div>
  );
}

// ── Funnel Chart ──
function FunnelChart({ report }) {
  const stages = [
    { label: 'Web Sessions', value: report.web_sessions || 0, color: '#00e5b0', gradient: 'linear-gradient(90deg,#00e5b0,#00c49a)' },
    { label: 'Leads In', value: report.leads || 0, color: '#3b82f6', gradient: 'linear-gradient(90deg,#3b82f6,#2563eb)' },
    { label: 'Strategy Calls', value: report.strategy_calls || 0, color: '#f59e0b', gradient: 'linear-gradient(90deg,#f59e0b,#d97706)' },
    { label: 'Sales Won', value: report.sales || 0, color: '#ec4899', gradient: 'linear-gradient(90deg,#ec4899,#db2777)' },
  ];
  const max = stages[0].value || 1;

  return (
    <div className="rounded-2xl p-6 border" style={{ background: '#111827', borderColor: 'rgba(255,255,255,0.07)' }}>
      <div className="flex justify-between items-start mb-5">
        <div>
          <div className="font-syne text-sm font-bold text-[#f1f5f9]" style={{ fontFamily: 'Syne, system-ui, sans-serif' }}>Conversion Funnel</div>
          <div className="text-[11px] text-[#64748b] mt-0.5" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Full pipeline breakdown</div>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        {stages.map((stage, i) => {
          const width = max > 0 ? Math.max(10, (stage.value / max) * 100) : 10;
          const nextVal = stages[i + 1]?.value;
          const conversionPct = stage.value > 0 && nextVal !== undefined
            ? Math.round((nextVal / stage.value) * 100) : null;
          return (
            <div key={stage.label}>
              <div className="relative h-11 rounded-lg overflow-hidden" style={{ background: '#1a2236' }}>
                <div className="h-full rounded-lg flex items-center px-4 transition-all duration-700" style={{ width: `${width}%`, background: stage.gradient }}>
                  <span className="text-xs font-semibold text-[#0a0e1a] whitespace-nowrap" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                    {stage.label}
                  </span>
                  <span className="ml-auto font-syne text-base font-bold text-[#0a0e1a]" style={{ fontFamily: 'Syne, system-ui, sans-serif' }}>
                    {fmtNum(stage.value)}
                  </span>
                </div>
              </div>
              {conversionPct !== null && (
                <div className="text-center text-[10px] text-[#00e5b0] font-semibold py-1" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                  ↓ {conversionPct}% conversion
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 6 Month Trend Line Chart ──
function TrendChart({ reports }) {
  const last6 = [...reports].reverse().slice(-6);
  const maxLeads = Math.max(1, ...last6.map(r => r.leads || 0));

  const leadsPoints = last6.map((r, i) => {
    const x = (i / Math.max(1, last6.length - 1)) * 520;
    const y = 110 - ((r.leads || 0) / maxLeads) * 90;
    return `${x},${y}`;
  }).join(' ');

  const callsPoints = last6.map((r, i) => {
    const x = (i / Math.max(1, last6.length - 1)) * 520;
    const y = 110 - ((r.strategy_calls || 0) / maxLeads) * 90;
    return `${x},${y}`;
  }).join(' ');

  const salesPoints = last6.map((r, i) => {
    const x = (i / Math.max(1, last6.length - 1)) * 520;
    const y = 110 - ((r.sales || 0) / maxLeads) * 90;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="rounded-2xl p-6 border" style={{ background: '#111827', borderColor: 'rgba(255,255,255,0.07)' }}>
      <div className="flex justify-between items-start mb-5">
        <div>
          <div className="font-syne text-sm font-bold text-[#f1f5f9]" style={{ fontFamily: 'Syne, system-ui, sans-serif' }}>6-Month Trend</div>
          <div className="text-[11px] text-[#64748b] mt-0.5" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Leads vs Strategy Calls vs Sales</div>
        </div>
      </div>
      <svg width="100%" height="130" viewBox="0 0 520 130" preserveAspectRatio="none">
        <line x1="0" y1="20" x2="520" y2="20" stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
        <line x1="0" y1="50" x2="520" y2="50" stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
        <line x1="0" y1="80" x2="520" y2="80" stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
        <line x1="0" y1="110" x2="520" y2="110" stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
        {last6.length > 1 && (
          <>
            <polyline points={leadsPoints} fill="none" stroke="#00e5b0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points={callsPoints} fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,3" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points={salesPoints} fill="none" stroke="#ec4899" strokeWidth="2" strokeDasharray="3,4" strokeLinecap="round" strokeLinejoin="round"/>
            {last6.map((r, i) => {
              const x = (i / Math.max(1, last6.length - 1)) * 520;
              const y = 110 - ((r.leads || 0) / maxLeads) * 90;
              return <circle key={i} cx={x} cy={y} r="4" fill="#00e5b0" />;
            })}
          </>
        )}
        {last6.map((r, i) => {
          const x = (i / Math.max(1, last6.length - 1)) * 520;
          return <text key={i} x={x} y="128" fontSize="9" fill="#64748b" textAnchor="middle">{formatMonth(r.month).split(' ')[0]}</text>;
        })}
      </svg>
      <div className="flex gap-5 mt-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-[11px] text-[#64748b]" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
          <div className="w-3.5 h-0.5 rounded-full" style={{ background: '#00e5b0' }} /> Leads
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[#64748b]" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
          <div className="w-3.5 h-0.5 rounded-full opacity-70" style={{ background: '#3b82f6' }} /> Strategy Calls
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[#64748b]" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
          <div className="w-3.5 h-0.5 rounded-full opacity-70" style={{ background: '#ec4899' }} /> Sales
        </div>
      </div>
    </div>
  );
}

// ── Donut Chart ──
function DonutChart({ report }) {
  const sources = [
    { name: 'Facebook', pct: Number(report.leads_fb_pct || 0), color: '#1877f2' },
    { name: 'Google', pct: Number(report.leads_google_pct || 0), color: '#00e5b0' },
    { name: 'Instagram', pct: Number(report.leads_ig_pct || 0), color: '#ec4899' },
    { name: 'YouTube', pct: Number(report.leads_youtube_pct || 0), color: '#f59e0b' },
    { name: 'Referral', pct: Number(report.leads_referral_pct || 0), color: '#8b5cf6' },
    { name: 'Other', pct: Number(report.leads_other_pct || 0), color: '#64748b' },
  ].filter(s => s.pct > 0);

  const total = sources.reduce((sum, s) => sum + s.pct, 0);
  const circumference = 2 * Math.PI * 35;
  let offset = 0;

  return (
    <div className="rounded-2xl p-6 border" style={{ background: '#111827', borderColor: 'rgba(255,255,255,0.07)' }}>
      <div className="mb-4">
        <div className="font-syne text-sm font-bold text-[#f1f5f9]" style={{ fontFamily: 'Syne, system-ui, sans-serif' }}>Lead Source Breakdown</div>
        <div className="text-[11px] text-[#64748b] mt-0.5" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>% of total leads by source</div>
      </div>
      <div className="flex items-center gap-5">
        <svg width="110" height="110" viewBox="0 0 100 100" className="shrink-0">
          {total > 0 ? sources.map((s, i) => {
            const dash = (s.pct / 100) * circumference;
            const gap = circumference - dash;
            const el = (
              <circle key={i} cx="50" cy="50" r="35" fill="none" stroke={s.color} strokeWidth="14"
                strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset}
                transform="rotate(-90 50 50)" />
            );
            offset += dash;
            return el;
          }) : (
            <circle cx="50" cy="50" r="35" fill="none" stroke="#1a2236" strokeWidth="14" />
          )}
          <circle cx="50" cy="50" r="28" fill="#111827"/>
          <text x="50" y="47" textAnchor="middle" fontSize="13" fontWeight="700" fill="#f1f5f9" fontFamily="Syne, sans-serif">
            {fmtNum(report.leads)}
          </text>
          <text x="50" y="58" textAnchor="middle" fontSize="7" fill="#64748b">LEADS</text>
        </svg>
        <div className="flex-1 space-y-1.5">
          {sources.map(s => (
            <div key={s.name} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="text-[11px] text-[#64748b]" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>{s.name}</span>
              </div>
              <span className="font-syne text-xs font-bold text-[#f1f5f9]" style={{ fontFamily: 'Syne, system-ui, sans-serif' }}>{s.pct}%</span>
            </div>
          ))}
          {sources.length === 0 && (
            <div className="text-xs text-[#64748b]" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>No lead source data</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ad Spend Card ──
function AdSpendCard({ report }) {
  const google = Number(report.google_spend || 0);
  const meta = Number(report.meta_spend || 0);
  const total = google + meta;
  const googlePct = total > 0 ? (google / total) * 100 : 50;
  const metaPct = total > 0 ? (meta / total) * 100 : 50;

  return (
    <div className="rounded-2xl p-6 border" style={{ background: '#111827', borderColor: 'rgba(255,255,255,0.07)' }}>
      <div className="mb-4">
        <div className="font-syne text-sm font-bold text-[#f1f5f9]" style={{ fontFamily: 'Syne, system-ui, sans-serif' }}>Ad Spend Breakdown</div>
        <div className="text-[11px] text-[#64748b] mt-0.5" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Platform split this month</div>
      </div>
      <div className="space-y-3.5">
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: '#00e5b0' }} />
              <span className="text-xs text-[#64748b]" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Google Ads</span>
            </div>
            <span className="font-syne text-sm font-bold text-[#f1f5f9]" style={{ fontFamily: 'Syne, system-ui, sans-serif' }}>{fmtMoney(google)}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1a2236' }}>
            <div className="h-full rounded-full" style={{ width: `${googlePct}%`, background: 'linear-gradient(90deg,#00e5b0,#00c49a)' }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: '#1877f2' }} />
              <span className="text-xs text-[#64748b]" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Meta (FB + IG)</span>
            </div>
            <span className="font-syne text-sm font-bold text-[#f1f5f9]" style={{ fontFamily: 'Syne, system-ui, sans-serif' }}>{fmtMoney(meta)}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1a2236' }}>
            <div className="h-full rounded-full" style={{ width: `${metaPct}%`, background: 'linear-gradient(90deg,#1877f2,#1565c0)' }} />
          </div>
        </div>
        <div className="pt-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-[#f1f5f9]" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Total Spend</span>
            <span className="font-syne text-lg font-bold" style={{ color: '#00e5b0', fontFamily: 'Syne, system-ui, sans-serif' }}>{fmtMoney(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Notes Card ──
function NotesCard({ title, subtitle, content, tags, tagColor = 'blue' }) {
  const colors = {
    blue: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.2)', text: '#3b82f6' },
    green: { bg: 'rgba(0,229,176,0.1)', border: 'rgba(0,229,176,0.2)', text: '#00e5b0' },
  };
  const c = colors[tagColor];

  if (!content) return null;

  return (
    <div className="rounded-2xl p-6 border" style={{ background: '#111827', borderColor: 'rgba(255,255,255,0.07)' }}>
      <div className="mb-4">
        <div className="font-syne text-sm font-bold text-[#f1f5f9]" style={{ fontFamily: 'Syne, system-ui, sans-serif' }}>{title}</div>
        <div className="text-[11px] text-[#64748b] mt-0.5" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>{subtitle}</div>
      </div>
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3.5">
          {tags.map((tag, i) => (
            <span key={i} className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border" style={{ background: c.bg, borderColor: c.border, color: c.text }}>
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(241,245,249,0.75)', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
        {content}
      </div>
    </div>
  );
}

// ── Client Detail View ──
function ClientDetail({ client, onBack }) {
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from(client.table)
        .select('*')
        .order('month', { ascending: false });
      if (!error && data) {
        setReports(data);
        if (data.length > 0) setSelectedReport(data[0]);
      }
      setLoading(false);
    };
    fetchReports();
  }, [client]);

  const r = selectedReport;
  const currentIdx = reports.findIndex((rep) => rep.id === r?.id);
  const prev = currentIdx >= 0 && currentIdx < reports.length - 1 ? reports[currentIdx + 1] : null;

  const totalSpend = r ? (Number(r.google_spend || 0) + Number(r.meta_spend || 0)) : 0;
  const prevTotalSpend = prev ? (Number(prev.google_spend || 0) + Number(prev.meta_spend || 0)) : 0;

  // Recent months for tabs
  const recentMonths = reports.slice(0, 6).reverse();

  return (
    <div className="h-full overflow-y-auto relative" style={{ background: '#0a0e1a' }}>
      {/* Background gradients */}
      <div className="pointer-events-none fixed inset-0" style={{
        background: 'radial-gradient(ellipse 60% 40% at 10% 0%, rgba(0,229,176,0.06) 0%, transparent 60%), radial-gradient(ellipse 40% 30% at 90% 100%, rgba(59,130,246,0.05) 0%, transparent 60%)',
        zIndex: 0,
      }} />

      <div className="relative z-10">
        {/* Header */}
        <div className="px-8 py-6 border-b sticky top-0 backdrop-blur-lg" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(10,14,26,0.8)' }}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <button onClick={onBack} className="text-[#64748b] hover:text-[#00e5b0] text-sm transition-colors bg-transparent border-none cursor-pointer" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                ← Clients
              </button>
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#00e5b0', boxShadow: '0 0 12px #00e5b0', animation: 'pulse 2.5s infinite' }} />
                <div>
                  <h1 className="font-syne text-lg font-bold text-[#f1f5f9]" style={{ fontFamily: 'Syne, system-ui, sans-serif' }}>{client.name}</h1>
                  <p className="text-[10px] text-[#64748b] uppercase tracking-wider" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Performance Dashboard</p>
                </div>
              </div>
            </div>

            {/* Month tabs */}
            {reports.length > 0 && (
              <div className="flex rounded-xl border p-1 gap-0.5" style={{ background: '#111827', borderColor: 'rgba(255,255,255,0.07)' }}>
                {recentMonths.map((rep) => {
                  const isActive = r?.id === rep.id;
                  return (
                    <button
                      key={rep.id}
                      onClick={() => setSelectedReport(rep)}
                      className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer border-none"
                      style={{
                        background: isActive ? '#00e5b0' : 'transparent',
                        color: isActive ? '#0a0e1a' : '#64748b',
                        fontWeight: isActive ? 700 : 500,
                        fontFamily: 'DM Sans, system-ui, sans-serif',
                      }}
                    >
                      {formatMonth(rep.month).split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-32 text-center text-[#64748b] text-sm" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Loading...</div>
        ) : !r ? (
          <div className="py-32 text-center text-[#64748b] text-sm" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
            No reports found. Add monthly data to the <code className="text-[#00e5b0]">{client.table}</code> table in Supabase.
          </div>
        ) : (
          <div className="px-8 py-7">
            {/* Comparison strip */}
            {prev && (
              <div className="rounded-xl px-4 py-3 mb-6 flex items-center gap-4 flex-wrap" style={{ background: 'rgba(0,229,176,0.05)', border: '1px solid rgba(0,229,176,0.15)' }}>
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#00e5b0', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                  ↔ vs {formatMonth(prev.month)}
                </span>
                <div className="flex gap-6 flex-wrap">
                  {[
                    { label: 'Leads', curr: r.leads, prev: prev.leads },
                    { label: 'Ad Spend', curr: totalSpend, prev: prevTotalSpend, money: true },
                    { label: 'Cost/Lead', curr: r.cost_per_lead, prev: prev.cost_per_lead, money: true, inverse: true },
                    { label: 'Sales', curr: r.sales, prev: prev.sales },
                    { label: 'Sessions', curr: r.web_sessions, prev: prev.web_sessions },
                  ].map((item, i) => {
                    const t = trend(item.curr, item.prev);
                    const isGood = item.inverse ? t <= 0 : t >= 0;
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs" style={{ color: '#64748b', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                        {item.label}
                        <span className="font-bold text-[#f1f5f9] font-syne" style={{ fontFamily: 'Syne, system-ui, sans-serif' }}>
                          {item.money ? fmtMoney(item.curr) : fmtNum(item.curr)}
                        </span>
                        {t !== null && (
                          <span style={{ color: isGood ? '#00e5b0' : '#ef4444' }}>
                            {isGood ? '↑' : '↓'} {Math.abs(t)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* KPI Row 1 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <MetricCard label="Web Sessions" value={fmtNum(r.web_sessions)} sub="Google, Meta, Organic" color="green" change={trend(r.web_sessions, prev?.web_sessions)} />
              <MetricCard label="Total Leads In" value={fmtNum(r.leads)} sub="All sources combined" color="blue" change={trend(r.leads, prev?.leads)} />
              <MetricCard label="Strategy Calls" value={fmtNum(r.strategy_calls)} sub={r.leads ? `${Math.round((r.strategy_calls / r.leads) * 100)}% lead-to-call` : ''} color="amber" change={trend(r.strategy_calls, prev?.strategy_calls)} />
              <MetricCard label="Sales Conversions" value={fmtNum(r.sales)} sub={r.strategy_calls ? `${Math.round((r.sales / r.strategy_calls) * 100)}% call-to-sale` : ''} color="pink" change={trend(r.sales, prev?.sales)} />
            </div>

            {/* KPI Row 2 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <MetricCard label="Google Ad Spend" value={fmtNum(r.google_spend)} prefix="$" color="blue" change={trend(r.google_spend, prev?.google_spend)} />
              <MetricCard label="Meta Ad Spend" value={fmtNum(r.meta_spend)} prefix="$" color="blue" change={trend(r.meta_spend, prev?.meta_spend)} />
              <MetricCard label="Total Ad Spend" value={fmtNum(totalSpend)} prefix="$" color="amber" change={trend(totalSpend, prevTotalSpend)} />
              <MetricCard label="Cost Per Lead" value={Number(r.cost_per_lead || 0).toFixed(2)} prefix="$" sub="Target: <$65" color="green" change={prev ? -trend(r.cost_per_lead, prev.cost_per_lead) : null} />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
              <FunnelChart report={r} />
              <div className="lg:col-span-2">
                <TrendChart reports={reports} />
              </div>
            </div>

            {/* Bottom row — donut, ad spend, notes */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
              <DonutChart report={r} />
              <AdSpendCard report={r} />
              <NotesCard
                title="Active Campaigns"
                subtitle="This month's push activity"
                content={r.campaigns || 'No campaigns listed for this month.'}
                tags={r.campaigns ? ['CAMPAIGNS'] : null}
                tagColor="blue"
              />
            </div>

            {/* Improvements + Notes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {r.improvements && (
                <NotesCard
                  title="Current Improvements"
                  subtitle="Marketing & sales process changes"
                  content={r.improvements}
                  tags={['IMPROVEMENTS']}
                  tagColor="blue"
                />
              )}
              {r.notes && (
                <NotesCard
                  title="Monthly Notes"
                  subtitle="Internal observations for this period"
                  content={r.notes}
                  tags={['NOTES']}
                  tagColor="green"
                />
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}

// ── Main Component ──
export default function ClientDashboard() {
  const [activeClient, setActiveClient] = useState(null);

  if (activeClient) {
    return <ClientDetail client={activeClient} onBack={() => setActiveClient(null)} />;
  }
  return <ClientList onSelect={setActiveClient} />;
}
