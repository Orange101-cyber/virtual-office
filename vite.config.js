import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev-only plugin: proxies /api/analyze to the Anthropic API so the
// SEO checker works without Netlify CLI during local development.
function analyzePlugin() {
  return {
    name: 'analyze-api',
    configureServer(server) {
      server.middlewares.use('/api/analyze', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set. Add it to .env file.' }));
          return;
        }

        let body = '';
        for await (const chunk of req) body += chunk;

        try {
          const { content, focusKw, secKws, url, title, meta } = JSON.parse(body);

          if (!content || !focusKw) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'content and focusKw are required' }));
            return;
          }

          const prompt = `Analyse this article for SEO. Return ONLY valid JSON — no markdown fences, no explanation.

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

          const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 1024,
              system: 'You are an SEO audit assistant. Return ONLY valid JSON with no markdown fences.',
              messages: [{ role: 'user', content: prompt }],
            }),
          });

          if (!apiRes.ok) {
            const errBody = await apiRes.text();
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: `Anthropic API error: ${apiRes.status} ${errBody}` }));
            return;
          }

          const message = await apiRes.json();
          const text = message.content[0].text;
          JSON.parse(text); // validate

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(text);
        } catch (err) {
          console.error('Analysis error:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message || 'Analysis failed' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), analyzePlugin()],
  base: '/virtual-office/',
  envDir: '.',
})
