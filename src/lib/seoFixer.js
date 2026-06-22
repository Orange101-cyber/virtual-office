// AI-powered SEO fix engine
// Takes failed checklist items and article content, returns updated fields

import { CHECKS } from '../data/checklist';

const FIX_PROMPT = ({ fields, failedItems, clientContextText }) => {
  const failedDescriptions = failedItems.map(item => `- [${item.id}] ${item.label}${item.crit ? ' (CRITICAL)' : ''}${item.note ? ' — ' + item.note : ''}`).join('\n');

  return `You are an expert SEO editor. Your job is to fix SEO issues in an article while preserving its meaning and tone.

${clientContextText ? `CLIENT CONTEXT:\n${clientContextText}\n\n` : ''}

CURRENT ARTICLE FIELDS:
URL: ${fields.url || ''}
Focus Keyphrase: ${fields.focus_keyphrase || ''}
Secondary Keywords: ${fields.secondary_keywords || ''}
Article Title / H1: ${fields.article_title || ''}
Meta Description: ${fields.meta_description || ''}

ARTICLE CONTENT:
${(fields.article_content || '').substring(0, 8000)}

FAILED SEO CHECKS TO FIX:
${failedDescriptions}

INSTRUCTIONS:
1. Fix every failed check where possible by updating the relevant field
2. Preserve the article's meaning, tone, and structure
3. Match Australian English spelling and style
4. For meta titles: stay under 60 chars and include the focus keyphrase
5. For meta descriptions: 140-160 chars, include the focus keyphrase, be compelling
6. For URL slug: lowercase, hyphens, include focus keyphrase words
7. For article content: only update if needed (e.g. adding FK to first 100 words, adding H2 with keyword variation, adding FAQ section). Keep the main content intact
8. If you update the article content, return the FULL updated content, not a diff
9. For schema/technical items that require external changes (e.g. "Add schema markup"), mark them as "cannot_auto_fix" and explain

Return ONLY valid JSON with this structure:
{
  "updated_fields": {
    "article_title": "Updated title if changed, or null",
    "meta_description": "Updated meta description if changed, or null",
    "url": "Updated URL/slug if changed, or null",
    "article_content": "Full updated article content if changed, or null",
    "focus_keyphrase": "Keep the same unless specifically wrong",
    "secondary_keywords": "Updated if changed, or null"
  },
  "fixes_applied": [
    {
      "check_id": "meta_title_kw",
      "description": "Added focus keyphrase to title",
      "before": "Old value",
      "after": "New value"
    }
  ],
  "cannot_auto_fix": [
    {
      "check_id": "check_id_here",
      "reason": "Requires manual intervention because..."
    }
  ]
}`;
};

export async function fixSeoIssues({ fields, failedItemIds, clientContextText }) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY not set');

  // Get the full item objects for failed IDs
  const allItems = CHECKS.flatMap(c => c.items);
  const failedItems = failedItemIds
    .map(id => allItems.find(i => i.id === id))
    .filter(Boolean);

  if (failedItems.length === 0) {
    return { updated_fields: {}, fixes_applied: [], cannot_auto_fix: [] };
  }

  const prompt = FIX_PROMPT({ fields, failedItems, clientContextText });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 8192,
      system: 'You are an SEO editor. Return ONLY valid JSON, no markdown fences.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Claude error ${res.status}: ${err.substring(0, 200)}`);
  }

  const msg = await res.json();
  let raw = msg.content[0].text;
  raw = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  return JSON.parse(raw);
}

/**
 * Propose a fix for a single check item.
 * Returns a proposal with before/after values that the user can approve or reject.
 */
export async function proposeFixForItem({ fields, checkItem, clientContextText }) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY not set');

  const prompt = `You are an expert SEO editor. Propose a targeted fix for ONE specific SEO issue while preserving the article's meaning and tone.

${clientContextText ? `CLIENT CONTEXT:\n${clientContextText}\n\n` : ''}

CURRENT ARTICLE FIELDS:
URL: ${fields.url || ''}
Focus Keyphrase: ${fields.focus_keyphrase || ''}
Secondary Keywords: ${fields.secondary_keywords || ''}
Article Title / H1: ${fields.article_title || ''}
Meta Description: ${fields.meta_description || ''}

ARTICLE CONTENT:
${(fields.article_content || '').substring(0, 8000)}

SPECIFIC ISSUE TO FIX:
[${checkItem.id}] ${checkItem.label}${checkItem.crit ? ' (CRITICAL)' : ''}${checkItem.note ? '\nNote: ' + checkItem.note : ''}

INSTRUCTIONS:
1. Identify which field(s) need to change to fix this single issue
2. Propose the MINIMAL change needed — preserve everything else
3. Write for Australian English
4. For meta titles: stay under 60 chars, include focus keyphrase
5. For meta descriptions: 140-160 chars, include focus keyphrase
6. For URL slug: lowercase, hyphens, include keyphrase words
7. For article content changes: only modify the specific part that needs fixing — return the FULL updated content with the minimal change applied
8. If this issue cannot be auto-fixed (e.g. needs images, schema markup from a plugin), explain why

Return ONLY valid JSON:
{
  "can_fix": true,
  "field_to_update": "meta_description",
  "current_value": "The current value of that field",
  "proposed_value": "The proposed new value",
  "explanation": "One sentence explaining what was changed and why",
  "confidence": "high"
}

Or if it cannot be auto-fixed:
{
  "can_fix": false,
  "reason": "Why this can't be auto-fixed",
  "manual_instructions": "What the user should do manually"
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 8192,
      system: 'You are an SEO editor. Return ONLY valid JSON, no markdown fences.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Claude error ${res.status}: ${err.substring(0, 200)}`);
  }

  const msg = await res.json();
  let raw = msg.content[0].text;
  raw = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  return JSON.parse(raw);
}
