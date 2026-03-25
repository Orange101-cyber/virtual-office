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
}) {
  const [expandedClients, setExpandedClients] = useState(new Set());
  const year = new Date().getFullYear();

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
              currentReportId={currentReportId}
              onOpenReport={onOpenReport}
              onDeleteReport={onDeleteReport}
              year={year}
            />
          ))
        )}
      </div>

      <div className="px-3.5 py-2.5">
        <button
          onClick={onNewReport}
          className="w-full bg-transparent border border-dashed border-[#3a3a3a] text-[#777] rounded-[5px] py-1.5 text-[11px] cursor-pointer text-center hover:border-[#F5C518] hover:text-[#F5C518]"
        >
          + New Report
        </button>
      </div>
    </div>
  );
}
