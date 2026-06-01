// Background scanner — saves a scan queue to Supabase so it survives
// page navigation and even full page reloads.
import { supabase } from './supabase';

const PSI_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const QUEUE_KEY = 'cyl_scan_queue';

let _running = false;
let _listeners = new Set();
let _progress = { current: 0, total: 0, url: '', done: false };

function notify() { _listeners.forEach(fn => fn({ ..._progress })); }
export function onScanProgress(fn) { _listeners.add(fn); return () => _listeners.delete(fn); }
export function getScanProgress() { return _progress; }
export function isScanning() { return _running; }

function saveQueue(queue) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch {}
}
function loadQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || 'null'); } catch { return null; }
}
function clearQueue() {
  try { localStorage.removeItem(QUEUE_KEY); } catch {}
}

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

async function processQueue(apiKey) {
  if (_running) return;
  _running = true;

  const queue = loadQueue();
  if (!queue || !queue.ids?.length) {
    _running = false;
    _progress = { current: 0, total: 0, url: '', done: true };
    clearQueue();
    notify();
    return;
  }

  const remaining = queue.ids.filter(id => !queue.completed?.includes(id));
  const total = queue.ids.length;
  const doneCount = total - remaining.length;

  for (let i = 0; i < remaining.length; i++) {
    const id = remaining[i];
    // Get URL for this scan
    const { data: scan } = await supabase.from('site_health').select('url').eq('id', id).maybeSingle();
    if (!scan) continue;

    _progress = { current: doneCount + i + 1, total, url: scan.url, done: false };
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
      }).eq('id', id);
    } catch {
      // Skip failed, continue
    }

    // Mark completed in queue
    const q = loadQueue();
    if (q) {
      q.completed = [...(q.completed || []), id];
      saveQueue(q);
    }

    if (i < remaining.length - 1) await new Promise(r => setTimeout(r, 2000));
  }

  _progress = { current: total, total, url: '', done: true };
  _running = false;
  clearQueue();
  notify();
}

export function startBackgroundScan(scanIds, apiKey) {
  if (_running) return;
  const queue = { ids: scanIds, completed: [], apiKey, startedAt: Date.now() };
  saveQueue(queue);
  processQueue(apiKey);
}

// Resume any interrupted scan on module load
export function resumeScan() {
  const queue = loadQueue();
  if (!queue || !queue.ids?.length) return;
  const remaining = queue.ids.filter(id => !queue.completed?.includes(id));
  if (remaining.length === 0) { clearQueue(); return; }
  processQueue(queue.apiKey || '');
}
