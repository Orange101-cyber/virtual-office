import { useMemo } from 'react';

export default function ArticleInputs({
  fields,
  onFieldChange,
  onAnalyze,
  analyzing,
  statusText,
  breadcrumb,
  saved,
}) {
  const metaLen = fields.meta_description?.length || 0;
  const metaHintClass = useMemo(() => {
    if (metaLen >= 140 && metaLen <= 160) return 'text-green-600';
    if (metaLen > 160) return 'text-red-500';
    return 'text-gray-400';
  }, [metaLen]);

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] p-4 mb-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className="text-xs text-gray-400 flex-1"
          dangerouslySetInnerHTML={{ __html: breadcrumb }}
        />
        {saved && (
          <div className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
            ✓ Saved
          </div>
        )}
      </div>

      {/* Row 1: URL, Focus KW, Secondary KW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-2.5">
        <Field label="Live URL" value={fields.url} onChange={(v) => onFieldChange('url', v)} placeholder="https://lukeokelly.com.au/..." />
        <Field label="Focus Keyphrase" value={fields.focus_keyphrase} onChange={(v) => onFieldChange('focus_keyphrase', v)} placeholder="e.g. real estate west end" />
        <Field label="Secondary Keywords (comma-separated)" value={fields.secondary_keywords} onChange={(v) => onFieldChange('secondary_keywords', v)} placeholder="west end real estate, ..." />
      </div>

      {/* Row 2: Title, Meta */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-2.5">
        <Field label="Article Title / H1" value={fields.article_title} onChange={(v) => onFieldChange('article_title', v)} placeholder="e.g. Real Estate West End: 6 Facts..." />
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
            Meta Description <span className={`font-normal normal-case tracking-normal ${metaHintClass}`}>({metaLen} chars)</span>
          </label>
          <input
            type="text"
            value={fields.meta_description}
            onChange={(e) => onFieldChange('meta_description', e.target.value)}
            placeholder="Paste meta description..."
            className="w-full border border-gray-200 rounded-[5px] px-2 py-1.5 text-xs bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518] focus:bg-white"
          />
        </div>
      </div>

      {/* Content paste */}
      <div className="mb-2.5">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
          Paste Article Content{' '}
          <span className="font-normal normal-case tracking-normal text-gray-400">
            — Open article → Ctrl+A → Ctrl+C → paste here
          </span>
        </label>
        <textarea
          value={fields.article_content}
          onChange={(e) => onFieldChange('article_content', e.target.value)}
          rows={3}
          placeholder="Paste the full article text here for AI analysis..."
          className="w-full border border-gray-200 rounded-[5px] px-2.5 py-2 text-[11px] font-mono text-gray-500 bg-[#f8f8f6] resize-y focus:outline-none focus:border-[#F5C518] focus:bg-white"
        />
      </div>

      {/* Analyze button */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onAnalyze}
          disabled={analyzing}
          className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-[5px] px-5 py-2 text-sm font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ▶ Analyze Article
        </button>
        {analyzing && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="w-3.5 h-3.5 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
            <span>{statusText}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-[5px] px-2 py-1.5 text-xs bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518] focus:bg-white"
      />
    </div>
  );
}
