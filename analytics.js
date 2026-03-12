import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

const isConfigured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);

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

// ── Geo lookup ───────────────────────────────────────────────────────────────
// Cached per session in sessionStorage so we only call ipapi once per session.
async function getGeo() {
  // Try session cache first
  const cached = sessionStorage.getItem('_ot_geo');
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }

  // Try multiple geo providers in order
  const providers = [
    // ipinfo.io — CORS-friendly, works from browsers on HTTPS
    async () => {
      const res = await fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error('ipinfo failed');
      const d = await res.json();
      // ipinfo returns loc as "lat,lng" string
      const [lat, lng] = (d.loc || '').split(',').map(Number);
      return {
        country: d.country || null,  // ipinfo only returns country code, use it for both
        country_code: d.country || null,
        city: d.city || null,
        region: d.region || null,
        lat: isNaN(lat) ? null : lat,
        lng: isNaN(lng) ? null : lng,
      };
    },
    // geolocation-db.com — fallback, also CORS-friendly
    async () => {
      const res = await fetch('https://geolocation-db.com/json/', { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error('geolocation-db failed');
      const d = await res.json();
      return {
        country: d.country_name || null,
        country_code: d.country_code || null,
        city: d.city || null,
        region: null,
        lat: typeof d.latitude === 'number' ? d.latitude : null,
        lng: typeof d.longitude === 'number' ? d.longitude : null,
      };
    },
  ]rt { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

const isConfigured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);

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

// ── Geo lookup ───────────────────────────────────────────────────────────────
// Cached per session in sessionStorage so we only call ipapi once per session.
async function getGeo() {
  // Try session cache first
  const cached = sessionStorage.getItem('_ot_geo');
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }

  // Try multiple geo providers in order
  const providers = [
    // ipwho.is — free, HTTPS, CORS-friendly
    async () => {
      const res = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error('ipwho failed');
      const d = await res.json();
      if (!d.success) throw new Error(d.message || 'ipwho error');
      return {
        country: d.country || null,
        country_code: d.country_code || null,
        city: d.city || null,
        region: d.region || null,
        lat: typeof d.latitude === 'number' ? d.latitude : parseFloat(d.latitude) || null,
        lng: typeof d.longitude === 'number' ? d.longitude : parseFloat(d.longitude) || null,
      };
    },
    // ipapi.co — fallback
    async () => {
      const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error('ipapi failed');
      const d = await res.json();
      if (d.error) throw new Error(d.reason || 'ipapi error');
      return {
        country: d.country_name || null,
        country_code: d.country_code || null,
        city: d.city || null,
        region: d.region || null,
        lat: typeof d.latitude === 'number' ? d.latitude : parseFloat(d.latitude) || null,
        lng: typeof d.longitude === 'number' ? d.longitude : parseFloat(d.longitude) || null,
      };
    },
    // freeipapi.com — second fallback
    async () => {
      const res = await fetch('https://freeipapi.com/api/json', { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error('freeipapi failed');
      const d = await res.json();
      return {
        country: d.countryName || null,
        country_code: d.countryCode || null,
        city: d.cityName || null,
        region: d.regionName || null,
        lat: typeof d.latitude === 'number' ? d.latitude : null,
        lng: typeof d.longitude === 'number' ? d.longitude : null,
      };
    },
  ]

  for (const provider of providers) {
    try {
      const geo = await provider();
      // Validate we got real coords
      if (geo.lat && geo.lng) {
        sessionStorage.setItem('_ot_geo', JSON.stringify(geo));
        return geo;
      }
    } catch {
      // try next provider
    }
  }

  return null;
}

// ── Send to Supabase ─────────────────────────────────────────────────────────
function send(table, payload) {
  if (!isConfigured()) return;
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

// ── Track pageview ───────────────────────────────────────────────────────────
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

  // Send immediately without geo, then send again with geo once resolved
  send('pageviews', base);

  getGeo().then(geo => {
    if (!geo) return;
    // Update the record with geo data by sending a separate event
    // (Supabase insert only — we patch via a second insert tagged with session)
    send('pageviews', {
      ...base,
      country: geo.country,
      country_code: geo.country_code,
      city: geo.city,
      region: geo.region,
      lat: geo.lat,
      lng: geo.lng,
      _geo_update: true, // flag so you can deduplicate in queries if needed
    });
  }).catch(() => {});
}

// ── Track event ──────────────────────────────────────────────────────────────
export function trackEvent(eventName, data = {}) {
  if (!isConfigured()) return;
  send('events', {
    event_name: eventName,
    event_data: data,
    session_id: getSessionId(),
    page: window.location.hash || '/',
  });
}

// ── Query helpers ────────────────────────────────────────────────────────────
async function query(table, params = '') {
  if (!isConfigured()) return [];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Query failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function fetchAllPageviews() {
  // Fetch all rows including geo-enriched ones, ordered newest first
  return query('pageviews', 'select=*&order=created_at.desc&limit=5000');
}

export async function fetchAllEvents() {
  return query('events', 'select=*&order=created_at.desc&limit=2000');
}
