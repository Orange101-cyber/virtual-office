import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function KeywordBankModal({ open, onClose, clientId, clients }) {
  const [keywords, setKeywords] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const client = clients.find(c => c.id === clientId);

  // Load keywords when opening
  useEffect(() => {
    if (!open || !clientId) return;
    setLoading(true);
    setSavedMsg('');
    supabase
      .from('clients')
      .select('past_keywords')
      .eq('id', clientId)
      .single()
      .then(({ data }) => {
        setKeywords(data?.past_keywords || '');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [open, clientId]);

  const handleSave = async () => {
    if (!clientId) return;
    setSaving(true);
    const { error } = await supabase
      .from('clients')
      .update({ past_keywords: keywords })
      .eq('id', clientId);
    setSaving(false);
    if (!error) {
      setSavedMsg('Keywords saved!');
      setTimeout(() => setSavedMsg(''), 3000);
    } else {
      setSavedMsg('Error saving keywords');
    }
  };

  const keywordCount = keywords.split('\n').filter(l => l.trim()).length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-[10px] w-[520px] max-w-[95vw] max-h-[85vh] shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-[15px] font-semibold text-[#1a1a1a]">
              Keyword Bank — {client?.name || 'Client'}
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Add all past article keywords for this client. These are automatically checked against new reports.
            </p>
          </div>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-gray-400 cursor-pointer text-lg hover:text-[#1a1a1a] p-0"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-sm text-gray-400 py-8 text-center">Loading keywords...</div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Keywords — one per line
                </label>
                <span className="text-[10px] text-gray-400">{keywordCount} keywords</span>
              </div>
              <textarea
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                rows={16}
                placeholder={"real estate west end\nbrisbane property investment\nselling in west end\nproperty market brisbane\n\nAdd one keyword or keyphrase per line.\nThese will be checked for cannibalization\non every new report for this client."}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[12px] bg-[#f8f8f6] resize-y focus:outline-none focus:border-[#F5C518] focus:bg-white font-mono leading-relaxed"
                autoFocus
              />
              <div className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                When you create a new report for {client?.name}, the checker will automatically compare the report's focus keyphrase and secondary keywords against this list to flag any cannibalization.
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 flex items-center gap-3 shrink-0">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-[5px] px-5 py-2 text-xs font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Keywords'}
          </button>
          {savedMsg && (
            <span className={`text-[11px] ${savedMsg.includes('Error') ? 'text-red-500' : 'text-green-600'}`}>
              {savedMsg}
            </span>
          )}
          <button
            onClick={onClose}
            className="ml-auto bg-transparent border border-gray-200 text-gray-500 rounded-[5px] px-4 py-2 text-xs cursor-pointer hover:bg-[#f8f8f6]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
