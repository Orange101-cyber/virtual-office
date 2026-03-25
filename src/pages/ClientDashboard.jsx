import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Clients with dashboards — add more here as you onboard them
const DASHBOARD_CLIENTS = [
  { slug: 'invida', name: 'Invida', table: 'monthly_reports' },
];

function formatMonth(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-');
  return `${MONTHS_SHORT[parseInt(m, 10) - 1]} ${y}`;
}

function StatCard({ label, value, prefix = '', trend }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</div>
      <div className="text-2xl font-bold text-[#1a1a1a]">
        {prefix}{typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {trend !== undefined && trend !== null && (
        <div className={`text-xs mt-1 font-semibold ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {trend >= 0 ? '+' : ''}{trend}% vs prev month
        </div>
      )}
    </div>
  );
}

function LeadSourceBar({ label, pct, color }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-20 text-gray-500 shrink-0">{label}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="w-10 text-right font-semibold text-gray-600">{pct}%</div>
    </div>
  );
}

// ── Client List View ──
function ClientList({ onSelect }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1a1a1a] mb-1">Client Dashboard</h1>
          <p className="text-sm text-gray-400">Select a client to view their performance data.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {DASHBOARD_CLIENTS.map((client) => (
            <button
              key={client.slug}
              onClick={() => onSelect(client)}
              className="bg-white border border-gray-200 rounded-lg p-5 text-left transition-all hover:border-[#F5C518] hover:shadow-md cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="text-2xl">📊</div>
                <span className="text-[9px] font-bold uppercase bg-green-50 text-green-600 px-2 py-0.5 rounded-full">
                  Active
                </span>
              </div>
              <h3 className="text-sm font-semibold text-[#1a1a1a] mb-1">{client.name}</h3>
              <p className="text-xs text-gray-400">View monthly performance reports</p>
            </button>
          ))}

          {/* Placeholder for adding more clients */}
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-5 flex flex-col items-center justify-center text-center opacity-50">
            <div className="text-2xl mb-2">+</div>
            <p className="text-xs text-gray-400">More clients coming soon</p>
          </div>
        </div>
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

  const calcTrend = (current, previous) => {
    if (!previous || previous === 0) return null;
    return Math.round(((current - previous) / previous) * 100);
  };

  const totalSpend = r ? (Number(r.google_spend || 0) + Number(r.meta_spend || 0)) : 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-gray-400 hover:text-[#1a1a1a] text-sm cursor-pointer bg-transparent border-none"
            >
              ← Clients
            </button>
            <div>
              <h1 className="text-xl font-bold text-[#1a1a1a] mb-0.5">{client.name}</h1>
              <p className="text-xs text-gray-400">Performance reporting and analytics</p>
            </div>
          </div>

          {/* Month selector */}
          {reports.length > 0 && (
            <select
              value={r?.id || ''}
              onChange={(e) => {
                const rep = reports.find((rp) => rp.id === e.target.value);
                setSelectedReport(rep);
              }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#F5C518]"
            >
              {reports.map((rep) => (
                <option key={rep.id} value={rep.id}>{formatMonth(rep.month)}</option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <div className="text-sm text-gray-400 py-20 text-center">Loading...</div>
        ) : !r ? (
          <div className="text-sm text-gray-400 py-20 text-center">
            No reports found. Add monthly data to the <code>{client.table}</code> table in Supabase.
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
              <StatCard label="Web Sessions" value={r.web_sessions} trend={calcTrend(r.web_sessions, prev?.web_sessions)} />
              <StatCard label="Leads" value={r.leads} trend={calcTrend(r.leads, prev?.leads)} />
              <StatCard label="Strategy Calls" value={r.strategy_calls} trend={calcTrend(r.strategy_calls, prev?.strategy_calls)} />
              <StatCard label="Sales" value={r.sales} trend={calcTrend(r.sales, prev?.sales)} />
              <StatCard
                label="Cost per Lead"
                value={Number(r.cost_per_lead || 0).toFixed(2)}
                prefix="$"
                trend={prev ? -calcTrend(Number(r.cost_per_lead), Number(prev.cost_per_lead)) : null}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              {/* Ad Spend */}
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Ad Spend</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Google Ads</span>
                    <span className="text-sm font-semibold">${Number(r.google_spend || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Meta Ads</span>
                    <span className="text-sm font-semibold">${Number(r.meta_spend || 0).toLocaleString()}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-800">Total</span>
                    <span className="text-sm font-bold text-[#1a1a1a]">${totalSpend.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Lead Sources */}
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Lead Sources</h3>
                <div className="space-y-2.5">
                  <LeadSourceBar label="Facebook" pct={Number(r.leads_fb_pct || 0)} color="#1877F2" />
                  <LeadSourceBar label="Google" pct={Number(r.leads_google_pct || 0)} color="#34A853" />
                  <LeadSourceBar label="Instagram" pct={Number(r.leads_ig_pct || 0)} color="#E4405F" />
                  <LeadSourceBar label="YouTube" pct={Number(r.leads_youtube_pct || 0)} color="#FF0000" />
                  <LeadSourceBar label="Referral" pct={Number(r.leads_referral_pct || 0)} color="#F5C518" />
                  <LeadSourceBar label="Other" pct={Number(r.leads_other_pct || 0)} color="#999" />
                </div>
              </div>

              {/* Notes */}
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Notes</h3>
                {r.campaigns && (
                  <div className="mb-3">
                    <div className="text-[10px] font-semibold uppercase text-gray-400 mb-1">Campaigns</div>
                    <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{r.campaigns}</p>
                  </div>
                )}
                {r.improvements && (
                  <div className="mb-3">
                    <div className="text-[10px] font-semibold uppercase text-gray-400 mb-1">Improvements</div>
                    <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{r.improvements}</p>
                  </div>
                )}
                {r.notes && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase text-gray-400 mb-1">General</div>
                    <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{r.notes}</p>
                  </div>
                )}
                {!r.campaigns && !r.improvements && !r.notes && (
                  <p className="text-xs text-gray-400">No notes for this month.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
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
