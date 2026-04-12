import { useState } from 'react';
import { CHECKS } from '../../data/checklist';
import { fixSeoIssues } from '../../lib/seoFixer';
import { exportToTemplate, downloadTemplateFile } from '../../lib/templateExport';
import { getClientContext, formatContextForPrompt } from '../../lib/clientContext';
import * as dfs from '../../lib/dataForSeo';
import toast from 'react-hot-toast';

export default function AIFixPanel({ fields, checklistState, clientName, onFieldChange, onChecklistUpdate }) {
  const [fixing, setFixing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [lastFix, setLastFix] = useState(null);
  const [keywordValidation, setKeywordValidation] = useState(null);

  // Get all failed checks
  const allItems = CHECKS.flatMap(c => c.items);
  const failedItems = allItems.filter(i => !checklistState[i.id]);
  const criticalFailed = failedItems.filter(i => i.crit);
  const autoFixable = failedItems.filter(i => {
    // Items that can be auto-fixed by editing fields
    const fixable = [
      'meta_title_kw', 'meta_title_len', 'meta_desc_kw', 'meta_desc_len',
      'meta_slug', 'kw_h1', 'kw_first100', 'kw_density', 'kw_secondary',
      'kw_variations', 'kw_wordcount', 'kw_toc', 'kw_faq',
      'h_one_h1', 'h_has_h2', 'h_kw_in_h', 'h_intro',
      'link_internal', 'link_external', 'link_cta_top', 'link_cta_bot',
      'eeat_author', 'eeat_date', 'eeat_location', 'eeat_data',
      'ux_scannable',
    ];
    return fixable.includes(i.id);
  });

  const handleFixAll = async () => {
    if (autoFixable.length === 0) {
      toast('Nothing to auto-fix');
      return;
    }
    if (!fields.article_content?.trim()) {
      toast.error('Add article content first');
      return;
    }

    setFixing(true);
    try {
      const ctx = clientName ? await getClientContext(clientName) : null;
      const clientContextText = ctx ? formatContextForPrompt(ctx) : '';

      const result = await fixSeoIssues({
        fields,
        failedItemIds: autoFixable.map(i => i.id),
        clientContextText,
      });

      // Apply updated fields
      const updates = result.updated_fields || {};
      Object.entries(updates).forEach(([key, value]) => {
        if (value && value !== 'null' && value !== fields[key]) {
          onFieldChange(key, value);
        }
      });

      // Mark the fixed items as complete in the checklist
      if (result.fixes_applied && onChecklistUpdate) {
        const fixedIds = result.fixes_applied.map(f => f.check_id);
        onChecklistUpdate(fixedIds);
      }

      setLastFix(result);
      const count = result.fixes_applied?.length || 0;
      toast.success(`Applied ${count} fixes`);
    } catch (err) {
      toast.error('Fix error: ' + err.message);
    }
    setFixing(false);
  };

  const handleExportTemplate = () => {
    const doc = exportToTemplate({ fields, clientName });
    const fileName = `${clientName || 'Article'} - ${fields.article_title || 'Blog'}`.replace(/[^a-zA-Z0-9 -]/g, '').substring(0, 60) + '.txt';
    downloadTemplateFile(doc, fileName);
    toast.success('Template exported!');
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
          AI can automatically fix red checklist items by editing your article content, meta, and title. DataForSEO validates your keywords are real and have search volume.
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleFixAll}
            disabled={fixing || autoFixable.length === 0}
            className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-[5px] px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {fixing ? 'Fixing...' : `⚡ Fix ${autoFixable.length} Issues`}
          </button>

          <button
            onClick={handleValidateKeyword}
            disabled={validating || !fields.focus_keyphrase}
            className="bg-transparent border border-gray-300 text-gray-700 rounded-[5px] px-3 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-[#F5C518] disabled:opacity-40"
          >
            {validating ? 'Checking...' : '🔍 Validate Keywords'}
          </button>

          <button
            onClick={handleExportTemplate}
            className="bg-transparent border border-gray-300 text-gray-700 rounded-[5px] px-3 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-[#F5C518] flex items-center gap-1.5"
          >
            📄 Export to Template
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

        {/* Last fix results */}
        {lastFix && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="text-[10px] font-bold uppercase text-green-700 mb-2">Last AI Fix Report</div>
            {lastFix.fixes_applied?.length > 0 && (
              <div className="space-y-1 mb-2">
                {lastFix.fixes_applied.map((f, i) => (
                  <div key={i} className="text-[10px] text-green-700">
                    <span className="font-semibold">✓ {f.description}</span>
                    {f.after && <div className="text-[9px] text-green-600 mt-0.5 truncate">→ {f.after.substring(0, 80)}</div>}
                  </div>
                ))}
              </div>
            )}
            {lastFix.cannot_auto_fix?.length > 0 && (
              <div className="pt-2 border-t border-green-200">
                <div className="text-[9px] font-bold uppercase text-orange-600 mb-1">Needs Manual Fix</div>
                {lastFix.cannot_auto_fix.map((f, i) => (
                  <div key={i} className="text-[9px] text-gray-600 mb-0.5">
                    <span className="font-semibold">{f.check_id}:</span> {f.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
