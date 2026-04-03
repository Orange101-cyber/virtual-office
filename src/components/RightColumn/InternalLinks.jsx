import { useState, useMemo } from 'react';

export default function InternalLinks({ content, focusKeyphrase, secondaryKeywords }) {
  const [sitePages, setSitePages] = useState('');

  const suggestions = useMemo(() => {
    if (!sitePages.trim() || !content) return [];

    const pages = sitePages.split('\n').map(l => l.trim()).filter(Boolean);
    const keywords = [
      focusKeyphrase,
      ...(secondaryKeywords || '').split(',').map(k => k.trim()),
    ].filter(Boolean).map(k => k.toLowerCase());

    const contentLower = content.toLowerCase();

    return pages.map(page => {
      // Extract page topic from URL path
      let topic = '';
      try {
        const u = new URL(page);
        topic = u.pathname.replace(/\//g, ' ').replace(/-/g, ' ').trim();
      } catch {
        topic = page.replace(/https?:\/\//, '').replace(/\//g, ' ').replace(/-/g, ' ').trim();
      }

      const topicWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);

      // Calculate relevance score
      let score = 0;
      let matchedTerms = [];

      topicWords.forEach(tw => {
        // Check if any keyword overlaps with this page topic
        keywords.forEach(kw => {
          if (kw.includes(tw) || tw.includes(kw.split(' ')[0])) {
            score += 3;
            if (!matchedTerms.includes(tw)) matchedTerms.push(tw);
          }
        });
        // Check if topic word appears in content
        if (contentLower.includes(tw)) {
          score += 1;
          if (!matchedTerms.includes(tw)) matchedTerms.push(tw);
        }
      });

      // Check if page is already linked
      const isLinked = content.includes(page);

      return { url: page, score, matchedTerms, isLinked, topic };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  }, [sitePages, content, focusKeyphrase, secondaryKeywords]);

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
      <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider">
        Internal Link Suggestions
      </div>
      <div className="p-3.5">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
          Site pages (one URL per line)
        </label>
        <textarea
          value={sitePages}
          onChange={(e) => setSitePages(e.target.value)}
          rows={4}
          placeholder={"https://lukeokelly.com.au/about/\nhttps://lukeokelly.com.au/contact/\nhttps://lukeokelly.com.au/west-end-guide/"}
          className="w-full border border-gray-200 rounded-[5px] px-2 py-1.5 text-[11px] bg-[#f8f8f6] resize-y focus:outline-none focus:border-[#F5C518] mb-2"
        />

        {suggestions.length > 0 ? (
          <div className="space-y-1.5">
            {suggestions.map((s, i) => (
              <div key={i} className={`flex items-start gap-2 p-1.5 rounded text-[11px] ${s.isLinked ? 'bg-green-50' : 'bg-[#f8f8f6]'}`}>
                <span className={`shrink-0 mt-0.5 ${s.isLinked ? 'text-green-600' : 'text-[#F5C518]'}`}>
                  {s.isLinked ? '✓' : '→'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-gray-700" title={s.url}>{s.url}</div>
                  <div className="text-[9px] text-gray-400">
                    {s.isLinked ? 'Already linked' : `Matches: ${s.matchedTerms.join(', ')}`}
                  </div>
                </div>
                <span className="text-[9px] text-gray-400 shrink-0">{s.score}pt</span>
              </div>
            ))}
          </div>
        ) : sitePages.trim() ? (
          <div className="text-[11px] text-gray-400">No relevant pages found. Add more site URLs above.</div>
        ) : null}
      </div>
    </div>
  );
}
