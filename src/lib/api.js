export async function analyzeArticle({ content, focusKw, secKws, url, title, meta }) {
  // Use /api/analyze in dev (Vite plugin), /.netlify/functions/analyze in production (Netlify)
  const endpoint = import.meta.env.DEV ? '/api/analyze' : '/.netlify/functions/analyze';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, focusKw, secKws, url, title, meta }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Analysis failed' }));
    throw new Error(err.error || `Analysis failed (${res.status})`);
  }

  return res.json();
}
