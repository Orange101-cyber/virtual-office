import { useState } from 'react';
import ClientBlock from './ClientBlock';

export default function Sidebar({
  clients,
  currentReportId,
  onOpenReport,
  onDeleteReport,
  onAddClient,
  onDeleteClient,
  onNewReport,
  onManageKeywords,
  onAddReport,
  hasReport,
}) {
  const [expandedClients, setExpandedClients] = useState(new Set());
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const toggleClient = (id) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="w-60 bg-[#1e1e1e] text-[#ccc] flex flex-col shrink-0 overflow-hidden border-r border-[#333]">
      <div className="px-3.5 pt-3 pb-2 flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#666]">
          Clients
        </div>
        <button
          onClick={onAddClient}
          className="bg-transparent border border-[#444] text-[#aaa] rounded px-2 py-0.5 text-[11px] cursor-pointer flex items-center gap-1 hover:border-[#F5C518] hover:text-[#F5C518]"
        >
          + Add
        </button>
      </div>

      {/* Year selector */}
      <div className="px-3.5 pb-2 flex items-center gap-1">
        <button
          onClick={() => setYear(y => y - 1)}
          className="bg-transparent border-none text-[#555] cursor-pointer text-xs hover:text-[#F5C518] p-0"
        >
          ◀
        </button>
        <div className="flex-1 text-center text-[11px] font-semibold text-[#888]">
          {year}
        </div>
        <button
          onClick={() => setYear(y => y + 1)}
          disabled={year >= currentYear + 1}
          className="bg-transparent border-none text-[#555] cursor-pointer text-xs hover:text-[#F5C518] p-0 disabled:opacity-20 disabled:cursor-not-allowed"
        >
          ▶
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-3 scrollbar-thin">
        {clients.length === 0 ? (
          <div className="px-3.5 py-4 text-[11px] text-[#555] leading-relaxed">
            No clients yet.<br />
            Click <b className="text-[#888]">+ Add</b> above to get started.
          </div>
        ) : (
          clients.map((client) => (
            <ClientBlock
              key={client.id}
              client={client}
              isExpanded={expandedClients.has(client.id)}
              onToggle={() => toggleClient(client.id)}
              onDelete={() => onDeleteClient(client.id)}
              onManageKeywords={onManageKeywords}
              onAddReport={onAddReport}
              currentReportId={currentReportId}
              onOpenReport={onOpenReport}
              onDeleteReport={onDeleteReport}
              year={year}
            />
          ))
        )}
      </div>

      {hasReport && (
        <div className="px-3.5 py-2.5">
          <button
            onClick={onNewReport}
            className="w-full bg-transparent border border-dashed border-[#3a3a3a] text-[#777] rounded-[5px] py-1.5 text-[11px] cursor-pointer text-center hover:border-[#F5C518] hover:text-[#F5C518]"
          >
            + New Report
          </button>
        </div>
      )}
    </div>
  );
}
