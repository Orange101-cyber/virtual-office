# Flight Watch — Edge Function deploy (one-time)

These two functions proxy BoM (wind) and OpenSky (aircraft) server-side so the
dashboard gets reliable live data instead of relying on flaky public CORS
proxies. Each function only ever fetches one hardcoded upstream URL, so it can't
be abused as an open proxy — that's why it's safe to run without auth.

## Prerequisites (one-time)

1. Install the Supabase CLI: https://supabase.com/docs/guides/cli
   - macOS: `brew install supabase/tap/supabase`
   - Windows: `scoop install supabase` (or use the installer on the docs page)
2. Log in: `supabase login` (opens a browser to authorise)

## Deploy

From the repo root (`virtual-office/`):

```bash
# Link this repo to your Supabase project (ref is from the dashboard URL)
supabase link --project-ref rdrufdlhfrwczqvmvzgr

# Deploy both functions. --no-verify-jwt makes them publicly callable
# (needed because the static dashboard has no logged-in Supabase session).
supabase functions deploy flight-watch-wind --no-verify-jwt
supabase functions deploy flight-watch-aircraft --no-verify-jwt
```

That's it. The dashboard already points at:
- `https://rdrufdlhfrwczqvmvzgr.supabase.co/functions/v1/flight-watch-wind`
- `https://rdrufdlhfrwczqvmvzgr.supabase.co/functions/v1/flight-watch-aircraft`

## Verify

```bash
curl -i https://rdrufdlhfrwczqvmvzgr.supabase.co/functions/v1/flight-watch-wind \
  -H "apikey: <your-anon-key>"
```

Look for `X-Cache: MISS` on the first call and `HIT` within 5 minutes after.
Wind caches for 5 min, aircraft for 20 sec, and both serve `X-Cache: STALE`
if the upstream is temporarily down (dashboard never blanks).

## If you don't deploy these

The dashboard still works — it falls back to the public CORS proxies built into
`public/flight-watch/dashboard.html`. Deploying just makes the live data faster
and far more reliable.
