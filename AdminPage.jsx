import { useState, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { fetchAllPageviews, fetchAllEvents } from './analytics';
import { SUPABASE_URL } from './config';

// ── Login Gate ──────────────────────────────────────────────────────────────
function AdminLogin({ onAuth }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (user === 'old-toronto' && pass === 'old-toronto-stats') {
      sessionStorage.setItem('_ot_admin', '1');
      onAuth();
    } else {
      setError('Invalid credentials');
    }
  };

  return (
    <div className="admin-login-wrap">
      <form className="admin-login-box" onSubmit={handleSubmit}>
        <div className="admin-login-icon">🔐</div>
        <h2>Admin Access</h2>
        <p className="admin-login-sub">Enter credentials to view analytics</p>
        <div className="admin-field">
          <label>Username</label>
          <input type="text" value={user} onChange={e => setUser(e.target.value)} autoComplete="username" autoFocus />
        </div>
        <div className="admin-field">
          <label>Password</label>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} autoComplete="current-password" />
        </div>
        {error && <div className="admin-error">{error}</div>}
        <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }}>Sign In</button>
      </form>
    </div>
  );
}

// ── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }) {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-value">{value}</div>
      <div className="admin-stat-label">{label}</div>
      {sub && <div className="admin-stat-sub">{sub}</div>}
    </div>
  );
}

// ── Bar Chart (horizontal) ──────────────────────────────────────────────────
function BarChart({ data, labelKey, valueKey, title, maxBars = 10 }) {
  const sorted = [...data].sort((a, b) => b[valueKey] - a[valueKey]).slice(0, maxBars);
  const max = Math.max(...sorted.map(d => d[valueKey]), 1);
  return (
    <div className="admin-chart-card">
      <h4>{title}</h4>
      <div className="admin-bar-chart">
        {sorted.map((d, i) => (
          <div key={i} className="admin-bar-row">
            <span className="admin-bar-label">{d[labelKey]}</span>
            <div className="admin-bar-track">
              <div className="admin-bar-fill" style={{ width: `${(d[valueKey] / max) * 100}%` }} />
            </div>
            <span className="admin-bar-count">{d[valueKey]}</span>
          </div>
        ))}
        {sorted.length === 0 && <div className="admin-empty">No data yet</div>}
      </div>
    </div>
  );
}

// ── Daily Bar Chart (vertical, last 14 days) ────────────────────────────────
function DailyChart({ dailyCounts, title }) {
  const max = Math.max(...dailyCounts.map(d => d.count), 1);
  return (
    <div className="admin-chart-card">
      <h4>{title}</h4>
      <div className="admin-daily-chart">
        {dailyCounts.map((d, i) => (
          <div key={i} className="admin-daily-col">
            <div className="admin-daily-count">{d.count || ''}</div>
            <div className="admin-daily-bar-wrap">
              <div className="admin-daily-bar"
                style={{ height: `${Math.max((d.count / max) * 100, d.count > 0 ? 4 : 0)}%` }} />
            </div>
            <div className="admin-daily-label">{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Visitor Map (Leaflet) ───────────────────────────────────────────────────
function VisitorMap({ visitors }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }

    const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true, minZoom: 2 });
    mapInstance.current = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 18
    }).addTo(map);

    if (visitors.length === 0) {
      map.setView([30, 0], 2);
      return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
    }

    // Cluster by city (combine visitors at same lat/lng)
    const clusters = {};
    for (const v of visitors) {
      const key = `${Number(v.lat).toFixed(2)},${Number(v.lng).toFixed(2)}`;
      if (!clusters[key]) clusters[key] = { lat: Number(v.lat), lng: Number(v.lng), city: v.city, country: v.country, count: 0, sessions: new Set() };
      clusters[key].count++;
      if (v.session_id) clusters[key].sessions.add(v.session_id);
    }

    const bounds = [];
    Object.values(clusters).forEach(cl => {
      const r = Math.max(6, Math.min(22, 6 + cl.count * 2));
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:${r*2}px;height:${r*2}px;border-radius:50%;background:rgba(94,74,46,0.7);border:2px solid rgba(244,236,224,0.9);display:flex;align-items:center;justify-content:center;font-size:${Math.max(10,r-2)}px;font-weight:700;color:#f4ece0;font-family:'Cormorant Garamond',serif;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${cl.count > 1 ? cl.count : ''}</div>`,
        iconSize: [r*2, r*2], iconAnchor: [r, r],
      });
      const label = [cl.city, cl.country].filter(Boolean).join(', ') || 'Unknown';
      L.marker([cl.lat, cl.lng], { icon })
        .bindPopup(`<div style="font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:700;color:#5e4a2e;">${label}</div><div style="font-size:12px;color:#a89878;margin-top:4px;">${cl.count} visit${cl.count > 1 ? 's' : ''} · ${cl.sessions.size} session${cl.sessions.size > 1 ? 's' : ''}</div>`)
        .addTo(map);
      bounds.push([cl.lat, cl.lng]);
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 5);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 });
    } else {
      map.setView([30, 0], 2);
    }

    return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
  }, [visitors]);

  return (
    <div className="admin-chart-card">
      <h4>🌍 Visitor Locations</h4>
      {visitors.length === 0 ? (
        <div className="admin-empty">No geo data yet — visitors will appear once tracked with location</div>
      ) : (
        <div ref={mapRef} style={{ height: 380, borderRadius: 4, overflow: 'hidden' }} />
      )}
    </div>
  );
}

