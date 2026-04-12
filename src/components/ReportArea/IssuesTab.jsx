import { CHECKS } from '../../data/checklist';

function ScopeBadge({ scope }) {
  if (scope === 'writing') {
    return <span className="inline-block text-[9px] font-bold uppercase bg-purple-50 text-purple-600 px-1.5 py-0 rounded-full ml-1 align-middle">✍️ Writer</span>;
  }
  if (scope === 'technical') {
    return <span className="inline-block text-[9px] font-bold uppercase bg-gray-100 text-gray-600 px-1.5 py-0 rounded-full ml-1 align-middle">⚙️ Tech</span>;
  }
  return null;
}

export default function IssuesTab({ checklistState }) {
  const allItems = CHECKS.flatMap((c) => c.items);
  const missing = allItems.filter((i) => !checklistState[i.id]);
  const critical = missing.filter((i) => i.crit);
  const remaining = missing.filter((i) => !i.crit);

  const writerIssues = missing.filter(i => i.scope === 'writing');
  const techIssues = missing.filter(i => i.scope === 'technical');

  if (missing.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-green-600">
        ✓ All items complete!
      </div>
    );
  }

  return (
    <div className="p-3.5">
      {/* Split summary */}
      <div className="grid grid-cols-2 gap-2 mb-3 pb-3 border-b border-gray-200">
        <div className="bg-purple-50 rounded-lg p-2">
          <div className="text-[9px] font-bold uppercase text-purple-600">✍️ Writer Issues</div>
          <div className="text-lg font-bold text-purple-700 leading-none mt-1">{writerIssues.length}</div>
          <div className="text-[9px] text-gray-500 mt-0.5">{writerIssues.filter(i => i.crit).length} critical</div>
        </div>
        <div className="bg-gray-100 rounded-lg p-2">
          <div className="text-[9px] font-bold uppercase text-gray-600">⚙️ Tech Issues</div>
          <div className="text-lg font-bold text-gray-700 leading-none mt-1">{techIssues.length}</div>
          <div className="text-[9px] text-gray-500 mt-0.5">{techIssues.filter(i => i.crit).length} critical</div>
        </div>
      </div>

      {critical.length > 0 && (
        <>
          <p className="text-[11px] font-bold text-red-500 mb-1.5">
            Critical ({critical.length})
          </p>
          {critical.map((item) => (
            <div key={item.id} className="flex items-start gap-1.5 py-1 border-b border-gray-200 text-[11px] last:border-b-0">
              <div className="w-3 h-3 rounded-full bg-red-500 text-white flex items-center justify-center shrink-0 mt-0.5 text-[8px] font-bold">
                !
              </div>
              <div className="flex-1">
                {item.label}
                <ScopeBadge scope={item.scope} />
              </div>
            </div>
          ))}
        </>
      )}
      {remaining.length > 0 && (
        <>
          <p className="text-[11px] font-bold text-orange-500 mt-3 mb-1.5">
            Remaining ({remaining.length})
          </p>
          {remaining.map((item) => (
            <div key={item.id} className="flex items-start gap-1.5 py-1 border-b border-gray-200 text-[11px] last:border-b-0">
              <div className="w-3 h-3 rounded-full bg-orange-500 text-white flex items-center justify-center shrink-0 mt-0.5 text-[8px]">
                ●
              </div>
              <div className="flex-1">
                {item.label}
                <ScopeBadge scope={item.scope} />
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
