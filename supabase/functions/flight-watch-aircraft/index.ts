// Balmoral Flight Watch — OpenSky aircraft proxy
//
// Fetches live aircraft states over the Brisbane bbox server-side. Only ever
// fetches the one hardcoded OpenSky URL, so it can't be abused as an open proxy.
//
// Deploy:  supabase functions deploy flight-watch-aircraft --no-verify-jwt
//
// Caches in-memory for 20 seconds (OpenSky updates ~this often and rate-limits
// anonymous callers). Serves stale data on upstream failure so the map never
// blanks. The 20s cache also absorbs multiple dashboard tabs hitting it at once.

const BBOX = { lamin: -27.65, lomin: 152.85, lamax: -27.25, lomax: 153.30 };
const OPENSKY_URL =
  `https://opensky-network.org/api/states/all?lamin=${BBOX.lamin}&lomin=${BBOX.lomin}&lamax=${BBOX.lamax}&lomax=${BBOX.lomax}`;
const TTL_MS = 20 * 1000; // 20 seconds

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

let cache: { body: string; ts: number } | null = null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const now = Date.now();

  if (cache && now - cache.ts < TTL_MS) {
    return new Response(cache.body, {
      headers: { ...CORS, "Content-Type": "application/json", "X-Cache": "HIT" },
    });
  }

  try {
    const upstream = await fetch(OPENSKY_URL, {
      headers: { "Accept": "application/json" },
    });
    if (!upstream.ok) throw new Error(`OpenSky responded ${upstream.status}`);
    const body = await upstream.text();
    cache = { body, ts: now };
    return new Response(body, {
      headers: { ...CORS, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (err) {
    if (cache) {
      return new Response(cache.body, {
        headers: { ...CORS, "Content-Type": "application/json", "X-Cache": "STALE" },
      });
    }
    return new Response(
      JSON.stringify({ error: "OpenSky fetch failed", detail: String(err) }),
      { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
