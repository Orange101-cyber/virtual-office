const SEO_PROMPT_TEMPLATE = (content, focusKw, secKws, url, title, meta) => `Analyse this article for SEO. Return ONLY valid JSON — no markdown fences, no explanation.

URL: ${url || 'not provided'}
Page Title / H1: ${title || 'not provided'}
Meta Description: ${meta || 'not provided'}
Focus Keyphrase: "${focusKw}"
Secondary Keywords: ${secKws || 'none'}

--- ARTICLE CONTENT ---
${content.substring(0, 8000)}
--- END ---

Return this exact JSON structure:
{"checks":{"meta_title_kw":false,"meta_title_len":false,"meta_desc_kw":false,"meta_desc_len":false,"meta_slug":false,"kw_h1":false,"kw_first100":false,"kw_density":false,"kw_secondary":false,"kw_variations":false,"kw_wordcount":false,"kw_toc":false,"kw_faq":false,"h_one_h1":false,"h_has_h2":false,"h_kw_in_h":false,"img_hero":false,"img_alts":false,"img_kw_alt":false,"img_webp":false,"link_internal":false,"link_external":false,"link_cta_top":false,"link_cta_bot":false,"eeat_author":false,"eeat_date":false,"eeat_location":false,"eeat_data":false},"word_count":0,"h1_found":"","internal_links":0,"notes":"","wins":[],"fixes":[]}

Rules: meta_title_kw=title contains keyphrase; meta_title_len=title≤60chars; meta_desc_kw=meta desc contains keyphrase; meta_desc_len=meta desc 140-160chars; meta_slug=URL slug contains keyphrase words; kw_h1=H1 contains keyphrase; kw_first100=keyphrase in first 100 words; kw_density=density ~1-2%; kw_secondary=all secondary kws appear; kw_variations=word-order variations present; kw_wordcount=1000+ words; kw_toc=table of contents present; kw_faq=FAQ section with 3+ questions; h_one_h1=only one H1; h_has_h2=H2s present; h_kw_in_h=at least one H2/H3 has keyword variation; img_hero=hero image near top; img_alts=all images have alt text; img_kw_alt=at least one alt has keyphrase; img_webp=images use .webp; link_internal=2+ internal links; link_external=1+ external authority link; link_cta_top=CTA in first half; link_cta_bot=CTA at end; eeat_author=author name visible; eeat_date=published date visible; eeat_location=location refs throughout; eeat_data=stat with link present.`;

// Always call Anthropic API directly from the browser.
// Uses VITE_ANTHROPIC_API_KEY from .env (exposed at build time).
export async function analyzeArticle({ content, focusKw, secKws, url, title, meta }) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_ANTHROPIC_API_KEY not set. Add it to your .env file and restart the dev server.');
  }

  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        system: 'You are an SEO audit assistant. Return ONLY valid JSON with no markdown fences.',
        messages: [{ role: 'user', content: SEO_PROMPT_TEMPLATE(content, focusKw, secKws, url, title, meta) }],
      }),
    });
  } catch (fetchErr) {
    throw new Error('Network error calling Anthropic API: ' + fetchErr.message);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => 'unknown error');
    throw new Error(`Anthropic API error ${res.status}: ${errBody}`);
  }

  const message = await res.json();
  const text = message.content[0].text;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('AI returned invalid JSON. Raw response: ' + text.substring(0, 200));
  }
}
