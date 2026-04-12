// Export article in the CYL/Luke O'Kelly Word doc template format
// Matches the structure the team uses in their Google Docs

function generateSlug(title, keyword) {
  const base = keyword || title || '';
  return base.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function exportToTemplate({ fields, clientName = '', aiFindings = {}, brief = null }) {
  const title = fields.article_title || '[Title]';
  const fk = fields.focus_keyphrase || '[focus keyphrase]';
  const metaDesc = fields.meta_description || '[Meta description]';
  const url = fields.url || '';
  const secondaryKeywords = (fields.secondary_keywords || '').split(',').map(k => k.trim()).filter(Boolean);
  const content = fields.article_content || '';

  // Build the doc text
  let doc = '';

  // Header
  doc += `${clientName || "Client"} - Blog - NEW: ${title}\n`;
  doc += `Is this an existing blog/LLP?\n No\n`;
  doc += `What type of content is this?\n BLOG - NEW\n`;

  // SEO Title
  doc += `\nSEO Title\n${fields.seo_title || title}\n`;

  // Keywords list
  doc += `\nKeywords list\n\n`;
  doc += `The general rule of thumb is to use three to four keywords per post. That should be one head or main keyword, and a few long tail keywords (or at least variations of the main keyword).\n\n`;
  doc += `Note: A good keyword density is between 1-2%. If your keyword density is too high, Google may penalise your blog post for keyword stuffing.\n\n`;
  doc += `Check here: https://www.seoreviewtools.com/keyword-density-checker/?text-input\n`;
  if (secondaryKeywords.length > 0) {
    secondaryKeywords.forEach(kw => { doc += `${kw}\n`; });
  }

  // Main keywords / focus keyphrase
  doc += `\n\nMain Keywords / Focus keyphrase\n${fk}\n`;

  // Target audience (pulled from brief if available)
  doc += `Target Audience\n${brief?.audience_brief || ''}\n`;

  // Meta description
  doc += `\nMeta description\nIf page is existing add current description\n${metaDesc}\n`;

  // Slug URL
  const slug = url || `https://example.com/${generateSlug(title, fk)}/`;
  doc += `Slug URL\nNEW Slug: ${slug}\n`;

  // Redirect
  doc += `Does this need a redirect of the old link to a new link?\n No\n`;

  // CTA Links
  const ctaLinks = brief?.cta_links || [];
  doc += `CTA Links for buttons on page\n`;
  if (ctaLinks.length > 0) {
    ctaLinks.forEach(link => { doc += `${link}\n`; });
  } else {
    doc += `https://example.com/contact/\n`;
  }

  // Social Post Text
  doc += `Social Post Text\nFACEBOOK\n`;
  doc += brief?.social_posts?.facebook || '[Facebook post copy to be written]';
  doc += `\n\nINSTAGRAM\n`;
  doc += brief?.social_posts?.instagram || '[Instagram post copy to be written]';
  doc += `\n`;

  // Airtable link (placeholder)
  doc += `\nAirtable Link\n[Paste Airtable link here]\n\n\n`;

  // Body
  doc += `Body:\n${title}\n\n`;
  doc += `Table of Contents\n\n`;
  doc += content;

  return doc;
}

export function downloadTemplateFile(content, fileName) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
