// Background scanner that persists across page navigation.
// Runs as a singleton — only one scan loop at a time.
import { supabase } from './supabase';

const PSI_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

let _scanning = false;
let _progress = { current: 0, total: 0, url: '', done: false };
let _listeners = new Set();

export function getScanProgress() { return _progress; }
export function isScanning() { return _scanning; }

function notify() { _listeners.forEach(fn => fn({ ..._progress })); }
export function onScanProgress(fn) { _listeners.add(fn); return () => _listeners.delete(fn); }

async function runOne(url, strategy, apiKey) {
  const keyParam = apiKey ? `&key=${apiKey}` : '';
  const apiUrl = `${PSI_API}?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&category=accessibility&category=best-practices&category=seo${keyParam}`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`PSI ${res.status}`);
  const data = await res.json();
  const cats = data.lighthouseResult?.categories || {};
  const audits = data.lighthouseResult?.audits || {};
  return {
    performance: Math.round((cats.performance?.score || 0) * 100),
    accessibility: Math.round((cats.accessibility?.score || 0) * 100),
    bestPractices: Math.round((cats['best-practices']?.score || 0) * 100),
    seo: Math.round((cats.seo?.score || 0) * 100),
    lcp: audits['largest-contentful-paint']?.numericValue ? (audits['largest-contentful-paint'].numericValue / 1000).toFixed(1) : null,
    cls: audits['cumulative-layout-shift']?.numericValue?.toFixed(3) || null,
    fcp: audits['first-contentful-paint']?.numericValue ? (audits['first-contentful-paint'].numericValue / 1000).toFixed(1) : null,
    tbt: audits['total-blocking-time']?.numericValue ? Math.round(audits['total-blocking-time'].numericValue) : null,
  };
}

export async function startBackgroundScan(scanIds, apiKey) {
  if (_scanning) return;
  _scanning = true;

  // Load the scan rows we need
  const { data: rows } = await supabase.from('site_health').select('id, url').in('id', scanIds);
  if (!rows?.length) { _scanning = false; return; }

  _progress = { current: 0, total: rows.length, url: '', done: false };
  notify();

  for (let i = 0; i < rows.length; i++) {
    const scan = rows[i];
    _progress = { current: i + 1, total: rows.length, url: scan.url, done: false };
    notify();

    try {
      const mobile = await runOne(scan.url, 'mobile', apiKey);
      const desktop = await runOne(scan.url, 'desktop', apiKey);

      await supabase.from('site_health').update({
        mobile_performance: mobile.performance, mobile_accessibility: mobile.accessibility,
        mobile_best_practices: mobile.bestPractices, mobile_seo: mobile.seo,
        mobile_lcp: mobile.lcp, mobile_cls: mobile.cls, mobile_fcp: mobile.fcp, mobile_tbt: mobile.tbt,
        desktop_performance: desktop.performance, desktop_accessibility: desktop.accessibility,
        desktop_best_practices: desktop.bestPractices, desktop_seo: desktop.seo,
        desktop_lcp: desktop.lcp, desktop_cls: desktop.cls,
        last_scanned: new Date().toISOString(),
      }).eq('id', scan.id);
    } catch {
      // Skip failed URLs, continue scanning
    }

    // Rate limit: 2s between URLs
    if (i < rows.length - 1) await new Promise(r => setTimeout(r, 2000));
  }

  _progress = { current: rows.length, total: rows.length, url: '', done: true };
  _scanning = false;
  notify();
}
