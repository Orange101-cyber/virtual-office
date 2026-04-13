import { useState } from 'react';
import { downloadTemplateFile } from '../../lib/templateExport';
import toast from 'react-hot-toast';

// Small copy button — scoped to the preview so labels fit the context
function Copy({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e) => {
    e?.stopPropagation();
    if (!text) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success('Copied');
    } else {
      toast.error('Clipboard unavailable');
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="text-[9px] font-bold uppercase text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded px-1.5 py-0.5 cursor-pointer inline-flex items-center gap-1 shrink-0 ml-2 no-print"
      title="Copy to clipboard"
    >
      {copied ? '✓' : '📋'} {label}
    </button>
  );
}

// Parse simple markdown-ish article content into document-style blocks
function renderArticleContent(content) {
  if (!content?.trim()) {
    return (
      <p className="text-gray-300 italic text-center py-6">
        Paste your article content in the inputs above to see it rendered here.
      </p>
    );
  }

  const lines = content.split('\n');
  const blocks = [];
  let listItems = [];
  let inList = false;

  const flushList = () => {
    if (listItems.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc pl-6 my-2 space-y-1">
          {listItems.map((li, i) => <li key={i} className="text-[13px] text-gray-800 leading-relaxed">{li}</li>)}
        </ul>
      );
      listItems = [];
    }
    inList = false;
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }
    if (line.startsWith('# ')) {
      flushList();
      blocks.push(
        <h1 key={idx} className="text-[22px] font-bold text-[#1F4E79] mt-5 mb-3 leading-tight">
          {line.replace(/^# /, '')}
        </h1>
      );
    } else if (line.startsWith('## ')) {
      flushList();
      const text = line.replace(/^## /, '');
      blocks.push(
        <h2 key={idx} className="text-[18px] font-bold text-[#1F4E79] mt-5 mb-2 leading-tight flex items-start gap-2">
          <span className="flex-1">{text}</span>
          <Copy text={text} label="H2" />
        </h2>
      );
    } else if (line.startsWith('### ')) {
      flushList();
      blocks.push(
        <h3 key={idx} className="text-[15px] font-bold text-gray-800 mt-3 mb-1.5 leading-tight">
          {line.replace(/^### /, '')}
        </h3>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
      inList = true;
      listItems.push(line.replace(/^[-*•]\s/, ''));
    } else if (line.match(/\[CTA/i)) {
      flushList();
      blocks.push(
        <div key={idx} className="my-3 inline-block bg-red-50 border border-red-200 rounded px-3 py-1.5 text-[12px] font-bold text-red-700">
          {line}
        </div>
      );
    } else {
      flushList();
      blocks.push(
        <p key={idx} className="text-[13px] text-gray-800 leading-relaxed my-2">
          {line}
        </p>
      );
    }
  });
  flushList();

  return blocks;
}

// The 2-column meta table — same content as the .docx template
function MetaRow({ label, value, wide = false, children }) {
  const copyText = typeof value === 'string' ? value : '';
  return (
    <tr className="border-b border-gray-200 align-top">
      <td className="bg-[#F3F3F3] border-r border-gray-200 p-2 w-[30%] text-[12px] font-bold text-gray-800 align-top">
        {label}
      </td>
      <td className="p-2 text-[12px] text-gray-700 align-top">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 whitespace-pre-wrap break-words">
            {children || (value ? value : <span className="text-gray-300 italic">(empty)</span>)}
          </div>
          {copyText && <Copy text={copyText} />}
        </div>
      </td>
    </tr>
  );
}

function CylChecklistTable() {
  const items = [
    'Trello Card (Web Development)',
    "Client Bucketlist: Client's Bucket lists",
    'SEO Checklist: SEO List of Priorities',
  ];
  const finalItems = [
    'FOR LLP: Has the link been added to the menu?',
    'I confirm that all items above are complete and I have published the page.',
  ];
  return (
    <table className="w-full mt-5 border-collapse border border-gray-300">
      <thead>
        <tr className="bg-[#F3F3F3]">
          <th className="border border-gray-300 p-2 text-left text-[12px] font-bold text-gray-800 w-[50%]">Internal CYL Checklist</th>
          <th className="border border-gray-300 p-2 text-left text-[10px] font-bold text-gray-800 w-[20%]">Approved by (Admin)</th>
          <th className="border border-gray-300 p-2 w-[15%]"></th>
          <th className="border border-gray-300 p-2 text-left text-[10px] font-bold text-gray-800 w-[15%]">Date</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => (
          <tr key={i}>
            <td className="border border-gray-300 p-2 text-[12px] text-gray-700">{it}</td>
            <td className="border border-gray-300 p-2 text-[11px] text-gray-400 italic">Make a selection</td>
            <td className="border border-gray-300 p-2"></td>
            <td className="border border-gray-300 p-2"></td>
          </tr>
        ))}
        <tr className="bg-[#F3F3F3]">
          <th className="border border-gray-300 p-2 text-left text-[12px] font-bold text-gray-800">Final confirmation</th>
          <th className="border border-gray-300 p-2 text-left text-[10px] font-bold text-gray-800">Approved by (Admin)</th>
          <th className="border border-gray-300 p-2"></th>
          <th className="border border-gray-300 p-2 text-left text-[10px] font-bold text-gray-800">Date</th>
        </tr>
        {finalItems.map((it, i) => (
          <tr key={i}>
            <td className="border border-gray-300 p-2 text-[12px] text-gray-700">{it}</td>
            <td className="border border-gray-300 p-2 text-[11px] text-gray-400 italic">Make a selection</td>
            <td className="border border-gray-300 p-2"></td>
            <td className="border border-gray-300 p-2"></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DocumentPreview({ fields, clientName = 'Client' }) {
  const [exporting, setExporting] = useState(false);

  const title = fields.article_title || '[Title]';
  const fk = fields.focus_keyphrase || '[focus keyphrase]';
  const metaDesc = fields.meta_description || '';
  const url = fields.url || '';
  const secondaryKeywords = (fields.secondary_keywords || '')
    .split(',').map(k => k.trim()).filter(Boolean);
  const seoTitle = fields.seo_title || title;
  const pageTypeLabels = { blog: 'Blog', seo_page: 'SEO Page', landing_page: 'Landing Page' };
  const pageType = pageTypeLabels[fields.page_type] || 'Blog';
  const isNew = !fields.is_refresh;
  const docHeading = `${clientName} - ${pageType} - ${isNew ? 'NEW' : 'REFRESH'}: ${title}`;

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadTemplateFile(fields, clientName || 'Article');
      toast.success('Exported as .docx');
    } catch (err) {
      toast.error('Export error: ' + err.message);
    }
    setExporting(false);
  };

  const buildFullMarkdown = () => {
    // Useful for one-click "copy everything"
    return [
      `${clientName} - ${pageType} - ${isNew ? 'NEW' : 'REFRESH'}: ${title}`,
      '',
      `SEO Title: ${seoTitle}`,
      `Focus Keyphrase: ${fk}`,
      `Meta Description: ${metaDesc}`,
      `Slug URL: ${url}`,
      secondaryKeywords.length ? `Secondary Keywords: ${secondaryKeywords.join(', ')}` : '',
      '',
      'BODY',
      '',
      fields.article_content || '',
    ].filter(Boolean).join('\n');
  };

  return (
    <div className="bg-[#f1f3f4] p-4 pb-10">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 mb-4 flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">Live Document Preview</div>
          <div className="text-[11px] text-gray-600 truncate">Updates as you apply fixes · matches the .docx export</div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Copy text={buildFullMarkdown()} label="Copy all" />
          <button
            onClick={handleExport}
            disabled={exporting}
            className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40 flex items-center gap-1"
          >
            {exporting ? 'Exporting…' : '📄 Export .docx'}
          </button>
        </div>
      </div>

      {/* Paper */}
      <div className="bg-white mx-auto shadow-lg border border-gray-200 rounded" style={{ maxWidth: '816px', minHeight: '600px' }}>
        <div className="p-10">
          {/* Title */}
          <h1 className="text-[22px] font-bold text-[#1F4E79] leading-tight mb-4 flex items-start gap-2">
            <span className="flex-1">{clientName} - Blog - NEW: {title}</span>
            <Copy text={`${clientName} - ${pageType} - ${isNew ? 'NEW' : 'REFRESH'}: ${title}`} />
          </h1>

          {/* Meta table */}
          <table className="w-full border-collapse border border-gray-300 mb-6">
            <tbody>
              <MetaRow label="Is this an existing blog/LLP?" value={fields.is_refresh ? 'Yes — Refresh' : 'No'} />
              <MetaRow label="What type of content is this?" value={`${pageType.toUpperCase()} - ${isNew ? 'NEW' : 'REFRESH'}`} />
              <MetaRow label="Index Setting" value={fields.index_setting === 'noindex' ? 'NO-INDEX' : 'INDEX'} />
              <MetaRow label="SEO Title" value={seoTitle} />
              <MetaRow label="Keywords list">
                <div>
                  <div className="text-[10px] text-gray-400 mb-1 italic">
                    Three to four keywords per post. One main + long tail variations. Keyword density 1–2%.
                  </div>
                  {secondaryKeywords.length > 0 ? (
                    <ul className="space-y-0.5">
                      {secondaryKeywords.map((k, i) => (
                        <li key={i} className="text-[12px] text-gray-800">• {k}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-gray-300 italic text-[11px]">(no secondary keywords)</span>
                  )}
                </div>
              </MetaRow>
              <MetaRow label="Main Keywords / Focus keyphrase" value={`FK: ${fk}`} />
              <MetaRow label="Meta description">
                <div>
                  <div className="text-[10px] text-gray-400 italic mb-1">If page is existing add current description</div>
                  {metaDesc ? (
                    <div>
                      {metaDesc}
                      <div className="text-[9px] text-gray-400 mt-0.5">{metaDesc.length} chars</div>
                    </div>
                  ) : (
                    <span className="text-gray-300 italic">(empty)</span>
                  )}
                </div>
              </MetaRow>
              <MetaRow label="Slug URL" value={url || '[NEW Slug URL]'} />
              <MetaRow label="Does this need a redirect of the old link to a new link?" value="No" />
              <MetaRow label="Social Post Text">
                <div>
                  <div className="text-[11px] font-bold text-gray-700">FACEBOOK</div>
                  <div className="text-[12px] text-gray-300 italic mb-2">[Facebook post copy to be written]</div>
                  <div className="text-[11px] font-bold text-gray-700">INSTAGRAM</div>
                  <div className="text-[12px] text-gray-300 italic">[Instagram post copy to be written]</div>
                </div>
              </MetaRow>
            </tbody>
          </table>

          {/* Body heading */}
          <div className="text-[14px] font-bold text-gray-800 mt-6 mb-2">Body:</div>

          {/* Article title */}
          <h1 className="text-[24px] font-bold text-[#1F4E79] leading-tight mb-3 flex items-start gap-2">
            <span className="flex-1">{title}</span>
            <Copy text={title} label="Title" />
          </h1>

          {/* Table of contents placeholder */}
          <div className="text-[13px] font-bold text-gray-800 mt-4 mb-2">Table of Contents</div>

          {/* Article body */}
          <div>
            {renderArticleContent(fields.article_content || '')}
          </div>

          {/* CYL Checklist */}
          <CylChecklistTable />
        </div>
      </div>
    </div>
  );
}
