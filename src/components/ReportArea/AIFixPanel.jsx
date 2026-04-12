import { useState } from 'react';
import { CHECKS } from '../../data/checklist';
import { downloadTemplateFile } from '../../lib/templateExport';
import * as dfs from '../../lib/dataForSeo';
import toast from 'react-hot-toast';

export default function AIFixPanel({ fields, checklistState, clientName }) {
  const [validating, setValidating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [keywordValidation, setKeywordValidation] = useState(null);

  // Get all failed checks
  const allItems = CHECKS.flatMap(c => c.items);
  const failedItems = allItems.filter(i => !checklistState[i.id]);
  const criticalFailed = failedItems.filter(i => i.crit);

  const handleExportTemplate = async () => {
    setExporting(true);
    try {
      await downloadTemplateFile(fields, clientName || 'Article');
      toast.success('Template exported as .docx');
    } catch (err) {
      toast.error('Export error: ' + err.message);
    }
    setExporting(false);
  };

  const handleValidateKeyword = async () => {
    if (!fields.focus_keyphrase) {
      toast.error('Enter a focus keyphrase first');
      return;
    }
    if (!dfs.isConfigured()) {
      toast.error('DataForSEO not configured');
      return;
    }
    setValidating(true);
    setKeywordValidation(null);
    try {
      // Fetch real metrics for the focus keyphrase and secondary keywords
      const keywords = [fields.focus_keyphrase];
      if (fields.secondary_keywords) {
        fields.secondary_keywords.split(',').forEach(k => {
          const trimmed = k.trim();
          if (trimmed) keywords.push(trimmed);
        });
      }

      const metrics = await dfs.getKeywordMetrics(keywords);
      const validation = metrics.map(m => ({
        keyword: m.keyword,
        sv: m.search_volume,
        kd: m.kd,
        cpc: m.cpc,
        valid: m.search_volume > 0,
      }));

      setKeywordValidation(validation);

      const valid = validation.filter(v => v.valid).length;
      const total = validation.length;
      if (valid === total) {
        toast.success(`All ${total} keywords validated with real search volume`);
      } else {
        toast(`${valid}/${total} keywords have real search volume — review below`);
      }
    } catch (err) {
      toast.error('Validation error: ' + err.message);
    }
    setValidating(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden mb-4">
      <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider flex justify-between items-center">
        <span>AI Fix & Validate</span>
        <span className="text-[9px] text-white/50 font-normal normal-case">
          {failedItems.length} issues · {criticalFailed.length} critical
        </span>
      </div>
      <div className="p-3.5">
        <div className="text-[10px] text-gray-400 mb-3 leading-relaxed">
          Click <b>⚡ Fix</b> next to any red item below to get a proposed fix you can review and approve. Validate your keywords are real and have search volume. Export the cleaned article in CYL template format.
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleValidateKeyword}
            disabled={validating || !fields.focus_keyphrase}
            className="bg-transparent border border-gray-300 text-gray-700 rounded-[5px] px-3 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-[#F5C518] disabled:opacity-40"
          >
            {validating ? 'Checking...' : '🔍 Validate Keywords'}
          </button>

          <button
            onClick={handleExportTemplate}
            disabled={exporting}
            className="bg-transparent border border-gray-300 text-gray-700 rounded-[5px] px-3 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-[#F5C518] flex items-center gap-1.5 disabled:opacity-40"
          >
            {exporting ? 'Generating...' : '📄 Export to Template (.docx)'}
          </button>
        </div>

        {/* Keyword validation results */}
        {keywordValidation && keywordValidation.length > 0 && (
          <div className="mt-3 bg-[#f8f8f6] rounded-lg p-3">
            <div className="text-[10px] font-bold uppercase text-gray-500 mb-2">Keyword Validation (DataForSEO)</div>
            <div className="space-y-1.5">
              {keywordValidation.map((v, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[8px] font-bold ${v.valid ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                    {v.valid ? '✓' : '✗'}
                  </span>
                  <span className="flex-1 text-gray-700 truncate">{v.keyword}</span>
                  <span className="text-gray-500 text-[10px] shrink-0">SV: <b className={v.valid ? 'text-[#1a1a1a]' : 'text-red-500'}>{v.sv.toLocaleString()}</b></span>
                  {v.kd != null && <span className="text-gray-500 text-[10px] shrink-0">KD: <b className={v.kd <= 20 ? 'text-green-600' : v.kd <= 50 ? 'text-orange-500' : 'text-red-500'}>{v.kd}</b></span>}
                </div>
              ))}
            </div>
            {keywordValidation.some(v => !v.valid) && (
              <div className="text-[10px] text-red-600 mt-2">
                ⚠ Some keywords have zero search volume — verify they're real and spelled correctly.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
