# Balmoral Flight Watch — standalone Netlify site

This folder is a **self-contained** site (dashboard + backend proxies) that runs
on its own Netlify deployment, separate from the main CYL Virtual Office. The
Virtual Office just has a "☾ Flight Watch" tab that links here.

```
flight-watch-site/
  public/index.html            ← dashboard + PIN gate (PIN: 1954)
  netlify/functions/wind.js     ← BoM wind proxy      → /api/wind
  netlify/functions/aircraft.js ← OpenSky proxy        → /api/aircraft
  netlify.toml                  ← publish + redirects
```

## One-time Netlify setup (all in the browser — no CLI, no terminal)

1. Go to **app.netlify.com** → **Add new site** → **Import an existing project**
2. Connect GitHub and pick the **`Orange101-cyber/virtual-office`** repo
3. On the config screen, set:
   - **Base directory:** `flight-watch-site`
   - **Publish directory:** `flight-watch-site/public`
   - **Functions directory:** `flight-watch-site/netlify/functions`
   - (Build command: leave blank — it's plain HTML, nothing to build)
4. Deploy.
5. Go to **Site settings → Change site name** and set it to **`cyl-flight-watch`**
   so the URL becomes `https://cyl-flight-watch.netlify.app`.
   - If you use a different name, update `FLIGHT_WATCH_URL` in
     `src/components/AppShell.jsx` in the main repo to match, and push.

That's it. Every push to `master` auto-redeploys this site, same as the Virtual
Office. Netlify runs the two functions server-side, so BoM + OpenSky data is
fetched reliably with no CORS issues.

## Using it

- Open the Virtual Office → click **☾ Flight Watch** (only you see this tab) →
  it opens `cyl-flight-watch.netlify.app` in a new tab.
- Enter PIN **1954**. Press **F11** for fullscreen on the office screen.
- The 🔒 button (bottom-left) re-locks it.

## Verify the live data path

Open the site, press **F12 → Network tab**. You should see calls to
`/api/wind` and `/api/aircraft` returning `200` with an `X-Cache` header
(`MISS` first, then `HIT`). Wind caches 5 min, aircraft 20 sec, and both serve
`X-Cache: STALE` if a source is briefly down so the dashboard never blanks.

## Change the PIN

Edit the `PIN` constant near the top of the `<script>` in `public/index.html`
and push.
