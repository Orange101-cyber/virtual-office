import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { CHECKS, MONTHS } from '../data/checklist';

const TOTAL_CHECKS = CHECKS.flatMap(c => c.items).length;

function calcScore(checklistState) {
  if (!checklistState) return 0;
  const passed = Object.values(checklistState).filter(Boolean).length;
  return Math.round((passed / TOTAL_CHECKS) * 100);
}

function getScoreColor(score) {
  if (score >= 85) return '#27ae60';
  if (score >= 60) return '#e67e22';
  return '#e74c3c';
}

function getScoreLabel(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Needs Work';
  return 'Poor';
}

// ─── Mini sparkline SVG ───
function Sparkline({ data, color = '#F5C518', height = 32, width = 100 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dot on last point */}
      {data.length > 0 && (() => {
        const lastX = width;
        const lastY = height - ((data[data.length - 1] - min) / range) * (height - 4) - 2;
        return <circle cx={lastX} cy={lastY} r="3" fill={color} />;
      })()}
    </svg>
  );
}

// ─── Score ring ───
function ScoreRing({ score, size = 64, strokeWidth = 6 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f0f0f0" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.5s' }}
      />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        fontSize="14" fontWeight="700" fill={color} fontFamily="system-ui">
        {score}%
      </text>
    </svg>
  );
}

