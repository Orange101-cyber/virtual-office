// Balmoral Flight Watch — BoM wind proxy
//
// Fetches Brisbane Airport wind observations server-side (BoM blocks browser
// CORS and default fetch User-Agents). Only ever fetches the one hardcoded BoM
// URL, so this can't be abused as an open proxy.
//
// Deploy:  supabase functions deploy flight-watch-wind --no-verify-jwt
//
// Caches in-memory for 5 minutes and serves stale data if BoM is down, so the
// dashboard never blanks.

const BOM_URL = "https://www.bom.gov.au/fwo/IDQ60901/IDQ60901.94578.json";
const TTL_MS = 5 * 60 * 1000; // 5 minutes
const UA = "Mozilla/5.0 (compatible; CYL-FlightWatch/1.0)";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Module-level cache persists while the function instance stays warm
let cache: { body: string; ts: number } | null = null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const now = Date.now();

  // Fresh cache hit
  if (cache && now - cache.ts < TTL_MS) {
    return new Response(cache.body, {
      headers: { ...CORS, "Content-Type": "application/json", "X-Cache": "HIT" },
    });
  }

  // Cache miss — fetch upstream
  try {
    const upstream = await fetch(BOM_URL, {
      headers: { "User-Agent": UA, "Accept": "application/json" },
    });
    if (!upstream.ok) throw new Error(`BoM responded ${upstream.status}`);
    const body = await upstream.text();
    cache = { body, ts: now };
    return new Response(body, {
      headers: { ...CORS, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (err) {
    // Upstream failed — serve stale cache if we have any
    if (cache) {
      return new Response(cache.body, {
        headers: { ...CORS, "Content-Type": "application/json", "X-Cache": "STALE" },
      });
    }
    return new Response(
      JSON.stringify({ error: "BoM fetch failed", detail: String(err) }),
      { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
