import { useState } from 'react';
import { fetchUrlContent } from '../../lib/urlFetcher';

function analyzeForComparison(content, title) {
  const words = content.split(/\s+/).filter(w => w.match(/[a-zA-Z]/));
  const headings = content.split('\n').filter(l => {
    const t = l.trim();
    return t.length > 5 && t.length < 100 && !t.endsWith('.') && !t.includes('http');
  });
  const links = (content.match(/https?:\/\/[^\s)]+/g) || []).length;
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);

  return {
    wordCount: words.length,
    headings: headings.length,
    paragraphs: paragraphs.length,
    links,
    title: title || '(no title)',
  };
}

function CompRow({ label, yours, competitors }) {
  const max = Math.max(yours, ...competitors.map(c => c || 0));
  const isBest = yours === max && yours > 0;
  const isWorst = yours < Math.min(...competitors.filter(c => c > 0));

  return (
    <tr className="border-b border-gray-100 last:border-b-0">
      <td className="py-1.5 text-[11px] text-gray-500 pr-2">{label}</td>
      <td className={`py-1.5 text-[11px] font-semibold text-center ${isBest ? 'text-green-600' : isWorst ? 'text-red-500' : ''}`}>
        {yours.toLocaleString()}
      </td>
      {competitors.map((val, i) => (
        <td key={i} className="py-1.5 text-[11px] text-center text-gray-600">
          {val?.toLocaleString() || '—'}
        </td>
      ))}
    </tr>
  );
}

export default function CompetitorComparison({ content, title }) {
  const [urls, setUrls] = useState(['', '', '']);
  const [results, setResults] = useState([null, null, null]);
  const [loading, setLoading] = useState(false);

  const yourStats = content ? analyzeForComparison(content, title) : null;

  const handleFetch = async () => {
    const toFetch = urls.filter(u => u.trim());
    if (!toFetch.length) return;

    setLoading(true);
    const newResults = [...results];

    for (let i = 0; i < urls.length; i++) {
      if (!urls[i].trim()) { newResults[i] = null; continue; }
      try {
        const data = await fetchUrlContent(urls[i].trim());
        newResults[i] = analyzeForComparison(data.article_content, data.article_title);
      } catch {
        newResults[i] = { wordCount: 0, headings: 0, paragraphs: 0, links: 0, title: 'Error fetching' };
      }
    }

    setResults(newResults);
    setLoading(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
      <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider">
        Competitor Comparison
      </div>
      <div className="p-3.5">
        <div className="text-[10px] text-gray-400 mb-2">
          Paste up to 3 competitor URLs for the same keyword
        </div>

        {urls.map((url, i) => (
          <input
            key={i}
            type="text"
            value={url}
            onChange={(e) => {
              const next = [...urls];
              next[i] = e.target.value;
              setUrls(next);
            }}
            placeholder={`Competitor ${i + 1} URL`}
            className="w-full border border-gray-200 rounded-[5px] px-2 py-1 text-[11px] bg-[#f8f8f6] mb-1.5 focus:outline-none focus:border-[#F5C518]"
          />
        ))}

        <button
          onClick={handleFetch}
          disabled={loading || !urls.some(u => u.trim())}
          className="bg-[#1a1a1a] text-white border-none rounded-[5px] px-3 py-1.5 text-[10px] font-bold cursor-pointer hover:bg-[#333] disabled:opacity-30 w-full mt-1 mb-3"
        >
          {loading ? 'Fetching...' : 'Compare'}
        </button>

        {yourStats && results.some(Boolean) && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-[9px] text-gray-400 font-bold uppercase text-left pb-1">Metric</th>
                  <th className="text-[9px] text-gray-400 font-bold uppercase text-center pb-1">Yours</th>
                  {results.map((r, i) => r && (
                    <th key={i} className="text-[9px] text-gray-400 font-bold uppercase text-center pb-1 max-w-[60px] truncate">
                      C{i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <CompRow label="Words" yours={yourStats.wordCount} competitors={results.filter(Boolean).map(r => r.wordCount)} />
                <CompRow label="Headings" yours={yourStats.headings} competitors={results.filter(Boolean).map(r => r.headings)} />
                <CompRow label="Paragraphs" yours={yourStats.paragraphs} competitors={results.filter(Boolean).map(r => r.paragraphs)} />
                <CompRow label="Links" yours={yourStats.links} competitors={results.filter(Boolean).map(r => r.links)} />
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
