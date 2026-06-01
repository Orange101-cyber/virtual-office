// Background scanner — saves a scan queue to Supabase so it survives
// page navigation and even full page reloads.
import { supabase } from './supabase';

const PSI_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const QUEUE_KEY = 'cyl_scan_queue';

let _running = false;
let _cancelled = false;
let _listeners = new Set();
let _progress = { current: 0, total: 0, url: '', done: false };

async function loadApiKey() {
  // Try env first
  const envKey = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_GOOGLE_PSI_KEY : '';
  if (envKey) return envKey;
  // Fall back to app_settings in Supabase
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'google_psi_key').maybeSingle();
    return data?.value || '';
  } catch { return ''; }
}

function notify() { _listeners.forEach(fn => fn({ ..._progress })); }
export function onScanProgress(fn) { _listeners.add(fn); return () => _listeners.delete(fn); }
export function getScanProgress() { return _progress; }

export function cancelScan() {
  _cancelled = true;
  _running = false;
  _progress = { current: 0, total: 0, url: '', done: true };
  clearQueue();
  notify();
}
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

async function processQueue() {
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

  // Always load the key fresh from DB
  const apiKey = await loadApiKey();

  const remaining = queue.ids.filter(id => !queue.completed?.includes(id));
  const total = queue.ids.length;
  const doneCount = total - remaining.length;

  for (let i = 0; i < remaining.length; i++) {
    if (_cancelled) break;
    const id = remaining[i];
    const { data: scan } = await supabase.from('site_health').select('url').eq('id', id).maybeSingle();
    if (!scan) continue;

    _progress = { current: doneCount + i + 1, total, url: scan.url, done: false };
    notify();

    try {
      const mobile = await runOne(scan.url, 'mobile', apiKey);
      // Wait between mobile and desktop to avoid rate limit
      await new Promise(r => setTimeout(r, 1500));
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
    } catch (err) {
      // Mark as scanned even on failure so we know it was attempted
      console.error('Scan failed for', scan.url, err.message);
      await supabase.from('site_health').update({
        last_scanned: new Date().toISOString(),
      }).eq('id', id);
    }

    // Mark completed in queue + notify so UI updates immediately
    const q = loadQueue();
    if (q) {
      q.completed = [...(q.completed || []), id];
      saveQueue(q);
    }
    _progress = { current: doneCount + i + 1, total, url: '', done: false };
    notify();

    if (i < remaining.length - 1) await new Promise(r => setTimeout(r, 5000));
  }

  _progress = { current: total, total, url: '', done: true };
  _running = false;
  clearQueue();
  notify();
}

export function startBackgroundScan(scanIds) {
  if (_running) return;
  _cancelled = false;
  const queue = { ids: scanIds, completed: [], startedAt: Date.now() };
  saveQueue(queue);
  processQueue();
}

export function resumeScan() {
  const queue = loadQueue();
  if (!queue || !queue.ids?.length) return;
  const remaining = queue.ids.filter(id => !queue.completed?.includes(id));
  if (remaining.length === 0) { clearQueue(); return; }
  processQueue();
}
