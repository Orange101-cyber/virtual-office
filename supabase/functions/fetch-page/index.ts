// fetch-page — server-side page fetch for Virtual Office (SEO Checker "Fetch",
// Competitor Comparison, Brand Voice website scan).
//
// Browsers can't read other sites directly (CORS), and the free public CORS
// proxies the app used have shut down or time out. Some client sites also sit
// behind Cloudflare, which blocks requests that don't look like a browser, so
// this fetches with normal browser headers.
//
// Guard rails: signed-in users only; public http(s) pages only (private /
// internal addresses refused, including after redirects); 20s timeout; 5 MB
// cap; HTML / text responses only.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-AU,en;q=0.9",
};

const MAX_BYTES = 5_000_000;
const MAX_REDIRECTS = 5;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h === "metadata.google.internal") return true;
  if (!h.includes(".") && !h.includes(":")) return true;                       // single-label names
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (h.includes(":")) return h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:");
  return false;
}

function checkUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Not a valid URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http(s) URLs can be fetched");
  if (u.username || u.password) throw new Error("URLs with credentials aren't allowed");
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("Only standard web ports are allowed");
  if (isBlockedHost(u.hostname)) throw new Error("That address isn't a public website");
  return u;
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error("Page is larger than 5 MB"); }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) { all.set(c, off); off += c.length; }
  return new TextDecoder().decode(all);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  // Signed-in Virtual Office users only (the public anon key alone is not enough).
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: { user } } = await sb.auth.getUser(token).catch(() => ({ data: { user: null } }));
  if (!user) return json({ error: "Sign in to Virtual Office to fetch pages" }, 401);

  let target: URL;
  try {
    const { url } = await req.json();
    target = checkUrl(String(url || "").trim());
  } catch (e) {
    return json({ error: (e as Error).message || "Bad request" }, 400);
  }

  try {
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await fetch(target, { headers: BROWSER_HEADERS, redirect: "manual", signal: AbortSignal.timeout(20000) });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        await res.body?.cancel();
        target = checkUrl(new URL(loc, target).toString());   // re-check every hop
        continue;
      }
      break;
    }
    if (!res || (res.status >= 300 && res.status < 400)) return json({ error: "Too many redirects" }, 502);

    const type = res.headers.get("content-type") || "";
    if (type && !/text\/|application\/(xhtml\+)?xml/i.test(type)) {
      await res.body?.cancel();
      return json({ error: `Not a web page (${type.split(";")[0]})`, status: res.status }, 415);
    }
    const html = await readCapped(res);
    if (!res.ok) {
      const challenge = /just a moment|cf-chl|captcha-delivery|attention required/i.test(html.slice(0, 20000));
      return json({ error: challenge ? `The site's bot protection blocked the request (HTTP ${res.status})` : `The site returned HTTP ${res.status}`, status: res.status, finalUrl: target.toString() }, 502);
    }
    return json({ html, status: res.status, finalUrl: target.toString() });
  } catch (e) {
    const msg = (e as Error).name === "TimeoutError" ? "The site took longer than 20 seconds to respond" : (e as Error).message;
    return json({ error: msg }, 502);
  }
});
