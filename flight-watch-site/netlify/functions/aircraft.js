// Balmoral Flight Watch — OpenSky aircraft proxy (Netlify Function)
//
// Fetches live aircraft states over the Brisbane bbox server-side. Only ever
// fetches the one hardcoded OpenSky URL — can't be abused as an open proxy.
//
// Caches in-memory for 20 seconds (OpenSky updates ~this often and rate-limits
// anonymous callers). Serves stale data on failure so the map never blanks; the
// cache also absorbs multiple dashboard tabs hitting it at once.

const BBOX = { lamin: -27.65, lomin: 152.85, lamax: -27.25, lomax: 153.30 };
const OPENSKY_URL =
  `https://opensky-network.org/api/states/all?lamin=${BBOX.lamin}&lomin=${BBOX.lomin}&lamax=${BBOX.lamax}&lomax=${BBOX.lomax}`;
const TTL_MS = 20 * 1000; // 20 seconds

let cache = null; // { body, ts }

export async function handler() {
  const now = Date.now();

  if (cache && now - cache.ts < TTL_MS) {
    return respond(200, cache.body, 'HIT');
  }

  try {
    const upstream = await fetch(OPENSKY_URL, { headers: { Accept: 'application/json' } });
    if (!upstream.ok) throw new Error(`OpenSky responded ${upstream.status}`);
    const body = await upstream.text();
    cache = { body, ts: now };
    return respond(200, body, 'MISS');
  } catch (err) {
    if (cache) return respond(200, cache.body, 'STALE');
    return respond(502, JSON.stringify({ error: 'OpenSky fetch failed', detail: String(err) }), 'MISS');
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
