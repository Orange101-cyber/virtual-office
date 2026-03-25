import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { MONTHS } from '../../data/checklist';
import MonthBlock from './MonthBlock';

export default function ClientBlock({
  client,
  isExpanded,
  onToggle,
  onDelete,
  currentReportId,
  onOpenReport,
  onDeleteReport,
  year,
}) {
  const [reports, setReports] = useState([]);

  useEffect(() => {
    if (!isExpanded) return;

    const fetchReports = async () => {
      const { data } = await supabase
        .from('reports')
        .select('id, name, month_index, saved_at')
        .eq('client_id', client.id)
        .eq('year', year)
        .order('saved_at');
      setReports(data || []);
    };

    fetchReports();
  }, [isExpanded, client.id, year, currentReportId]);

  const reportsByMonth = MONTHS.reduce((acc, _, idx) => {
    acc[idx] = reports.filter((r) => r.month_index === idx);
    return acc;
  }, {});

  return (
    <div className="border-b border-[#2a2a2a]">
      <div
        onClick={onToggle}
        className={`flex items-center py-2 px-3.5 cursor-pointer select-none gap-1.5 hover:bg-[#2a2a2a] ${
          isExpanded ? 'bg-[#2a2a2a]' : ''
        }`}
      >
        <span
          className={`text-[9px] text-[#555] shrink-0 transition-transform duration-150 ${
            isExpanded ? 'rotate-90 text-[#888]' : ''
          }`}
        >
          ▶
        </span>
        <span className="text-xs font-semibold text-[#ddd] flex-1 whitespace-nowrap overflow-hidden text-ellipsis">
          {client.name}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="bg-transparent border-none text-[#444] cursor-pointer text-xs p-0 shrink-0 hover:text-red-500"
          title="Delete client"
        >
          ✕
        </button>
      </div>
      {isExpanded && (
        <div>
          {MONTHS.map((month, idx) => (
            <MonthBlock
              key={idx}
              monthName={`${month} ${year}`}
              reports={reportsByMonth[idx]}
              currentReportId={currentReportId}
              onOpenReport={onOpenReport}
              onDeleteReport={onDeleteReport}
              defaultOpen={reportsByMonth[idx].length > 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
