import { CHECKS } from '../../data/checklist';

function getScoreData(checklistState) {
  const allItems = CHECKS.flatMap(c => c.items);
  const total = allItems.length;
  const passed = allItems.filter(i => checklistState[i.id]).length;
  const pct = Math.round((passed / total) * 100);
  return { passed, total, pct };
}

export default function ExportPdf({ fields, checklistState, aiFindings, gscData }) {
  const handleExport = () => {
    const { passed, total, pct } = getScoreData(checklistState);

    // Build category breakdown
    const catBreakdown = CHECKS.map(cat => {
      const catPassed = cat.items.filter(i => checklistState[i.id]).length;
      return `  ${cat.cat}: ${catPassed}/${cat.items.length}`;
    }).join('\n');

    // Failed items
    const failedItems = CHECKS.flatMap(c => c.items)
      .filter(i => !checklistState[i.id])
      .map(i => `  ${i.crit ? '[CRITICAL] ' : ''}${i.label}`)
      .join('\n');

    // AI findings
    let aiSection = '';
    if (aiFindings?.wins?.length || aiFindings?.fixes?.length) {
      aiSection = '\n\nAI ANALYSIS\n' + '─'.repeat(40) + '\n';
      if (aiFindings.word_count) aiSection += `Word Count: ${aiFindings.word_count}\n`;
      if (aiFindings.h1_found) aiSection += `H1 Found: ${aiFindings.h1_found}\n`;
      if (aiFindings.internal_links !== undefined) aiSection += `Internal Links: ${aiFindings.internal_links}\n`;
      if (aiFindings.wins?.length) {
        aiSection += '\nStrengths:\n' + aiFindings.wins.map(w => `  ✓ ${w}`).join('\n');
      }
      if (aiFindings.fixes?.length) {
        aiSection += '\n\nFixes Needed:\n' + aiFindings.fixes.map(f => `  ✗ ${f}`).join('\n');
      }
      if (aiFindings.notes) {
        aiSection += `\n\nNotes: ${aiFindings.notes}`;
      }
    }

    // GSC data
    let gscSection = '';
    if (gscData?.w1_imp || gscData?.w4_imp) {
      gscSection = '\n\nGSC PERFORMANCE\n' + '─'.repeat(40) + '\n';
      if (gscData.w1_imp) gscSection += `Week 1-2: ${gscData.w1_imp} imp, ${gscData.w1_clk} clicks, pos ${gscData.w1_pos}\n`;
      if (gscData.w4_imp) gscSection += `Week 4:   ${gscData.w4_imp} imp, ${gscData.w4_clk} clicks, pos ${gscData.w4_pos}\n`;
      if (gscData.queries) gscSection += `Top Queries: ${gscData.queries}\n`;
    }

    const report = `
╔══════════════════════════════════════════╗
║         CYL SEO BLOG CHECKER REPORT     ║
╚══════════════════════════════════════════╝

Generated: ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}

ARTICLE DETAILS
${'─'.repeat(40)}
Title: ${fields.article_title || '(not set)'}
URL: ${fields.url || '(not set)'}
Focus Keyphrase: ${fields.focus_keyphrase || '(not set)'}
Secondary Keywords: ${fields.secondary_keywords || '(not set)'}
Meta Description: ${fields.meta_description || '(not set)'}
Meta Length: ${fields.meta_description?.length || 0} chars

OVERALL SCORE
${'─'.repeat(40)}
Score: ${pct}% (${passed}/${total} items passed)
Status: ${pct >= 85 ? 'Ready to publish' : pct >= 60 ? 'Good progress — a few things to fix' : 'Needs work before publishing'}

CATEGORY BREAKDOWN
${'─'.repeat(40)}
${catBreakdown}

ITEMS TO FIX (${total - passed} remaining)
${'─'.repeat(40)}
${failedItems || '  All items complete!'}
${aiSection}${gscSection}

${'─'.repeat(40)}
Report by CYL SEO Blog Checker
Campaigns You Love · cylglobal.com
`.trim();

    // Create and download as text file
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SEO-Report-${(fields.article_title || 'Untitled').replace(/[^a-zA-Z0-9]/g, '-').substring(0, 40)}-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      className="bg-transparent border border-gray-300 text-gray-600 rounded-[5px] px-4 py-2 text-[11px] font-semibold cursor-pointer hover:border-[#F5C518] hover:text-[#1a1a1a] flex items-center gap-1.5"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Export Report
    </button>
  );
}