// ─── Bar chart ───
function BarChart({ data, labels, color = '#F5C518', height = 120 }) {
  const max = Math.max(...data, 1);

  return (
    <div className="flex items-end gap-[6px]" style={{ height }}>
      {data.map((val, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="text-[9px] font-semibold text-gray-500">{val || ''}</div>
          <div
            className="w-full rounded-t-sm min-h-[2px] transition-all duration-500"
            style={{
              height: `${(val / max) * (height - 30)}px`,
              backgroundColor: val > 0 ? color : '#f0f0f0',
            }}
          />
          <div className="text-[8px] text-gray-400 leading-none">{labels[i]}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Category weakness chart ───
function CategoryChart({ reports }) {
  const catScores = useMemo(() => {
    return CHECKS.map(cat => {
      let totalPassed = 0;
      let totalItems = 0;
      reports.forEach(r => {
        if (r.checklist_state) {
          cat.items.forEach(item => {
            totalItems++;
            if (r.checklist_state[item.id]) totalPassed++;
          });
        }
      });
      const pct = totalItems > 0 ? Math.round((totalPassed / totalItems) * 100) : 0;
      return { cat: cat.cat, pct };
    }).sort((a, b) => a.pct - b.pct);
  }, [reports]);

  return (
    <div className="space-y-2">
      {catScores.map((c, i) => (
        <div key={i}>
          <div className="flex justify-between text-[11px] mb-0.5">
            <span className="text-gray-600">{c.cat}</span>
            <span className="font-semibold" style={{ color: getScoreColor(c.pct) }}>{c.pct}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${c.pct}%`, backgroundColor: getScoreColor(c.pct) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Dashboard ───
export default function SEODashboard({ clients, onAddClient }) {
  const [allReports, setAllReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Fetch all reports
  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('reports')
        .select('id, client_id, name, year, month_index, checklist_state, updated_at, url')
        .eq('year', selectedYear)
        .order('month_index', { ascending: true });
      if (!error) setAllReports(data || []);
      setLoading(false);
    };
    fetch();
  }, [selectedYear]);

  // ── Computed analytics ──
  const analytics = useMemo(() => {
    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      month: MONTHS[i].substring(0, 3),
      articles: 0,
      totalScore: 0,
      scores: [],
    }));

    const clientData = {};

    allReports.forEach(report => {
      const mi = report.month_index;
      if (mi >= 0 && mi < 12) {
        const score = calcScore(report.checklist_state);
        monthlyData[mi].articles++;
        monthlyData[mi].totalScore += score;
        monthlyData[mi].scores.push(score);

        // Per-client
        if (!clientData[report.client_id]) {
          clientData[report.client_id] = {
            articles: 0,
            totalScore: 0,
            scores: [],
            monthly: Array.from({ length: 12 }, () => ({ articles: 0, scores: [] })),
          };
        }
        clientData[report.client_id].articles++;
        clientData[report.client_id].totalScore += score;
        clientData[report.client_id].scores.push(score);
        clientData[report.client_id].monthly[mi].articles++;
        clientData[report.client_id].monthly[mi].scores.push(score);
      }
    });

    // Calculate averages
    monthlyData.forEach(m => {
      m.avgScore = m.scores.length ? Math.round(m.totalScore / m.scores.length) : 0;
    });

    const totalArticles = allReports.length;
    const avgScore = totalArticles > 0
      ? Math.round(allReports.reduce((s, r) => s + calcScore(r.checklist_state), 0) / totalArticles)
      : 0;

    // Critical items across all reports
    let criticalCount = 0;
    const criticalItems = CHECKS.flatMap(c => c.items).filter(i => i.crit);
    allReports.forEach(r => {
      if (r.checklist_state) {
        criticalItems.forEach(item => {
          if (!r.checklist_state[item.id]) criticalCount++;
        });
      }
    });

    // Top articles by score
    const topArticles = [...allReports]
      .map(r => ({ ...r, score: calcScore(r.checklist_state) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // Lowest articles
    const lowestArticles = [...allReports]
      .map(r => ({ ...r, score: calcScore(r.checklist_state) }))
      .filter(r => r.score < 85)
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);

    return { monthlyData, clientData, totalArticles, avgScore, criticalCount, topArticles, lowestArticles };
  }, [allReports]);

  const currentMonth = new Date().getMonth();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
        Loading analytics...
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400 gap-3">
        <div className="text-4xl opacity-30">📊</div>
        <h2 className="text-base font-semibold text-gray-500">No clients yet</h2>
        <p className="text-sm max-w-xs leading-relaxed">
          Add a client to start tracking SEO performance.
        </p>
        <button
          onClick={onAddClient}
          className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-md px-5 py-2 text-sm font-bold cursor-pointer hover:bg-[#e6b800] mt-1"
        >
          Add your first client
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1200px] mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[#1a1a1a]">SEO Performance</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Overview of all client blog performance
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-[#F5C518]"
            >
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Total Articles</div>
            <div className="flex items-end justify-between">
              <div className="text-3xl font-bold text-[#1a1a1a]">{analytics.totalArticles}</div>
              <Sparkline
                data={analytics.monthlyData.map(m => m.articles)}
                color="#F5C518"
              />
            </div>
            <div className="text-[10px] text-gray-400 mt-1">
              {analytics.monthlyData[currentMonth]?.articles || 0} this month
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Avg SEO Score</div>
            <div className="flex items-end justify-between">
              <div className="text-3xl font-bold" style={{ color: getScoreColor(analytics.avgScore) }}>
                {analytics.avgScore}%
              </div>
              <Sparkline
                data={analytics.monthlyData.map(m => m.avgScore)}
                color={getScoreColor(analytics.avgScore)}
              />
            </div>
            <div className="text-[10px] mt-1" style={{ color: getScoreColor(analytics.avgScore) }}>
              {getScoreLabel(analytics.avgScore)}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Active Clients</div>
            <div className="text-3xl font-bold text-[#1a1a1a]">{clients.length}</div>
            <div className="text-[10px] text-gray-400 mt-1">
              {Object.keys(analytics.clientData).length} with reports in {selectedYear}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Critical Issues</div>
            <div className="text-3xl font-bold" style={{ color: analytics.criticalCount > 0 ? '#e74c3c' : '#27ae60' }}>
              {analytics.criticalCount}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">
              across all reports
            </div>
          </div>
        </div>

        {/* ── Charts Row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Articles per month */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-[#1a1a1a]">Articles per Month</div>
                <div className="text-[10px] text-gray-400">{selectedYear} output volume</div>
              </div>
              <div className="text-[10px] bg-[#F5C518]/10 text-[#1a1a1a] px-2 py-0.5 rounded-full font-semibold">
                {analytics.totalArticles} total
              </div>
            </div>
            <BarChart
              data={analytics.monthlyData.map(m => m.articles)}
              labels={analytics.monthlyData.map(m => m.month)}
              color="#F5C518"
            />
          </div>

          {/* Avg score per month */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-[#1a1a1a]">Average Score by Month</div>
                <div className="text-[10px] text-gray-400">SEO checklist completion rate</div>
              </div>
              <div className="text-[10px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-semibold">
                Target: 85%+
              </div>
            </div>
            <BarChart
              data={analytics.monthlyData.map(m => m.avgScore)}
              labels={analytics.monthlyData.map(m => m.month)}
              color="#27ae60"
            />
          </div>
        </div>

        {/* ── Client Breakdown ── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-[#1a1a1a]">Client Breakdown</div>
            <div className="text-[10px] text-gray-400">{selectedYear} performance by client</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.map(client => {
              const cd = analytics.clientData[client.id];
              const articles = cd?.articles || 0;
              const avgScore = articles > 0 ? Math.round(cd.totalScore / articles) : 0;
              const monthlyArticles = cd?.monthly.map(m => m.articles) || Array(12).fill(0);
              const monthlyScores = cd?.monthly.map(m =>
                m.scores.length ? Math.round(m.scores.reduce((a, b) => a + b, 0) / m.scores.length) : 0
              ) || Array(12).fill(0);

              return (
                <div key={client.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-[#F5C518] transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-sm font-semibold text-[#1a1a1a]">{client.name}</div>
                      <div className="text-[10px] text-gray-400">{articles} articles in {selectedYear}</div>
                    </div>
                    <ScoreRing score={avgScore} size={48} strokeWidth={4} />
                  </div>

                  {/* Monthly mini chart */}
                  <div className="mb-3">
                    <div className="flex items-end gap-[3px] h-8">
                      {monthlyArticles.map((count, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-t-sm"
                          style={{
                            height: count > 0 ? `${Math.max((count / Math.max(...monthlyArticles, 1)) * 100, 15)}%` : '2px',
                            backgroundColor: count > 0 ? '#F5C518' : '#f0f0f0',
                          }}
                          title={`${MONTHS[i]}: ${count} articles`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-[7px] text-gray-300">Jan</span>
                      <span className="text-[7px] text-gray-300">Dec</span>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100">
                    <div>
                      <div className="text-[9px] text-gray-400 uppercase">Articles</div>
                      <div className="text-sm font-bold text-[#1a1a1a]">{articles}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-400 uppercase">Avg Score</div>
                      <div className="text-sm font-bold" style={{ color: getScoreColor(avgScore) }}>
                        {avgScore}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-400 uppercase">This Month</div>
                      <div className="text-sm font-bold text-[#1a1a1a]">
                        {monthlyArticles[currentMonth] || 0}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Bottom Row: Top Articles + Category Weaknesses ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Top scoring articles */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="text-sm font-semibold text-[#1a1a1a] mb-1">Top Scoring Articles</div>
            <div className="text-[10px] text-gray-400 mb-3">Highest checklist completion</div>
            {analytics.topArticles.length > 0 ? (
              <div className="space-y-2">
                {analytics.topArticles.map((r, i) => {
                  const client = clients.find(c => c.id === r.client_id);
                  return (
                    <div key={r.id} className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                        style={{ backgroundColor: getScoreColor(r.score) + '20', color: getScoreColor(r.score) }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-gray-700 truncate" title={r.name}>{r.name}</div>
                        <div className="text-[9px] text-gray-400">{client?.name} · {MONTHS[r.month_index]}</div>
                      </div>
                      <div className="text-[11px] font-bold shrink-0" style={{ color: getScoreColor(r.score) }}>
                        {r.score}%
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[11px] text-gray-400">No reports yet.</div>
            )}
          </div>

          {/* Needs attention */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="text-sm font-semibold text-[#1a1a1a] mb-1">Needs Attention</div>
            <div className="text-[10px] text-gray-400 mb-3">Articles scoring below 85%</div>
            {analytics.lowestArticles.length > 0 ? (
              <div className="space-y-2">
                {analytics.lowestArticles.map((r) => {
                  const client = clients.find(c => c.id === r.client_id);
                  return (
                    <div key={r.id} className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px]"
                        style={{ backgroundColor: getScoreColor(r.score) + '20', color: getScoreColor(r.score) }}>
                        !
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-gray-700 truncate" title={r.name}>{r.name}</div>
                        <div className="text-[9px] text-gray-400">{client?.name} · {MONTHS[r.month_index]}</div>
                      </div>
                      <div className="text-[11px] font-bold shrink-0" style={{ color: getScoreColor(r.score) }}>
                        {r.score}%
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[11px] text-green-600">All articles scoring 85%+ 🎉</div>
            )}
          </div>

          {/* Category weaknesses */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="text-sm font-semibold text-[#1a1a1a] mb-1">Category Scores</div>
            <div className="text-[10px] text-gray-400 mb-3">Average across all reports</div>
            {allReports.length > 0 ? (
              <CategoryChart reports={allReports} />
            ) : (
              <div className="text-[11px] text-gray-400">No reports yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
