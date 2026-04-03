import mammoth from 'mammoth';

/**
 * Parse a CYL SEO template Word doc and extract fields.
 * Recognises the standard template layout with labeled sections.
 */
export async function parseDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = result.value;

  const fields = {};

  // SEO Title
  const seoTitle = extractBetween(text, 'SEO Title', 'Keywords list');
  if (seoTitle) fields.article_title = seoTitle.trim();

  // Focus keyphrase — first line after "Main Keywords / Focus keyphrase"
  const focusBlock = extractBetween(text, 'Main Keywords / Focus keyphrase', 'Target Audience');
  if (focusBlock) {
    // Take just the keyword part before any " - SV:" or similar metadata
    const firstLine = focusBlock.split('\n').filter(l => l.trim())[0] || '';
    fields.focus_keyphrase = firstLine.replace(/\s*[-–—]\s*SV:.*$/i, '').trim();
  }

  // Secondary keywords — lines between "Keywords list" header and "Main Keywords"
  const kwBlock = extractBetween(text, 'keyword density checker', 'Main Keywords');
  if (!kwBlock) {
    // Try alternate position
    const kwBlock2 = extractBetween(text, 'Keywords list', 'Main Keywords');
    if (kwBlock2) {
      const kws = kwBlock2.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('The general') && !l.startsWith('Note:') && !l.startsWith('Check here'));
      if (kws.length) fields.secondary_keywords = kws.join(', ');
    }
  } else {
    const kws = kwBlock.split('\n').map(l => l.trim()).filter(l => l && l.length > 2);
    if (kws.length) fields.secondary_keywords = kws.join(', ');
  }

  // Meta description
  const metaBlock = extractBetween(text, 'Meta description', 'Slug URL');
  if (metaBlock) {
    // Skip the "If page is existing..." instruction line
    const lines = metaBlock.split('\n').map(l => l.trim()).filter(l =>
      l && !l.startsWith('If page is existing')
    );
    if (lines.length) fields.meta_description = lines[0];
  }

  // URL / Slug
  const slugBlock = extractBetween(text, 'Slug URL', 'Does this need a redirect');
  if (slugBlock) {
    const urlMatch = slugBlock.match(/https?:\/\/[^\s]+/);
    if (urlMatch) fields.url = urlMatch[0];
  }

  // Body content — everything between "Body:" and "Internal CYL Checklist"
  const body = extractBetween(text, 'Body:', 'Internal CYL Checklist');
  if (body) {
    fields.article_content = body.trim();
  } else {
    // Try finding body after the social post sections
    const body2 = extractBetween(text, 'Airtable Link', 'Internal CYL Checklist');
    if (body2) {
      // Skip the airtable URL line
      const lines = body2.split('\n');
      const startIdx = lines.findIndex(l => l.trim() && !l.trim().startsWith('http'));
      if (startIdx >= 0) fields.article_content = lines.slice(startIdx).join('\n').trim();
    }
  }

  return fields;
}

function extractBetween(text, startMarker, endMarker) {
  const startIdx = text.toLowerCase().indexOf(startMarker.toLowerCase());
  if (startIdx === -1) return null;
  const after = text.substring(startIdx + startMarker.length);
  if (endMarker) {
    const endIdx = after.toLowerCase().indexOf(endMarker.toLowerCase());
    if (endIdx === -1) return after.trim();
    return after.substring(0, endIdx).trim();
  }
  return after.trim();
}
