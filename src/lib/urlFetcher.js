/**
 * Fetch a live URL and extract SEO-relevant fields.
 * Tries multiple CORS proxies as fallbacks.
 */

const PROXIES = [
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

async function fetchWithProxy(url) {
  for (let i = 0; i < PROXIES.length; i++) {
    const proxyUrl = PROXIES[i](url);
    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const html = await res.text();
        if (html && html.length > 100) return html;
      }
    } catch {
      // Try next proxy
    }
  }
  throw new Error('Could not fetch URL. All proxies failed. Try pasting the content manually.');
}

export async function fetchUrlContent(url) {
  const html = await fetchWithProxy(url);

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Extract title
  const title = doc.querySelector('title')?.textContent?.trim() || '';

  // Extract meta description
  const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';

  // Extract H1
  const h1 = doc.querySelector('h1')?.textContent?.trim() || '';

  // Extract article content — try common article containers
  let articleContent = '';
  const contentSelectors = [
    'article',
    '.entry-content',
    '.post-content',
    '.article-content',
    '.content-area',
    '[role="main"]',
    'main',
  ];

  for (const sel of contentSelectors) {
    const el = doc.querySelector(sel);
    if (el && el.textContent.trim().length > 200) {
      articleContent = el.textContent.trim();
      break;
    }
  }

  // Fallback: grab all paragraph text from body
  if (!articleContent) {
    const paragraphs = doc.querySelectorAll('p');
    articleContent = Array.from(paragraphs)
      .map(p => p.textContent.trim())
      .filter(t => t.length > 20)
      .join('\n\n');
  }

  // Clean up excessive whitespace
  articleContent = articleContent.replace(/\n{3,}/g, '\n\n').trim();

  return {
    article_title: h1 || title,
    meta_description: metaDesc,
    article_content: articleContent,
    url,
  };
}
