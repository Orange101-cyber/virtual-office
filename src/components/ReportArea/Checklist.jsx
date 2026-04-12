import { useState, useMemo } from 'react';
import { CHECKS } from '../../data/checklist';
import { proposeFixForItem } from '../../lib/seoFixer';
import { getClientContext, formatContextForPrompt } from '../../lib/clientContext';
import toast from 'react-hot-toast';

// Find the common prefix and suffix between two strings to highlight what changed
function computeDiff(before, after) {
  if (!before) return { commonStart: 0, commonEnd: 0, beforeMiddle: '', afterMiddle: after || '' };
  if (!after) return { commonStart: 0, commonEnd: 0, beforeMiddle: before, afterMiddle: '' };

  // Find common start
  let start = 0;
  const minLen = Math.min(before.length, after.length);
  while (start < minLen && before[start] === after[start]) start++;

  // Find common end (don't cross into start)
  let end = 0;
  while (end < minLen - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;

  return {
    commonStart: start,
    commonEnd: end,
    beforeStart: before.substring(0, start),
    beforeMiddle: before.substring(start, before.length - end),
    beforeEnd: before.substring(before.length - end),
    afterStart: after.substring(0, start),
    afterMiddle: after.substring(start, after.length - end),
    afterEnd: after.substring(after.length - end),
  };
}

// Full-screen modal to inspect a proposal
function FixModal({ proposal, onClose, onApprove, onReject }) {
  const [viewMode, setViewMode] = useState('side-by-side'); // 'side-by-side' | 'diff' | 'after-only'
  const diff = useMemo(() => computeDiff(proposal.current_value || '', proposal.proposed_value || ''), [proposal]);

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-[1400px] max-h-[92vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
              Review Fix · <span className="font-mono text-gray-600">{proposal.field_to_update}</span>
            </div>
            <div className="text-sm font-semibold text-[#1a1a1a] mt-0.5">{proposal.explanation}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => setViewMode('side-by-side')}
                className={`px-2.5 py-1 text-[10px] font-semibold rounded-md cursor-pointer border-none ${viewMode === 'side-by-side' ? 'bg-white text-[#1a1a1a] shadow-sm' : 'bg-transparent text-gray-500'}`}>
                Side-by-Side
              </button>
              <button onClick={() => setViewMode('diff')}
                className={`px-2.5 py-1 text-[10px] font-semibold rounded-md cursor-pointer border-none ${viewMode === 'diff' ? 'bg-white text-[#1a1a1a] shadow-sm' : 'bg-transparent text-gray-500'}`}>
                Diff
              </button>
              <button onClick={() => setViewMode('after-only')}
                className={`px-2.5 py-1 text-[10px] font-semibold rounded-md cursor-pointer border-none ${viewMode === 'after-only' ? 'bg-white text-[#1a1a1a] shadow-sm' : 'bg-transparent text-gray-500'}`}>
                After Only
              </button>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-[#1a1a1a] bg-transparent border-none text-xl cursor-pointer leading-none p-1">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {viewMode === 'side-by-side' && (
            <div className="h-full grid grid-cols-2 divide-x divide-gray-200">
              <div className="flex flex-col overflow-hidden">
                <div className="px-4 py-2 bg-red-50 border-b border-red-100">
                  <div className="text-[10px] font-bold uppercase text-red-600">Before</div>
                  <div className="text-[9px] text-gray-500">{(proposal.current_value || '').length.toLocaleString()} chars</div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <pre className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-wrap font-sans">{proposal.current_value || '(empty)'}</pre>
                </div>
              </div>
              <div className="flex flex-col overflow-hidden">
                <div className="px-4 py-2 bg-green-50 border-b border-green-100">
                  <div className="text-[10px] font-bold uppercase text-green-600">After</div>
                  <div className="text-[9px] text-gray-500">{(proposal.proposed_value || '').length.toLocaleString()} chars</div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <pre className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-wrap font-sans">{proposal.proposed_value || '(empty)'}</pre>
                </div>
              </div>
            </div>
          )}

          {viewMode === 'diff' && (
            <div className="h-full overflow-y-auto p-6 bg-[#fafafa]">
              <div className="text-[10px] text-gray-400 uppercase font-bold mb-3">
                Changed Content — unchanged parts shown in grey, additions in green, removals in red
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <pre className="text-[13px] leading-relaxed whitespace-pre-wrap font-sans">
                  <span className="text-gray-400">{diff.beforeStart || diff.afterStart}</span>
                  {diff.beforeMiddle && (
                    <span className="bg-red-100 text-red-800 line-through px-0.5 rounded">{diff.beforeMiddle}</span>
                  )}
                  {diff.afterMiddle && (
                    <span className="bg-green-100 text-green-800 px-0.5 rounded">{diff.afterMiddle}</span>
                  )}
                  <span className="text-gray-400">{diff.beforeEnd || diff.afterEnd}</span>
                </pre>
              </div>
              {diff.beforeMiddle?.length === 0 && diff.afterMiddle?.length === 0 && (
                <div className="text-center text-gray-400 text-sm mt-4">No changes detected</div>
              )}
            </div>
          )}

          {viewMode === 'after-only' && (
            <div className="h-full overflow-y-auto p-6 bg-[#fafafa]">
              <div className="text-[10px] text-gray-400 uppercase font-bold mb-3">
                Proposed new content — this is what will replace the current value
              </div>
              <div className="bg-white rounded-lg border border-green-200 p-5">
                <pre className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap font-sans">{proposal.proposed_value || '(empty)'}</pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between shrink-0 bg-[#fafafa]">
          <div className="text-[10px] text-gray-500">
            Review carefully — this will {proposal.current_value ? 'replace' : 'set'} the <span className="font-mono font-semibold">{proposal.field_to_update}</span> field.
          </div>
          <div className="flex gap-2">
            <button onClick={onReject}
              className="bg-transparent border border-gray-300 text-gray-600 rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer hover:border-gray-400">
              Reject
            </button>
            <button onClick={onApprove}
              className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-lg px-5 py-2 text-xs font-bold cursor-pointer hover:bg-[#e6b800]">
              ✓ Apply Fix
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Items that can be auto-fixed
const AUTO_FIXABLE = new Set([
  'meta_title_kw', 'meta_title_len', 'meta_desc_kw', 'meta_desc_len', 'meta_slug',
  'kw_h1', 'kw_first100', 'kw_density', 'kw_secondary', 'kw_variations',
  'kw_wordcount', 'kw_toc', 'kw_faq',
  'h_one_h1', 'h_has_h2', 'h_kw_in_h', 'h_intro',
  'link_internal', 'link_external', 'link_cta_top', 'link_cta_bot',
  'eeat_author', 'eeat_date', 'eeat_location', 'eeat_data',
  'ux_scannable', 'ux_related',
]);

function FixProposal({ proposal, onApprove, onReject, onExpand }) {
  if (!proposal) return null;

  if (!proposal.can_fix) {
    return (
      <div className="mt-2 bg-orange-50 border border-orange-200 rounded-lg p-3">
        <div className="text-[10px] font-bold uppercase text-orange-600 mb-1">Cannot Auto-Fix</div>
        <div className="text-[11px] text-gray-700 mb-1.5">{proposal.reason}</div>
        {proposal.manual_instructions && (
          <div className="text-[10px] text-gray-500">
            <b>How to fix manually:</b> {proposal.manual_instructions}
          </div>
        )}
        <button
          onClick={onReject}
          className="mt-2 text-[9px] text-gray-500 hover:text-[#1a1a1a] bg-transparent border-none cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    );
  }

  const beforeLen = (proposal.current_value || '').length;
  const afterLen = (proposal.proposed_value || '').length;
  const isLong = beforeLen > 300 || afterLen > 300;

  // For short content, show inline side-by-side
  // For long content, show a compact summary with Expand button
  return (
    <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-bold uppercase text-blue-600 mb-0.5">
            Proposed Fix · Field: <span className="font-mono">{proposal.field_to_update}</span>
          </div>
          <div className="text-[11px] text-gray-700 italic leading-relaxed">{proposal.explanation}</div>
        </div>
        <button
          onClick={onExpand}
          className="shrink-0 text-[9px] font-bold bg-white border border-blue-300 text-blue-600 rounded px-2 py-1 cursor-pointer hover:bg-blue-100 flex items-center gap-1"
          title="Open full review"
        >
          ⛶ Expand
        </button>
      </div>

      {/* Content preview */}
      {isLong ? (
        // Long content: compact summary
        <div className="bg-white border border-gray-200 rounded-lg p-2.5 mb-2">
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <div className="font-bold uppercase text-red-500 mb-0.5">Before</div>
              <div className="text-gray-500">{beforeLen.toLocaleString()} chars</div>
            </div>
            <div>
              <div className="font-bold uppercase text-green-600 mb-0.5">After</div>
              <div className="text-gray-500">
                {afterLen.toLocaleString()} chars
                {afterLen > beforeLen && <span className="text-green-600"> (+{(afterLen - beforeLen).toLocaleString()})</span>}
                {afterLen < beforeLen && <span className="text-red-500"> ({(afterLen - beforeLen).toLocaleString()})</span>}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-gray-400 mt-2 italic">
            Content is too long to preview inline. Click <b className="text-blue-600">⛶ Expand</b> to review the full change before applying.
          </div>
        </div>
      ) : (
        // Short content: show both inline with proper wrapping
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
          <div>
            <div className="text-[9px] font-bold text-red-500 uppercase mb-1">Before</div>
            <div className="bg-white border border-red-100 rounded-lg p-2.5 text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
              {proposal.current_value || <span className="text-gray-300 italic">(empty)</span>}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-bold text-green-600 uppercase mb-1">After</div>
            <div className="bg-white border border-green-200 rounded-lg p-2.5 text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
              {proposal.proposed_value || <span className="text-gray-300 italic">(empty)</span>}
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={onApprove}
          className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-[5px] px-3 py-1.5 text-[10px] font-bold cursor-pointer hover:bg-[#e6b800]"
        >
          ✓ Apply Fix
        </button>
        <button
          onClick={onReject}
          className="bg-transparent border border-gray-300 text-gray-600 rounded-[5px] px-3 py-1.5 text-[10px] font-semibold cursor-pointer hover:border-gray-400"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

export default function Checklist({ checklistState, onToggle, fields, onFieldChange, clientName }) {
  const [collapsedCats, setCollapsedCats] = useState(new Set());
  const [proposalsByItem, setProposalsByItem] = useState({});
  const [loadingItem, setLoadingItem] = useState(null);
  const [expandedItem, setExpandedItem] = useState(null);
  const [scopeFilter, setScopeFilter] = useState('all'); // 'all' | 'writing' | 'technical'

  const toggleCat = (idx) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleProposeFix = async (item) => {
    if (!fields?.article_content?.trim()) {
      toast.error('Add article content first');
      return;
    }
    setLoadingItem(item.id);
    try {
      const ctx = clientName ? await getClientContext(clientName) : null;
      const clientContextText = ctx ? formatContextForPrompt(ctx) : '';

      const proposal = await proposeFixForItem({
        fields,
        checkItem: item,
        clientContextText,
      });
      setProposalsByItem(prev => ({ ...prev, [item.id]: proposal }));
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
    setLoadingItem(null);
  };

  const handleApprove = (itemId) => {
    const proposal = proposalsByItem[itemId];
    if (!proposal || !proposal.can_fix) return;
    if (onFieldChange) {
      onFieldChange(proposal.field_to_update, proposal.proposed_value);
    }
    if (!checklistState[itemId] && onToggle) {
      onToggle(itemId);
    }
    setProposalsByItem(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    toast.success('Fix applied');
  };

  const handleReject = (itemId) => {
    setProposalsByItem(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  return (
    <div>
      {/* Scope filter */}
      <div className="flex items-center gap-1 px-3.5 py-2 border-b border-gray-200 bg-white">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mr-2">View:</span>
        <button onClick={() => setScopeFilter('all')}
          className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border cursor-pointer ${scopeFilter === 'all' ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
          All Items
        </button>
        <button onClick={() => setScopeFilter('writing')}
          className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border cursor-pointer ${scopeFilter === 'writing' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
          ✍️ Writer Only
        </button>
        <button onClick={() => setScopeFilter('technical')}
          className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border cursor-pointer ${scopeFilter === 'technical' ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
          ⚙️ Tech Only
        </button>
        <span className="text-[9px] text-gray-400 ml-auto">
          {scopeFilter === 'writing' && 'Showing items SEO writers control'}
          {scopeFilter === 'technical' && 'Showing post-publish/admin items'}
          {scopeFilter === 'all' && 'Showing all items'}
        </span>
      </div>

      {CHECKS.map((cat, ci) => {
        // Filter items by scope
        const visibleItems = scopeFilter === 'all'
          ? cat.items
          : cat.items.filter(i => i.scope === scopeFilter);

        // Skip categories with no visible items
        if (visibleItems.length === 0) return null;

        const passed = visibleItems.filter((i) => checklistState[i.id]).length;
        const collapsed = collapsedCats.has(ci);

        return (
          <div key={ci}>
            <div
              onClick={() => toggleCat(ci)}
              className="px-3.5 py-1.5 bg-[#f8f8f6] border-b border-t border-gray-200 text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center justify-between cursor-pointer select-none hover:bg-[#f0f0ec] first:border-t-0"
            >
              <span>{cat.cat}</span>
              <span className="font-normal normal-case tracking-normal text-gray-400">
                {passed}/{visibleItems.length}
              </span>
            </div>
            {!collapsed &&
              visibleItems.map((item) => {
                const isChecked = checklistState[item.id];
                const canFix = !isChecked && AUTO_FIXABLE.has(item.id);
                const proposal = proposalsByItem[item.id];
                const isLoading = loadingItem === item.id;

                return (
                  <div
                    key={item.id}
                    className={`px-3.5 py-2 border-b border-gray-200 last:border-b-0 hover:bg-[#f8f8f6] ${
                      isChecked ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked || false}
                        onChange={() => onToggle(item.id)}
                        className="mt-0.5 w-3 h-3 shrink-0 cursor-pointer accent-[#1a1a1a]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs leading-snug ${isChecked ? 'line-through text-gray-400' : ''}`}>
                          {item.label}
                          {item.crit && (
                            <span className="inline-block text-[9px] font-bold uppercase bg-red-50 text-red-500 px-1 py-0 rounded ml-1 align-middle">
                              Critical
                            </span>
                          )}
                          {item.isNew && (
                            <span className="inline-block text-[9px] font-bold uppercase bg-blue-50 text-blue-700 px-1 py-0 rounded ml-1 align-middle">
                              Add this
                            </span>
                          )}
                          {item.auto && (
                            <span className="inline-block text-[9px] font-bold uppercase bg-blue-100 text-blue-700 px-1.5 py-0 rounded-full ml-1 align-middle">
                              Auto
                            </span>
                          )}
                          {item.scope === 'writing' && (
                            <span className="inline-block text-[9px] font-bold uppercase bg-purple-50 text-purple-600 px-1.5 py-0 rounded-full ml-1 align-middle" title="Writer's responsibility">
                              ✍️ Writer
                            </span>
                          )}
                          {item.scope === 'technical' && (
                            <span className="inline-block text-[9px] font-bold uppercase bg-gray-100 text-gray-600 px-1.5 py-0 rounded-full ml-1 align-middle" title="Technical/post-publish admin work">
                              ⚙️ Tech
                            </span>
                          )}
                        </div>
                        {item.note && (
                          <div className="text-[10px] text-gray-400 mt-0.5">{item.note}</div>
                        )}
                      </div>
                      {canFix && !proposal && (
                        <button
                          onClick={() => handleProposeFix(item)}
                          disabled={isLoading || !onFieldChange}
                          className="shrink-0 text-[9px] font-bold bg-[#F5C518] text-[#1a1a1a] border-none rounded px-2 py-0.5 cursor-pointer hover:bg-[#e6b800] disabled:opacity-40"
                        >
                          {isLoading ? '...' : '⚡ Fix'}
                        </button>
                      )}
                    </div>
                    {proposal && (
                      <FixProposal
                        proposal={proposal}
                        onApprove={() => handleApprove(item.id)}
                        onReject={() => handleReject(item.id)}
                        onExpand={() => setExpandedItem(item.id)}
                      />
                    )}
                  </div>
                );
              })}
          </div>
        );
      })}

      {/* Full-screen fix review modal */}
      {expandedItem && proposalsByItem[expandedItem] && (
        <FixModal
          proposal={proposalsByItem[expandedItem]}
          onClose={() => setExpandedItem(null)}
          onApprove={() => {
            handleApprove(expandedItem);
            setExpandedItem(null);
          }}
          onReject={() => {
            handleReject(expandedItem);
            setExpandedItem(null);
          }}
        />
      )}
    </div>
  );
}
