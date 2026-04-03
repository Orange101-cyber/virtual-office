/**
 * Fetch a live URL and extract SEO-relevant fields.
 * Uses allorigins.win as a CORS proxy for browser-based fetching.
 */
export async function fetchUrlContent(url) {
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;

  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`Failed to fetch URL (${res.status})`);

  const data = await res.json();
  const html = data.contents;
  if (!html) throw new Error('Empty response from URL');

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
