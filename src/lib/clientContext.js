import { supabase } from './supabase';

/**
 * Fetch the complete client context for use in AI tools.
 * Returns business info, brand voice, past keywords, past articles,
 * past ads, and performance data.
 */
export async function getClientContext(clientName) {
  if (!clientName) return null;

  // Get client record + profile in parallel
  const [profileRes, clientRes] = await Promise.all([
    supabase.from('client_brand_voice').select('*').eq('client_name', clientName).single(),
    supabase.from('clients').select('*').eq('name', clientName).single(),
  ]);

  const profile = profileRes.data || {};
  const client = clientRes.data || {};

  return {
    name: clientName,
    clientId: client.id,
    // Business info
    website: profile.website_url,
    businessDescription: profile.business_description,
    services: profile.services,
    locations: profile.locations_served,
    differentiators: profile.differentiators,
    targetPersonas: profile.target_personas,
    targetDemographics: profile.target_demographics,
    competitors: profile.competitors,
    businessGoals: profile.business_goals,
    complianceNotes: profile.compliance_notes,
    // Brand voice
    tone: profile.tone,
    keySellingPoints: profile.key_selling_points,
    wordsToAvoid: profile.words_to_avoid,
    brandColors: profile.brand_colors,
    notes: profile.notes,
    // Keyword bank
    pastKeywords: client.past_keywords || '',
  };
}

/**
 * Format client context as a text block for AI prompts.
 * Only includes fields that are filled in.
 */
export function formatContextForPrompt(ctx) {
  if (!ctx) return '';
  const parts = [];
  parts.push(`CLIENT: ${ctx.name}`);
  if (ctx.website) parts.push(`Website: ${ctx.website}`);
  if (ctx.businessDescription) parts.push(`Business: ${ctx.businessDescription}`);
  if (ctx.services) parts.push(`Services: ${ctx.services}`);
  if (ctx.locations) parts.push(`Locations served: ${ctx.locations}`);
  if (ctx.differentiators) parts.push(`Differentiators: ${ctx.differentiators}`);
  if (ctx.targetPersonas) parts.push(`Target personas: ${ctx.targetPersonas}`);
  if (ctx.targetDemographics) parts.push(`Target demographics: ${ctx.targetDemographics}`);
  if (ctx.competitors) parts.push(`Competitors: ${ctx.competitors}`);
  if (ctx.businessGoals) parts.push(`Business goals: ${ctx.businessGoals}`);
  if (ctx.tone) parts.push(`Tone of voice: ${ctx.tone}`);
  if (ctx.keySellingPoints) parts.push(`Key selling points:\n${ctx.keySellingPoints}`);
  if (ctx.wordsToAvoid) parts.push(`Words/phrases to avoid: ${ctx.wordsToAvoid}`);
  if (ctx.complianceNotes) parts.push(`Compliance notes: ${ctx.complianceNotes}`);
  if (ctx.notes) parts.push(`Other notes: ${ctx.notes}`);
  return parts.join('\n');
}

/**
 * Fetch aggregated activity feed for a client across all tools.
 */
