import { useMemo } from 'react';
import { CHECKS } from '../../data/checklist';

export default function ScoreHistory({ checklistState, reportId }) {
  // Calculate current score
  const currentScore = useMemo(() => {
    const allItems = CHECKS.flatMap(c => c.items);
    const total = allItems.length;
    const passed = allItems.filter(i => checklistState[i.id]).length;
    return Math.round((passed / total) * 100);
  }, [checklistState]);

  // Load history from localStorage
  const history = useMemo(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('seo_score_history') || '{}');
      return stored;
    } catch { return {}; }
  }, []);

  // Get history for current report
  const reportHistory = reportId ? (history[reportId] || []) : [];

  // Save current score to history
  const saveScore = () => {
    const stored = JSON.parse(localStorage.getItem('seo_score_history') || '{}');
    const key = reportId || 'unsaved';
    if (!stored[key]) stored[key] = [];
    stored[key].push({
      score: currentScore,
      date: new Date().toISOString(),
      passed: CHECKS.flatMap(c => c.items).filter(i => checklistState[i.id]).length,
      total: CHECKS.flatMap(c => c.items).length,
    });
    // Keep last 20 entries per report
    if (stored[key].length > 20) stored[key] = stored[key].slice(-20);
    localStorage.setItem('seo_score_history', JSON.stringify(stored));
  };

  const color = currentScore >= 85 ? '#27ae60' : currentScore >= 60 ? '#e67e22' : '#e74c3c';

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
      <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider flex justify-between">
        <span>Score History</span>
        <button
          onClick={saveScore}
          className="bg-transparent border border-white/20 text-white/70 rounded px-2 py-0 text-[9px] cursor-pointer hover:text-[#F5C518] hover:border-[#F5C518]"
        >
          Log Score
        </button>
      </div>
      <div className="p-3.5">
        {/* Current score */}
        <div className="flex items-center gap-3 mb-3">
          <div className="text-[28px] font-bold leading-none" style={{ color }}>
            {currentScore}%
          </div>
          <div className="text-[10px] text-gray-400">Current Score</div>
        </div>

        {/* Mini bar chart of history */}
        {reportHistory.length > 0 ? (
          <>
            <div className="flex items-end gap-[3px] h-12 mb-1">
              {reportHistory.slice(-15).map((entry, i) => {
                const c = entry.score >= 85 ? '#27ae60' : entry.score >= 60 ? '#e67e22' : '#e74c3c';
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm min-w-[4px]"
                    style={{ height: `${entry.score}%`, backgroundColor: c }}
                    title={`${entry.score}% — ${new Date(entry.date).toLocaleDateString()}`}
                  />
                );
              })}
            </div>
            <div className="text-[9px] text-gray-400">
              {reportHistory.length} snapshots logged
              {reportHistory.length >= 2 && (
                <span className="ml-1">
                  — {reportHistory[reportHistory.length - 1].score >= reportHistory[0].score ? '↑' : '↓'}
                  {' '}{Math.abs(reportHistory[reportHistory.length - 1].score - reportHistory[0].score)}% since first
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="text-[11px] text-gray-400">
            Click &ldquo;Log Score&rdquo; after each revision to track progress over time.
          </div>
        )}
      </div>
    </div>
  );
}
