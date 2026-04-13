import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { fetchUrlContent } from '../../lib/urlFetcher';
import { parseDocx } from '../../lib/docParser';
import { supabase } from '../../lib/supabase';

export default function ArticleInputs({
  fields,
  onFieldChange,
  onAnalyze,
  analyzing,
  statusText,
  breadcrumb,
  saved,
  clientId,
}) {
  const [fetching, setFetching] = useState(false);
  const [fetchStatus, setFetchStatus] = useState('');
  const [dragging, setDragging] = useState(false);
  const dropRef = useRef(null);

  // ── Cannibalization auto-check ──
  const [pastKeywords, setPastKeywords] = useState([]);
  const [cannibHits, setCannibHits] = useState([]);

  // Load client's keyword bank once
  useEffect(() => {
    if (!clientId) return;
    supabase
      .from('clients')
      .select('past_keywords')
      .eq('id', clientId)
      .single()
      .then(({ data }) => {
        const kws = (data?.past_keywords || '')
          .split('\n')
          .map(k => k.trim().toLowerCase())
          .filter(Boolean);
        setPastKeywords(kws);
      })
      .catch(() => {});
  }, [clientId]);

  // Check for overlaps whenever focus keyphrase or secondary keywords change
  useEffect(() => {
    const fk = (fields.focus_keyphrase || '').trim().toLowerCase();
    const sk = (fields.secondary_keywords || '')
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(Boolean);
    const current = [fk, ...sk].filter(Boolean);

    if (!current.length || !pastKeywords.length) {
      setCannibHits([]);
      return;
    }

    const hits = [];
    current.forEach(kw => {
      pastKeywords.forEach(p => {
        if (p && kw && (p.includes(kw) || kw.includes(p))) {
          if (!hits.find(h => h.kw === kw && h.past === p)) {
            hits.push({ kw, past: p });
          }
        }
      });
    });
    setCannibHits(hits);
  }, [fields.focus_keyphrase, fields.secondary_keywords, pastKeywords]);

  const metaLen = fields.meta_description?.length || 0;
  const metaHintClass = useMemo(() => {
    if (metaLen >= 140 && metaLen <= 160) return 'text-green-600';
    if (metaLen > 160) return 'text-red-500';
    return 'text-gray-400';
  }, [metaLen]);

  const handleFetchUrl = async () => {
    const url = fields.url?.trim();
    if (!url) return alert('Enter a URL first.');
    setFetching(true);
    setFetchStatus('Fetching page...');
    try {
      const data = await fetchUrlContent(url);
      if (data.article_title) onFieldChange('article_title', data.article_title);
      if (data.meta_description) onFieldChange('meta_description', data.meta_description);
      if (data.article_content) onFieldChange('article_content', data.article_content);
      setFetchStatus('Done! Fields populated.');
      setTimeout(() => setFetchStatus(''), 3000);
    } catch (err) {
      setFetchStatus('');
      alert('Fetch error: ' + err.message);
    } finally {
      setFetching(false);
    }
  };

  const handleDocFile = useCallback(async (file) => {
    if (!file) return;
    const isDocx = file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (!isDocx) {
      alert('Please drop a .docx file (Word document).');
      return;
    }
    setFetching(true);
    setFetchStatus('Parsing Word doc...');
    try {
      const parsed = await parseDocx(file);
      Object.entries(parsed).forEach(([key, value]) => {
        if (value) onFieldChange(key, value);
      });
      const count = Object.values(parsed).filter(Boolean).length;
      setFetchStatus(`Done! ${count} fields populated from doc.`);
      setTimeout(() => setFetchStatus(''), 4000);
    } catch (err) {
      setFetchStatus('');
      alert('Error parsing doc: ' + err.message);
    } finally {
      setFetching(false);
    }
  }, [onFieldChange]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    handleDocFile(file);
  }, [handleDocFile]);

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    handleDocFile(file);
    e.target.value = '';
  };

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

      {/* ── Cannibalization warning banner ── */}
      {cannibHits.length > 0 && !fields.is_refresh && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-3">
          <div className="flex items-start gap-2">
            <div className="text-red-500 text-lg leading-none shrink-0">⚠</div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold text-red-700 mb-0.5">
                Keyword Cannibalization Detected
              </div>
              <div className="text-[10px] text-red-600 mb-2">
                {cannibHits.length === 1
                  ? `"${cannibHits[0].kw}" has already been used for this client.`
                  : `${cannibHits.length} keywords overlap with existing articles for this client:`}
              </div>
              {cannibHits.length > 1 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {cannibHits.slice(0, 6).map((h, i) => (
                    <span key={i} className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                      {h.kw} ↔ {h.past}
                    </span>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fields.is_refresh || false}
                  onChange={(e) => onFieldChange('is_refresh', e.target.checked)}
                  className="accent-red-500"
                />
                <span className="text-[11px] text-red-700 font-semibold">
                  This is a refresh / rework of an existing article
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ── Refresh article badge (shows when ticked) ── */}
      {fields.is_refresh && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
          <span className="text-blue-600 text-sm">🔄</span>
          <span className="text-[11px] text-blue-700 font-semibold flex-1">
            Marked as Refresh Article — cannibalization checks are acknowledged
          </span>
          <button
            onClick={() => onFieldChange('is_refresh', false)}
            className="text-[10px] text-blue-500 hover:text-blue-700 bg-transparent border-none cursor-pointer"
          >
            undo
          </button>
        </div>
      )}

      {/* Import section: drop zone + file picker */}
      <div
        ref={dropRef}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-3 mb-3 text-center transition-colors ${
          dragging
            ? 'border-[#F5C518] bg-[#F5C518]/5'
            : 'border-gray-200 bg-[#f8f8f6]'
        }`}
      >
        <div className="text-xs text-gray-500 mb-1">
          Drag & drop a <strong>.docx</strong> SEO template here to auto-fill all fields
        </div>
        <label className="inline-block cursor-pointer">
          <span className="text-[11px] text-[#F5C518] font-semibold hover:underline">
            or click to browse
          </span>
          <input
            type="file"
            accept=".docx"
            onChange={handleFileInput}
            className="hidden"
          />
        </label>
      </div>

      {/* Row 1: Page Type, Index, URL, Focus KW, Secondary KW — all horizontal */}
      <div className="grid grid-cols-2 md:grid-cols-[110px_100px_1fr_1fr_1fr] gap-2.5 mb-2.5">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
            Page Type
          </label>
          <select
            value={fields.page_type || 'blog'}
            onChange={(e) => onFieldChange('page_type', e.target.value)}
            className="w-full border border-gray-200 rounded-[5px] px-2 py-1.5 text-xs bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518] focus:bg-white"
          >
            <option value="blog">Blog</option>
            <option value="seo_page">SEO Page</option>
            <option value="landing_page">Landing Page</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
            Index
          </label>
          <select
            value={fields.index_setting || 'index'}
            onChange={(e) => onFieldChange('index_setting', e.target.value)}
            className="w-full border border-gray-200 rounded-[5px] px-2 py-1.5 text-xs bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518] focus:bg-white"
          >
            <option value="index">Index</option>
            <option value="noindex">No-Index</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
            Live URL
          </label>
          <div className="flex gap-1">
            <input
              type="text"
              value={fields.url}
              onChange={(e) => onFieldChange('url', e.target.value)}
              placeholder="https://lukeokelly.com.au/..."
              className="flex-1 border border-gray-200 rounded-[5px] px-2 py-1.5 text-xs bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518] focus:bg-white"
            />
            <button
              onClick={handleFetchUrl}
              disabled={fetching || !fields.url?.trim()}
              className="bg-[#1a1a1a] text-white border-none rounded-[5px] px-2 py-1.5 text-[10px] font-bold cursor-pointer hover:bg-[#333] disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              title="Fetch page content from URL"
            >
              Fetch
            </button>
          </div>
        </div>
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
          Article Content{' '}
          <span className="font-normal normal-case tracking-normal text-gray-400">
            — Auto-filled from URL fetch or doc import, or paste manually
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

      {/* Analyze button + status */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onAnalyze}
          disabled={analyzing}
          className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-[5px] px-5 py-2 text-sm font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ▶ Analyze Article
        </button>
        {(analyzing || fetchStatus) && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {analyzing && (
              <div className="w-3.5 h-3.5 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
            )}
            <span>{analyzing ? statusText : fetchStatus}</span>
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
