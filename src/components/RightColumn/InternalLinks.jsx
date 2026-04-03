import { useState, useMemo, useEffect } from 'react';

/** Extract all URLs from article content */
function extractLinksFromContent(content) {
  if (!content) return [];
  const urlRegex = /https?:\/\/[^\s)"',]+/g;
  const matches = content.match(urlRegex) || [];
  // Deduplicate
  return [...new Set(matches.map(u => u.replace(/[.]+$/, '')))];
}

/** Try to determine the site domain from existing links or the URL field */
function detectSiteDomain(links, articleUrl) {
  if (articleUrl) {
    try { return new URL(articleUrl).hostname; } catch {}
  }
  for (const link of links) {
    try {
      const h = new URL(link).hostname;
      if (!h.includes('google') && !h.includes('facebook') && !h.includes('instagram')) return h;
    } catch {}
  }
  return null;
}

/** Fetch sitemap.xml and extract URLs */
async function fetchSitemapUrls(domain) {
  const sitemapUrl = `https://${domain}/sitemap.xml`;
  const proxies = [
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  ];

  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy(sitemapUrl), { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.includes('<url>') && !text.includes('<loc>')) continue;

      // Parse sitemap XML
      const urls = [];
      const locRegex = /<loc>(.*?)<\/loc>/g;
      let match;
      while ((match = locRegex.exec(text)) !== null) {
        urls.push(match[1].trim());
      }

      // If this is a sitemap index, try fetching first sub-sitemap
      if (urls.length > 0 && urls[0].includes('sitemap')) {
        try {
          const subRes = await fetch(proxy(urls[0]), { signal: AbortSignal.timeout(10000) });
          if (subRes.ok) {
            const subText = await subRes.text();
            const subUrls = [];
            let subMatch;
            const subRegex = /<loc>(.*?)<\/loc>/g;
            while ((subMatch = subRegex.exec(subText)) !== null) {
              subUrls.push(subMatch[1].trim());
            }
            if (subUrls.length > 0) return subUrls;
          }
        } catch {}
      }

      return urls.filter(u => !u.includes('sitemap'));
    } catch {
      continue;
    }
  }
  return [];
}

