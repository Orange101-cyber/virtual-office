/**
 * Fetch a live URL and extract SEO-relevant fields.
 *
 * 1. Our own Supabase Edge Function `fetch-page` (server-side, browser-like
 *    headers, works with Cloudflare-protected client sites).
 * 2. Fallback: allorigins.win public CORS proxy.
 * (corsproxy.io now requires a paid key and codetabs no longer responds, so
 * both were removed.)
 */
import { supabase } from './supabase';

const looksLikeChallenge = (html) => /<title>\s*(just a moment|attention required|access denied)/i.test(html.slice(0, 5000));

async function fetchViaEdgeFunction(url) {
  const { data, error } = await supabase.functions.invoke('fetch-page', { body: { url } });
  if (error) {
    // Pull the function's own message out of the error response when there is one
    let msg = error.message;
    try { msg = (await error.context?.json())?.error || msg; } catch { /* keep generic message */ }
    throw new Error(msg);
  }
  if (!data?.html) throw new Error(data?.error || 'Empty response');
  return data.html;
}

async function fetchViaPublicProxy(url) {
  const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`proxy returned HTTP ${res.status}`);
  const html = await res.text();
  if (!html || html.length < 100 || looksLikeChallenge(html)) throw new Error('proxy was blocked by the site');
  return html;
}

async function fetchWithProxy(url) {
  let firstError;
  try {
    const html = await fetchViaEdgeFunction(url);
    if (!looksLikeChallenge(html)) return html;
    firstError = new Error("the site's bot protection blocked the request");
  } catch (e) { firstError = e; }
  try {
    return await fetchViaPublicProxy(url);
  } catch { /* report the main error below */ }
  throw new Error(`Could not fetch the page: ${firstError?.message || 'unknown error'}. Check the URL opens in your browser, or paste the content manually.`);
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
