import { useState } from 'react';
import ReportItem from './ReportItem';

export default function MonthBlock({
  monthName,
  reports,
  currentReportId,
  onOpenReport,
  onDeleteReport,
  defaultOpen = false,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <div
        onClick={() => setOpen(!open)}
        className="flex items-center py-1 px-3.5 pl-7 cursor-pointer gap-1.5 select-none hover:bg-[#252525]"
      >
        <span
          className={`text-[9px] text-[#555] shrink-0 transition-transform duration-150 ${
            open ? 'rotate-90 text-[#777]' : ''
          }`}
        >
          ▶
        </span>
        <span className="text-[11px] text-[#aaa] flex-1">{monthName}</span>
        <span className="text-[10px] text-[#555] shrink-0">
          {reports.length || ''}
        </span>
      </div>
      {open && (
        <div>
          {reports.map((r) => (
            <ReportItem
              key={r.id}
              name={r.name}
              isActive={r.id === currentReportId}
              onOpen={() => onOpenReport(r.id)}
              onDelete={() => onDeleteReport(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