function scorePage(pageUrl, content, focusKeyphrase, secondaryKeywords) {
  let score = 0;
  const matchedTerms = [];

  // Extract topic from URL path
  let topic = '';
  try {
    const u = new URL(pageUrl);
    topic = u.pathname.replace(/\//g, ' ').replace(/-/g, ' ').trim();
  } catch {
    topic = pageUrl;
  }

  const topicWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const contentLower = (content || '').toLowerCase();
  const keywords = [
    focusKeyphrase,
    ...(secondaryKeywords || '').split(',').map(k => k.trim()),
  ].filter(Boolean).map(k => k.toLowerCase());

  topicWords.forEach(tw => {
    keywords.forEach(kw => {
      if (kw.includes(tw) || tw.includes(kw.split(' ')[0])) {
        score += 3;
        if (!matchedTerms.includes(tw)) matchedTerms.push(tw);
      }
    });
    if (contentLower.includes(tw)) {
      score += 1;
      if (!matchedTerms.includes(tw)) matchedTerms.push(tw);
    }
  });

  return { score, matchedTerms };
}

export default function InternalLinks({ content, focusKeyphrase, secondaryKeywords, articleUrl }) {
  const [sitemapPages, setSitemapPages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [manualPages, setManualPages] = useState('');
  const [showManual, setShowManual] = useState(false);

  // Auto-detect links already in the article
  const existingLinks = useMemo(() => extractLinksFromContent(content), [content]);

  // Detect the site domain
  const siteDomain = useMemo(
    () => detectSiteDomain(existingLinks, articleUrl),
    [existingLinks, articleUrl]
  );

  // Split existing links into internal and external
  const { internalLinks, externalLinks } = useMemo(() => {
    const internal = [];
    const external = [];
    existingLinks.forEach(link => {
      try {
        const h = new URL(link).hostname;
        if (siteDomain && h === siteDomain) {
          internal.push(link);
        } else {
          external.push(link);
        }
      } catch {
        external.push(link);
      }
    });
    return { internalLinks: internal, externalLinks: external };
  }, [existingLinks, siteDomain]);

  // Fetch sitemap when domain is detected
  const handleFetchSitemap = async () => {
    if (!siteDomain) return;
    setLoading(true);
    try {
      const urls = await fetchSitemapUrls(siteDomain);
      setSitemapPages(urls);
      setFetched(true);
    } catch {
      setFetched(true);
    }
    setLoading(false);
  };

  // Auto-fetch sitemap on first render if we have a domain
  useEffect(() => {
    if (siteDomain && !fetched && !loading) {
      handleFetchSitemap();
    }
  }, [siteDomain]);

  // Combine sitemap pages + manual pages
  const allSitePages = useMemo(() => {
    const manual = manualPages.split('\n').map(l => l.trim()).filter(Boolean);
    return [...new Set([...sitemapPages, ...manual])];
  }, [sitemapPages, manualPages]);

  // Score and suggest pages NOT already linked
  const suggestions = useMemo(() => {
    if (!allSitePages.length || !content) return [];

    return allSitePages
      .filter(page => !internalLinks.some(link => link.includes(page) || page.includes(link)))
      .map(page => {
        const { score, matchedTerms } = scorePage(page, content, focusKeyphrase, secondaryKeywords);
        return { url: page, score, matchedTerms };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [allSitePages, content, internalLinks, focusKeyphrase, secondaryKeywords]);

  const internalCount = internalLinks.length;
  const isEnough = internalCount >= 2;

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
      <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider flex justify-between">
        <span>Internal Links</span>
        <span className={`font-normal normal-case tracking-normal ${isEnough ? 'text-green-400' : 'text-red-400'}`}>
          {internalCount} found {isEnough ? '✓' : '— need 2+'}
        </span>
      </div>
      <div className="p-3.5">
        {/* Existing internal links */}
        {internalLinks.length > 0 && (
          <div className="mb-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
              Internal Links in Article ({internalLinks.length})
            </div>
            {internalLinks.map((link, i) => (
              <div key={i} className="flex items-center gap-1.5 py-0.5 text-[11px]">
                <span className="text-green-600 shrink-0">✓</span>
                <span className="text-gray-600 truncate" title={link}>{link}</span>
              </div>
            ))}
          </div>
        )}

        {/* External links */}
        {externalLinks.length > 0 && (
          <div className="mb-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
              External Links ({externalLinks.length})
            </div>
            {externalLinks.slice(0, 5).map((link, i) => (
              <div key={i} className="flex items-center gap-1.5 py-0.5 text-[11px]">
                <span className="text-blue-500 shrink-0">↗</span>
                <span className="text-gray-500 truncate" title={link}>{link}</span>
              </div>
            ))}
            {externalLinks.length > 5 && (
              <div className="text-[9px] text-gray-400">+{externalLinks.length - 5} more</div>
            )}
          </div>
        )}

        {/* No links warning */}
        {existingLinks.length === 0 && content && (
          <div className="bg-red-50 border border-red-200 rounded px-2 py-1.5 mb-3 text-[11px] text-red-600">
            No links detected in the article. Add at least 2 internal links and 1 external authority link.
          </div>
        )}

        {/* Suggestions from sitemap */}
        {suggestions.length > 0 && (
          <div className="mb-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
              Suggested Pages to Link To
            </div>
            <div className="text-[9px] text-gray-400 mb-1.5">
              Relevant pages from {siteDomain} not yet linked in the article
            </div>
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-1.5 p-1.5 rounded bg-[#f8f8f6] mb-1 text-[11px]">
                <span className="text-[#F5C518] shrink-0 mt-0.5">→</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-gray-700" title={s.url}>{s.url}</div>
                  <div className="text-[9px] text-gray-400">
                    Matches: {s.matchedTerms.join(', ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sitemap status */}
        <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-2">
          {loading ? (
            <span>Scanning {siteDomain} sitemap...</span>
          ) : fetched ? (
            <span>{sitemapPages.length} pages found from sitemap</span>
          ) : siteDomain ? (
            <button
              onClick={handleFetchSitemap}
              className="text-[#F5C518] font-semibold bg-transparent border-none cursor-pointer hover:underline p-0 text-[10px]"
            >
              Scan {siteDomain} sitemap for suggestions
            </button>
          ) : (
            <span>Add a URL to auto-detect the site</span>
          )}
        </div>

        {/* Manual page input toggle */}
        <button
          onClick={() => setShowManual(!showManual)}
          className="text-[10px] text-gray-400 font-semibold bg-transparent border-none cursor-pointer hover:underline p-0"
        >
          {showManual ? 'Hide' : 'Add'} pages manually
        </button>
        {showManual && (
          <textarea
            value={manualPages}
            onChange={(e) => setManualPages(e.target.value)}
            rows={3}
            placeholder={"https://lukeokelly.com.au/about/\nhttps://lukeokelly.com.au/contact/"}
            className="w-full border border-gray-200 rounded-[5px] px-2 py-1.5 text-[11px] bg-[#f8f8f6] resize-y focus:outline-none focus:border-[#F5C518] mt-1"
          />
        )}
      </div>
    </div>
  );
}
