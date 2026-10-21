// Keeps the Client Bucket List (client_pages) in step with the SEO Checker:
// saving a report updates the matching bucket-list page, or adds it if the
// page isn't there yet. The SEO score column already reads from reports.

// Same page regardless of http/https, www, trailing slash, query or #anchor.
export function normalisePageUrl(url = '') {
  return String(url || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '')
    .replace(/[?#].*$/, '').replace(/\/+$/, '');
}

const CATEGORY_FOR_PAGE_TYPE = { blog: 'blog', landing_page: 'landing', seo_page: 'service' };
const today = () => new Date().toISOString().slice(0, 10);

// What the bucket-list row should look like after this report is saved.
// Only fills what the report knows; never overwrites a category or dates the
// team set by hand.
export function bucketPatch(fields, existing) {
  const focus = (fields.focus_keyphrase || '').trim();
  const patch = {
    url: (fields.url || '').trim(),
    index_setting: fields.index_setting || 'index',
    updated_at: new Date().toISOString(),
  };
  if (fields.article_title?.trim()) patch.title = fields.article_title.trim();

  if (!existing) {
    patch.page_category = CATEGORY_FOR_PAGE_TYPE[fields.page_type] || 'blog';
    patch.focus_keyword = focus || null;
    patch.is_published = true;
    if (fields.is_refresh) { patch.is_refreshed = true; patch.date_refreshed = today(); }
    else patch.date_published = today();
    return patch;
  }

  if (fields.is_refresh) {
    patch.is_refreshed = true;
    if (!existing.date_refreshed || existing.date_refreshed < today()) patch.date_refreshed = today();
    // A refresh that targets a new keyword keeps the original as focus_keyword.
    const old = (existing.focus_keyword || '').trim().toLowerCase();
    if (focus && old && focus.toLowerCase() !== old) patch.new_focus_keyword = focus;
    else if (focus && !old) patch.focus_keyword = focus;
  } else if (focus) {
    patch.focus_keyword = focus;
  }
  if (existing.is_published == null) patch.is_published = true;
  return patch;
}

export async function syncReportToBucketList(supabase, { clientId, clientName, fields }) {
  const key = normalisePageUrl(fields.url);
  if (!key || !clientName) return { action: 'skipped', reason: 'no URL' };

  const { data: rows, error } = await supabase.from('client_pages')
    .select('*').eq('client_name', clientName);
  if (error) throw error;
  const existing = (rows || []).find(p => normalisePageUrl(p.url) === key) || null;
  const patch = bucketPatch(fields, existing);

  if (existing) {
    const { error: upErr } = await supabase.from('client_pages').update(patch).eq('id', existing.id);
    if (upErr) throw upErr;
    return { action: 'updated', page: { ...existing, ...patch } };
  }

  const row = { ...patch, client_name: clientName, client_id: clientId || null, created_at: new Date().toISOString() };
  const { error: insErr } = await supabase.from('client_pages').insert(row);
  if (insErr) throw insErr;

  // Same side effects as adding a page by hand in the Bucket List:
  // track it in Site Health and add its keyword to the cannibalisation bank.
  supabase.from('site_health').select('id').eq('url', row.url).maybeSingle()
    .then(({ data }) => { if (!data) return supabase.from('site_health').insert({ client_name: clientName, url: row.url, created_at: new Date().toISOString() }); })
    .catch(() => {});
  if (row.focus_keyword && clientId) {
    const { data: client } = await supabase.from('clients').select('past_keywords').eq('id', clientId).single();
    const bank = (client?.past_keywords || '').split('\n').map(k => k.trim()).filter(Boolean);
    if (!bank.some(k => k.toLowerCase() === row.focus_keyword.toLowerCase())) {
      await supabase.from('clients').update({ past_keywords: [...bank, row.focus_keyword].join('\n') }).eq('id', clientId);
    }
  }
  return { action: 'created', page: row };
}
