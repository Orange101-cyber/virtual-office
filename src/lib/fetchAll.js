// Supabase's REST API returns at most 1,000 rows per request (the project's
// "max rows" setting). Anything beyond that is silently dropped, which is
// what made the Rank Tracker look like it had a keyword limit.
//
// fetchAll(() => supabase.from('t').select('a,b').eq(...).order('id'))
// pages through every row. Pass a FACTORY (a function that builds a fresh
// query), because a query builder can only be run once, and include an
// .order() so paging is stable. Pages are requested in parallel waves.

const PAGE = 1000;

export async function fetchAll(build, { parallel = 4 } = {}) {
  const rows = [];
  for (let wave = 0; ; wave++) {
    const starts = Array.from({ length: parallel }, (_, i) => (wave * parallel + i) * PAGE);
    const res = await Promise.all(starts.map(from => build().range(from, from + PAGE - 1)));
    for (const r of res) {
      if (r.error) return { data: null, error: r.error };
      const d = r.data || [];
      rows.push(...d);
      if (d.length < PAGE) return { data: rows, error: null };
    }
  }
}
