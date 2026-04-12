import { useState } from 'react';
import { CHECKS } from '../../data/checklist';
import { proposeFixForItem } from '../../lib/seoFixer';
import { getClientContext, formatContextForPrompt } from '../../lib/clientContext';
import toast from 'react-hot-toast';

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

function FixProposal({ proposal, onApprove, onReject }) {
  if (!proposal) return null;

  if (!proposal.can_fix) {
    return (
      <div className="mt-2 bg-orange-50 border border-orange-200 rounded-lg p-2.5">
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

  return (
    <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-2.5">
      <div className="text-[10px] font-bold uppercase text-blue-600 mb-1">
        Proposed Fix · Field: <span className="font-mono">{proposal.field_to_update}</span>
      </div>
      <div className="text-[11px] text-gray-700 mb-2 italic">{proposal.explanation}</div>

      {proposal.current_value && (
        <div className="mb-1.5">
          <div className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">Before</div>
          <div className="bg-white border border-red-100 rounded p-2 text-[10px] text-gray-600 max-h-20 overflow-y-auto">
            {proposal.current_value.length > 200 ? proposal.current_value.substring(0, 200) + '...' : proposal.current_value}
          </div>
        </div>
      )}

      <div className="mb-2">
        <div className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">After</div>
        <div className="bg-white border border-green-200 rounded p-2 text-[10px] text-gray-700 max-h-32 overflow-y-auto">
          {proposal.proposed_value?.length > 400 ? proposal.proposed_value.substring(0, 400) + '...' : proposal.proposed_value}
        </div>
        {proposal.proposed_value?.length > 400 && (
          <div className="text-[9px] text-gray-400 mt-0.5">
            Preview truncated · full change will be applied ({proposal.proposed_value.length} chars)
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onApprove}
          className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-[5px] px-3 py-1 text-[10px] font-bold cursor-pointer hover:bg-[#e6b800]"
        >
          ✓ Apply Fix
        </button>
        <button
          onClick={onReject}
          className="bg-transparent border border-gray-300 text-gray-600 rounded-[5px] px-3 py-1 text-[10px] font-semibold cursor-pointer hover:border-gray-400"
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
      {CHECKS.map((cat, ci) => {
        const passed = cat.items.filter((i) => checklistState[i.id]).length;
        const collapsed = collapsedCats.has(ci);

        return (
          <div key={ci}>
            <div
              onClick={() => toggleCat(ci)}
              className="px-3.5 py-1.5 bg-[#f8f8f6] border-b border-t border-gray-200 text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center justify-between cursor-pointer select-none hover:bg-[#f0f0ec] first:border-t-0"
            >
              <span>{cat.cat}</span>
              <span className="font-normal normal-case tracking-normal text-gray-400">
                {passed}/{cat.items.length}
              </span>
            </div>
            {!collapsed &&
              cat.items.map((item) => {
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
                      />
                    )}
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
