export async function analyzeArticle({ content, focusKw, secKws, url, title, meta }) {
  const res = await fetch('/.netlify/functions/analyze', {
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