export async function getClientActivity(clientName, clientId, limit = 20) {
  const activities = [];

  try {
    // Content plan items
    const { data: plans } = await supabase.from('content_plans')
      .select('id, title, status, created_at, focus_keyword')
      .eq('client_name', clientName)
      .order('created_at', { ascending: false })
      .limit(10);
    (plans || []).forEach(p => activities.push({
      type: 'content_plan', icon: '📅',
      title: `Content plan: ${p.title}`,
      subtitle: `Status: ${p.status} · FK: ${p.focus_keyword || '—'}`,
      date: p.created_at,
      link: '/content-planner',
    }));

    // Briefs
    const { data: briefs } = await supabase.from('content_briefs')
      .select('id, title, created_at')
      .eq('client_name', clientName)
      .order('created_at', { ascending: false })
      .limit(10);
    (briefs || []).forEach(b => activities.push({
      type: 'brief', icon: '📝',
      title: `Brief generated: ${b.title}`,
      subtitle: 'Content brief created',
      date: b.created_at,
      link: '/brief-generator',
    }));

    // Reports (SEO Checker)
    if (clientId) {
      const { data: reports } = await supabase.from('reports')
        .select('id, name, article_title, updated_at')
        .eq('client_id', clientId)
        .order('updated_at', { ascending: false })
        .limit(10);
      (reports || []).forEach(r => activities.push({
        type: 'seo_report', icon: '🔍',
        title: `SEO report: ${r.article_title || r.name}`,
        subtitle: 'SEO checklist updated',
        date: r.updated_at,
        link: '/seo-checker',
      }));
    }

    // Keyword research
    const { data: research } = await supabase.from('keyword_research')
      .select('id, seed_topic, niche, created_at')
      .eq('client_name', clientName)
      .order('created_at', { ascending: false })
      .limit(5);
    (research || []).forEach(r => activities.push({
      type: 'research', icon: '🔑',
      title: `Keyword research: ${r.seed_topic}`,
      subtitle: r.niche || 'Research session',
      date: r.created_at,
      link: '/keyword-research',
    }));

    // Ad copy
    const { data: adCopy } = await supabase.from('ad_copy')
      .select('id, headline, platform, status, created_at')
      .eq('client_name', clientName)
      .order('created_at', { ascending: false })
      .limit(10);
    (adCopy || []).forEach(a => activities.push({
      type: 'ad_copy', icon: '📣',
      title: `Ad copy: ${a.headline || '(no headline)'}`,
      subtitle: `${a.platform} · ${a.status}`,
      date: a.created_at,
      link: '/ad-copy-library',
    }));

    // Generated images
    const { data: images } = await supabase.from('ad_generated_images')
      .select('id, platform, created_at')
      .eq('client_name', clientName)
      .order('created_at', { ascending: false })
      .limit(5);
    (images || []).forEach(i => activities.push({
      type: 'ad_image', icon: '✨',
      title: `Ad creative generated`,
      subtitle: `Fal.ai · ${i.platform}`,
      date: i.created_at,
      link: '/ad-inspiration',
    }));

  } catch (err) {
    console.warn('Activity fetch error:', err);
  }

  // Sort by date desc
  return activities
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit);
}

/**
 * Fetch summary stats for a client across all tools.
 */
export async function getClientStats(clientName, clientId) {
  const stats = {
    articles: 0,
    plannedContent: 0,
    briefed: 0,
    avgSeoScore: 0,
    adCopyCount: 0,
    adImages: 0,
    keywordResearchCount: 0,
  };

  try {
    // Reports count + avg score
    if (clientId) {
      const { data: reports } = await supabase.from('reports')
        .select('checklist_state').eq('client_id', clientId);
      stats.articles = reports?.length || 0;
      if (reports?.length) {
        const scores = reports.map(r => {
          const states = r.checklist_state || {};
          const total = Object.keys(states).length || 1;
          const passed = Object.values(states).filter(Boolean).length;
          return Math.round((passed / total) * 100);
        });
        stats.avgSeoScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      }
    }

    // Content plans
    const { data: plans } = await supabase.from('content_plans')
      .select('status').eq('client_name', clientName);
    stats.plannedContent = plans?.filter(p => p.status === 'Planned').length || 0;
    stats.briefed = plans?.filter(p => p.status === 'Briefed' || p.status === 'Client Approved').length || 0;

    // Ad copy
    const { count: adCopyCount } = await supabase.from('ad_copy')
      .select('id', { count: 'exact' }).eq('client_name', clientName);
    stats.adCopyCount = adCopyCount || 0;

    // Ad images
    const { count: adImages } = await supabase.from('ad_generated_images')
      .select('id', { count: 'exact' }).eq('client_name', clientName);
    stats.adImages = adImages || 0;

    // Keyword research
    const { count: kwCount } = await supabase.from('keyword_research')
      .select('id', { count: 'exact' }).eq('client_name', clientName);
    stats.keywordResearchCount = kwCount || 0;
  } catch (err) {
    console.warn('Stats fetch error:', err);
  }

  return stats;
}