// ── Helper: safely parse lat/lng which may come back as strings from Supabase
function parseCoord(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? null : n;
}

// ── Helper: deduplicate pageviews — prefer geo-enriched row per session
function deduplicatePageviews(pageviews) {
  // Group by session_id + page, keep the row that has geo data if available
  const map = new Map();
  for (const p of pageviews) {
    const key = `${p.session_id}__${p.page}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, p);
    } else {
      // Prefer the row with geo data
      const hasGeo = parseCoord(p.lat) !== null;
      const existingHasGeo = parseCoord(existing.lat) !== null;
      if (hasGeo && !existingHasGeo) map.set(key, p);
    }
  }
  return Array.from(map.values());
}

// ── Dashboard ───────────────────────────────────────────────────────────────
function AdminDashboard({ onLogout }) {
  const [pageviews, setPageviews] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [rawCount, setRawCount] = useState(0);
  const configured = !!SUPABASE_URL;

  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    (async () => {
      try {
        const [pv, ev] = await Promise.all([fetchAllPageviews(), fetchAllEvents()]);
        setRawCount(pv.length);
        // Deduplicate: one row per session+page, preferring rows with geo
        setPageviews(deduplicatePageviews(pv));
        setEvents(ev);
      } catch (e) {
        setErr(e.message);
      }
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const weekAgo = new Date(now - 7 * 86400000).toISOString();

    const total = pageviews.length;
    const uniqueSessions = new Set(pageviews.map(p => p.session_id)).size;
    const todayViews = pageviews.filter(p => p.created_at?.startsWith(todayStr)).length;
    const weekViews = pageviews.filter(p => p.created_at >= weekAgo).length;

    // Daily counts (last 14 days)
    const dailyMap = {};
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      const dayName = dayNames[d.getDay()];
      const monthDay = `${d.getMonth()+1}/${d.getDate()}`;
      dailyMap[key] = { date: key, label: i <= 7 ? `${dayName}\n${monthDay}` : monthDay, count: 0 };
    }
    for (const p of pageviews) {
      const d = p.created_at?.slice(0, 10);
      if (d && dailyMap[d]) dailyMap[d].count++;
    }
    const dailyCounts = Object.values(dailyMap);

    // Top pages
    const pageCounts = {};
    for (const p of pageviews) { pageCounts[p.page || '/'] = (pageCounts[p.page || '/'] || 0) + 1; }
    const topPages = Object.entries(pageCounts).map(([page, count]) => ({ page, count }));

    // Devices
    const deviceCounts = {};
    for (const p of pageviews) { deviceCounts[p.device_type || 'Unknown'] = (deviceCounts[p.device_type || 'Unknown'] || 0) + 1; }
    const devices = Object.entries(deviceCounts).map(([device, count]) => ({ device, count }));

    // Browsers
    const browserCounts = {};
    for (const p of pageviews) { browserCounts[p.browser || 'Unknown'] = (browserCounts[p.browser || 'Unknown'] || 0) + 1; }
    const browsers = Object.entries(browserCounts).map(([browser, count]) => ({ browser, count }));

    // Referrers
    const refCounts = {};
    for (const p of pageviews) {
      let ref = 'Direct';
      if (p.referrer) { try { ref = new URL(p.referrer).hostname; } catch {} }
      refCounts[ref] = (refCounts[ref] || 0) + 1;
    }
    const referrers = Object.entries(refCounts).map(([source, count]) => ({ source, count }));

    // Countries — only count rows that actually have country data
    const countryCounts = {};
    for (const p of pageviews) {
      const c = p.country || null;
      if (!c) continue;
      countryCounts[c] = (countryCounts[c] || 0) + 1;
    }
    const unknownCountry = pageviews.filter(p => !p.country).length;
    if (unknownCountry > 0) countryCounts['Unknown'] = unknownCountry;
    const countries = Object.entries(countryCounts).map(([country, count]) => ({ country, count }));

    // Cities — only count rows with city data
    const cityCounts = {};
    for (const p of pageviews) {
      if (!p.city) continue;
      const c = [p.city, p.country_code].filter(Boolean).join(', ');
      cityCounts[c] = (cityCounts[c] || 0) + 1;
    }
    const cities = Object.entries(cityCounts).map(([city, count]) => ({ city, count }));

    // Geo visitors for map — parse coords safely
    const geoVisitors = pageviews
      .map(p => ({
        lat: parseCoord(p.lat),
        lng: parseCoord(p.lng),
        city: p.city || null,
        country: p.country || null,
        session_id: p.session_id,
      }))
      .filter(v => v.lat !== null && v.lng !== null);

    // Events
    const eventCounts = {};
    for (const e of events) { eventCounts[e.event_name || 'unknown'] = (eventCounts[e.event_name || 'unknown'] || 0) + 1; }
    const topEvents = Object.entries(eventCounts).map(([event, count]) => ({ event, count }));

    const geoCount = pageviews.filter(p => parseCoord(p.lat) !== null).length;

    return { total, uniqueSessions, todayViews, weekViews, dailyCounts, topPages, devices, browsers, referrers, countries, cities, geoVisitors, topEvents, geoCount };
  }, [pageviews, events]);

  if (!configured) {
    return (
      <div className="admin-wrap">
        <div className="admin-header">
          <h2>📊 Analytics Dashboard</h2>
          <button className="btn btn-ghost" onClick={onLogout}>Sign Out</button>
        </div>
        <div className="admin-setup-box">
          <h3>⚙️ Supabase Not Configured</h3>
          <p>To enable analytics tracking, set up a free Supabase project and add your credentials to <code>src/config.js</code>.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="admin-wrap">
        <div className="admin-header">
          <h2>📊 Analytics Dashboard</h2>
          <button className="btn btn-ghost" onClick={onLogout}>Sign Out</button>
        </div>
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--faded)' }}>
          <div className="compass" style={{ margin: '0 auto 16px' }} />
          Loading analytics data...
        </div>
      </div>
    );
  }

  return (
    <div className="admin-wrap">
      <div className="admin-header">
        <h2>📊 Analytics Dashboard</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--faded)' }}>
            {rawCount} raw rows → {pageviews.length} deduplicated · {stats.geoCount} with geo
          </span>
          <button className="btn btn-ghost" onClick={onLogout}>Sign Out</button>
        </div>
      </div>

      {err && <div className="admin-error" style={{ marginBottom: 16 }}>Error: {err}</div>}

      <div className="admin-stats-grid">
        <StatCard label="Total Pageviews" value={stats.total.toLocaleString()} />
        <StatCard label="Unique Sessions" value={stats.uniqueSessions.toLocaleString()} />
        <StatCard label="Today" value={stats.todayViews.toLocaleString()} />
        <StatCard label="Last 7 Days" value={stats.weekViews.toLocaleString()} />
      </div>

      <DailyChart dailyCounts={stats.dailyCounts} title="Pageviews — Last 14 Days" />

      <VisitorMap visitors={stats.geoVisitors} />

      <div className="admin-charts-row">
        <BarChart data={stats.countries} labelKey="country" valueKey="count" title={`Countries (${stats.countries.length})`} />
        <BarChart data={stats.cities} labelKey="city" valueKey="count" title={`Cities (${stats.cities.length})`} maxBars={8} />
      </div>

      <div className="admin-charts-row">
        <BarChart data={stats.topPages} labelKey="page" valueKey="count" title="Top Pages" />
        <BarChart data={stats.referrers} labelKey="source" valueKey="count" title="Referrers" />
      </div>

      <div className="admin-charts-row">
        <BarChart data={stats.devices} labelKey="device" valueKey="count" title="Devices" />
        <BarChart data={stats.browsers} labelKey="browser" valueKey="count" title="Browsers" />
      </div>

      {stats.topEvents.length > 0 && (
        <BarChart data={stats.topEvents} labelKey="event" valueKey="count" title="Events" />
      )}

      <div className="admin-chart-card">
        <h4>Recent Visits</h4>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Time</th><th>Page</th><th>Location</th><th>Device</th><th>Browser</th><th>Referrer</th></tr>
            </thead>
            <tbody>
              {pageviews.slice(0, 50).map((p, i) => {
                const loc = [p.city, p.country_code].filter(Boolean).join(', ') || '—';
                let ref = 'Direct';
                if (p.referrer) { try { ref = new URL(p.referrer).hostname; } catch {} }
                return (
                  <tr key={i}>
                    <td>{p.created_at ? new Date(p.created_at).toLocaleString() : '—'}</td>
                    <td>{p.page || '/'}</td>
                    <td>{loc}</td>
                    <td>{p.device_type || '—'}</td>
                    <td>{p.browser || '—'}</td>
                    <td className="admin-ref-cell">{ref}</td>
                  </tr>
                );
              })}
              {pageviews.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--faded)' }}>No visits recorded yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Export ───────────────────────────────────────────────────────────────────
export default function AdminPage({ onBack }) {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('_ot_admin') === '1');
  const handleLogout = () => { sessionStorage.removeItem('_ot_admin'); setAuthed(false); };

  return (
    <>
      <header>
        <div className="inner">
          <div><h1>Old Toronto<em>Historical Itinerary Planner</em></h1></div>
          <div className="header-right">
            <button className="btn btn-ghost" onClick={onBack}>← Back to Planner</button>
          </div>
        </div>
      </header>
      {authed
        ? <AdminDashboard onLogout={handleLogout} />
        : <AdminLogin onAuth={() => setAuthed(true)} />}
    </>
  );
}
