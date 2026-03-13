import { SUPABASE_URL, SUPABASE_ANON_KEY, WORKER_URL } from './config';

// If WORKER_URL is set → tracking goes through Cloudflare Worker (real geo).
// Otherwise falls back to direct Supabase insert (no geo).
const useWorker = () => !!WORKER_URL;
const isConfigured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY) || !!WORKER_URL;

function getSessionId() {
  let sid = sessionStorage.getItem('_ot_sid');
  if (!sid) {
    sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('_ot_sid', sid);
  }
  return sid;
}

function getDeviceType() {
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

function getBrowser() {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  return 'Other';
}

function sendViaWorker(type, payload) {
  try {
    fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...payload }),
    }).catch(() => {});
  } catch {}
}

function sendDirect(table, payload) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  try {
    fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {}
}

export function trackPageview(page = '/') {
  if (!isConfigured()) return;
  const payload = {
    page,
    referrer: document.referrer || null,
    device_type: getDeviceType(),
    browser: getBrowser(),
    screen_width: window.innerWidth,
    session_id: getSessionId(),
    language: navigator.language || null,
  };
  if (useWorker()) {
    sendViaWorker('pageview', payload);
  } else {
    sendDirect('pageviews', payload);
  }
}

export function trackEvent(eventName, data = {}) {
  if (!isConfigured()) return;
  const payload = {
    event_name: eventName,
    event_data: data,
    session_id: getSessionId(),
    page: window.location.hash || '/',
  };
  if (useWorker()) {
    sendViaWorker('event', payload);
  } else {
    sendDirect('events', payload);
  }
}

async function query(table, params = '') {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Query failed: ${res.status}`);
  return res.json();
}

export async function fetchAllPageviews() {
  return query('pageviews', 'select=*&order=created_at.desc&limit=5000');
}

export async function fetchAllEvents() {
  return query('events', 'select=*&order=created_at.desc&limit=2000');
}
