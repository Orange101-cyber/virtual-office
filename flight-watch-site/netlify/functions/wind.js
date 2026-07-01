// Balmoral Flight Watch — BoM wind proxy (Netlify Function)
//
// Fetches Brisbane Airport wind observations server-side. BoM blocks browser
// CORS and default fetch User-Agents, so this must run on the server. Only ever
// fetches the one hardcoded BoM URL — can't be abused as an open proxy.
//
// Caches in-memory for 5 minutes and serves stale data if BoM is down so the
// dashboard never blanks.

const BOM_URL = 'https://www.bom.gov.au/fwo/IDQ60901/IDQ60901.94578.json';
const TTL_MS = 5 * 60 * 1000; // 5 minutes
const UA = 'Mozilla/5.0 (compatible; CYL-FlightWatch/1.0)';

// Module-level cache persists while the function instance stays warm
let cache = null; // { body, ts }

export async function handler() {
  const now = Date.now();

  if (cache && now - cache.ts < TTL_MS) {
    return respond(200, cache.body, 'HIT');
  }

  try {
    const upstream = await fetch(BOM_URL, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!upstream.ok) throw new Error(`BoM responded ${upstream.status}`);
    const body = await upstream.text();
    cache = { body, ts: now };
    return respond(200, body, 'MISS');
  } catch (err) {
    if (cache) return respond(200, cache.body, 'STALE');
    return respond(502, JSON.stringify({ error: 'BoM fetch failed', detail: String(err) }), 'MISS');
  }
}

function respond(statusCode, body, cacheState) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-Cache': cacheState,
    },
    body,
  };
}
