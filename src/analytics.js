import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

const isConfigured = () => SUPABASE_URL && SUPABASE_ANON_KEY;

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

// ── Geo lookup (cached per session) ─────────────────────────────────────────
let geoCache = null;
async function getGeo() {
  if (geoCache) return geoCache;
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = await res.json();
    geoCache = {
      country: data.country_name || null,
      country_code: data.country_code || null,
      city: data.city || null,
      region: data.region || null,
      lat: data.latitude || null,
      lng: data.longitude || null,
    };
    return geoCache;
  } catch {
    return null;
  }
}

function send(table, payload) {
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

// ── Track a pageview ────────────────────────────────────────────────────────
export function trackPageview(page = '/') {
  if (!isConfigured()) return;
  const base = {
    page,
    referrer: document.referrer || null,
    device_type: getDeviceType(),
    browser: getBrowser(),
    screen_width: window.innerWidth,
    session_id: getSessionId(),
    language: navigator.language || null,
  };
  getGeo().then(geo => {
    const payload = geo
      ? { ...base, country: geo.country, country_code: geo.country_code, city: geo.city, region: geo.region, lat: geo.lat, lng: geo.lng }
      : base;
    send('pageviews', payload);
  }).catch(() => send('pageviews', base));
}

// ── Track a custom event ────────────────────────────────────────────────────
export function trackEvent(eventName, data = {}) {
  if (!isConfigured()) return;
  send('events', {
    event_name: eventName,
    event_data: data,
    session_id: getSessionId(),
    page: window.location.hash || '/',
  });
}

// ── Query helpers ───────────────────────────────────────────────────────────
async function query(table, params = '') {
  if (!isConfigured()) return [];
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
