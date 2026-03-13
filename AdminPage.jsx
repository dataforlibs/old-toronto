import { useState, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { fetchAllPageviews, fetchAllEvents } from './analytics';
import { SUPABASE_URL } from './config';

// ── Login ────────────────────────────────────────────────────────────────────
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
        <div className="admin-field"><label>Username</label>
          <input type="text" value={user} onChange={e => setUser(e.target.value)} autoComplete="username" autoFocus />
        </div>
        <div className="admin-field"><label>Password</label>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} autoComplete="current-password" />
        </div>
        {error && <div className="admin-error">{error}</div>}
        <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }}>Sign In</button>
      </form>
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon }) {
  return (
    <div className="admin-stat-card">
      {icon && <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>}
      <div className="admin-stat-value">{value}</div>
      <div className="admin-stat-label">{label}</div>
    </div>
  );
}

// ── Horizontal Bar Chart ─────────────────────────────────────────────────────
function BarChart({ data, labelKey, valueKey, title, maxBars = 10 }) {
  const sorted = [...data].sort((a, b) => b[valueKey] - a[valueKey]).slice(0, maxBars);
  const max = Math.max(...sorted.map(d => d[valueKey]), 1);
  return (
    <div className="admin-chart-card">
      <h4>{title}</h4>
      <div className="admin-bar-chart">
        {sorted.map((d, i) => (
          <div key={i} className="admin-bar-row">
            <span className="admin-bar-label">{d[labelKey] || '—'}</span>
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

// ── Daily Chart ───────────────────────────────────────────────────────────────
function DailyChart({ dailyCounts }) {
  const max = Math.max(...dailyCounts.map(d => d.count), 1);
  return (
    <div className="admin-chart-card">
      <h4>Pageviews — Last 14 Days</h4>
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

// ── Visitor Map ───────────────────────────────────────────────────────────────
function VisitorMap({ visitors }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }

    const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true, minZoom: 2 });
    mapInstance.current = map;
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 18,
    }).addTo(map);

    if (visitors.length === 0) { map.setView([30, 0], 2); return; }

    const clusters = {};
    for (const v of visitors) {
      const key = `${Number(v.lat).toFixed(2)},${Number(v.lng).toFixed(2)}`;
      if (!clusters[key]) clusters[key] = { lat: Number(v.lat), lng: Number(v.lng), city: v.city, region: v.region, country: v.country_name || v.country, count: 0, sessions: new Set() };
      clusters[key].count++;
      if (v.session_id) clusters[key].sessions.add(v.session_id);
    }

    const bounds = [];
    for (const cl of Object.values(clusters)) {
      const r = Math.max(6, Math.min(24, 6 + cl.count * 2));
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:${r*2}px;height:${r*2}px;border-radius:50%;background:rgba(94,74,46,0.75);border:2px solid rgba(244,236,224,0.9);display:flex;align-items:center;justify-content:center;font-size:${Math.max(10,r-2)}px;font-weight:700;color:#f4ece0;font-family:'Cormorant Garamond',serif;box-shadow:0 2px 8px rgba(0,0,0,0.25);">${cl.count > 1 ? cl.count : ''}</div>`,
        iconSize: [r*2, r*2], iconAnchor: [r, r],
      });
      const parts = [cl.city, cl.region, cl.country].filter(Boolean);
      const label = parts.join(', ') || 'Unknown';
      L.marker([cl.lat, cl.lng], { icon })
        .bindPopup(`<div style="font-family:'Cormorant Garamond',serif;font-size:15px;font-weight:700;color:#5e4a2e;">${label}</div><div style="font-size:11px;color:#a89878;margin-top:3px;">${cl.count} visit${cl.count>1?'s':''} · ${cl.sessions.size} session${cl.sessions.size>1?'s':''}</div>`)
        .addTo(map);
      bounds.push([cl.lat, cl.lng]);
    }

    if (bounds.length === 1) map.setView(bounds[0], 5);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 });

    return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
  }, [visitors]);

  return (
    <div className="admin-chart-card">
      <h4>🌍 Visitor Map {visitors.length > 0 && <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--faded)' }}>({visitors.length} with coordinates)</span>}</h4>
      {visitors.length === 0
        ? <div className="admin-empty">No geo data yet</div>
        : <div ref={mapRef} style={{ height: 380, borderRadius: 4, overflow: 'hidden' }} />}
    </div>
  );
}

// ── Recent Visits Table ───────────────────────────────────────────────────────
function RecentTable({ pageviews }) {
  return (
    <div className="admin-chart-card">
      <h4>Recent Visits</h4>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Time</th><th>Page</th><th>City</th><th>Region</th>
              <th>Country</th><th>Device</th><th>Browser</th><th>Referrer</th>
            </tr>
          </thead>
          <tbody>
            {pageviews.slice(0, 50).map((p, i) => {
              let ref = 'Direct';
              if (p.referrer) { try { ref = new URL(p.referrer).hostname; } catch {} }
              return (
                <tr key={i}>
                  <td>{p.created_at ? new Date(p.created_at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '—'}</td>
                  <td>{p.page || '/'}</td>
                  <td>{p.city || '—'}</td>
                  <td>{p.region || '—'}</td>
                  <td>{p.country_name || p.country || '—'}</td>
                  <td>{p.device_type || '—'}</td>
                  <td>{p.browser || '—'}</td>
                  <td className="admin-ref-cell">{ref}</td>
                </tr>
              );
            })}
            {pageviews.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--faded)' }}>No visits recorded yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function AdminDashboard({ onLogout }) {
  const [pageviews, setPageviews] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('overview');
  const [days, setDays] = useState(30);
  const configured = !!SUPABASE_URL;

  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      try {
        const [pv, ev] = await Promise.all([fetchAllPageviews(), fetchAllEvents()]);
        setPageviews(pv);
        setEvents(ev);
      } catch (e) { setErr(e.message); }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (days === 0) return pageviews;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    return pageviews.filter(p => p.created_at >= cutoff);
  }, [pageviews, days]);

  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const weekAgo = new Date(now - 7 * 86400000).toISOString();

    const total = filtered.length;
    const uniqueSessions = new Set(filtered.map(p => p.session_id)).size;
    const todayViews = filtered.filter(p => p.created_at?.startsWith(todayStr)).length;
    const weekViews = filtered.filter(p => p.created_at >= weekAgo).length;

    // Daily counts
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dailyMap = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      dailyMap[key] = { label: `${dayNames[d.getDay()]}\n${d.getMonth()+1}/${d.getDate()}`, count: 0 };
    }
    for (const p of filtered) {
      const d = p.created_at?.slice(0, 10);
      if (d && dailyMap[d]) dailyMap[d].count++;
    }
    const dailyCounts = Object.values(dailyMap);

    // Countries — use country_name if available, else country code
    const countryCounts = {};
    for (const p of filtered) {
      const c = p.country_name || p.country || null;
      if (!c) continue;
      countryCounts[c] = (countryCounts[c] || 0) + 1;
    }
    const unknowns = filtered.filter(p => !p.country_name && !p.country).length;
    if (unknowns > 0) countryCounts['Unknown'] = unknowns;
    const countries = Object.entries(countryCounts).map(([country, count]) => ({ country, count }));

    // Cities
    const cityCounts = {};
    for (const p of filtered) {
      if (!p.city) continue;
      const key = [p.city, p.region, p.country || ''].filter(Boolean).join(', ');
      cityCounts[key] = (cityCounts[key] || 0) + 1;
    }
    const cities = Object.entries(cityCounts).map(([city, count]) => ({ city, count }));

    // Regions
    const regionCounts = {};
    for (const p of filtered) {
      if (!p.region) continue;
      const key = [p.region, p.country_name || p.country].filter(Boolean).join(', ');
      regionCounts[key] = (regionCounts[key] || 0) + 1;
    }
    const regions = Object.entries(regionCounts).map(([region, count]) => ({ region, count }));

    // Pages
    const pageCounts = {};
    for (const p of filtered) { pageCounts[p.page || '/'] = (pageCounts[p.page || '/'] || 0) + 1; }
    const topPages = Object.entries(pageCounts).map(([page, count]) => ({ page, count }));

    // Devices
    const deviceCounts = {};
    for (const p of filtered) { deviceCounts[p.device_type || 'Unknown'] = (deviceCounts[p.device_type || 'Unknown'] || 0) + 1; }
    const devices = Object.entries(deviceCounts).map(([device, count]) => ({ device, count }));

    // Browsers
    const browserCounts = {};
    for (const p of filtered) { browserCounts[p.browser || 'Unknown'] = (browserCounts[p.browser || 'Unknown'] || 0) + 1; }
    const browsers = Object.entries(browserCounts).map(([browser, count]) => ({ browser, count }));

    // Referrers
    const refCounts = {};
    for (const p of filtered) {
      let ref = 'Direct';
      if (p.referrer) { try { ref = new URL(p.referrer).hostname; } catch {} }
      refCounts[ref] = (refCounts[ref] || 0) + 1;
    }
    const referrers = Object.entries(refCounts).map(([source, count]) => ({ source, count }));

    // Languages
    const langCounts = {};
    for (const p of filtered) {
      const l = (p.language || 'Unknown').split('-')[0];
      langCounts[l] = (langCounts[l] || 0) + 1;
    }
    const languages = Object.entries(langCounts).map(([language, count]) => ({ language, count }));

    // Geo visitors for map
    const geoVisitors = filtered.filter(p => {
      const lat = typeof p.lat === 'number' ? p.lat : parseFloat(p.lat);
      const lng = typeof p.lng === 'number' ? p.lng : parseFloat(p.lng);
      return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
    }).map(p => ({
      lat: typeof p.lat === 'number' ? p.lat : parseFloat(p.lat),
      lng: typeof p.lng === 'number' ? p.lng : parseFloat(p.lng),
      city: p.city || null,
      region: p.region || null,
      country: p.country || null,
      country_name: p.country_name || null,
      session_id: p.session_id,
    }));

    // Events
    const eventCounts = {};
    for (const e of events) { eventCounts[e.event_name || 'unknown'] = (eventCounts[e.event_name || 'unknown'] || 0) + 1; }
    const topEvents = Object.entries(eventCounts).map(([event, count]) => ({ event, count }));

    return { total, uniqueSessions, todayViews, weekViews, dailyCounts, countries, cities, regions, topPages, devices, browsers, referrers, languages, geoVisitors, topEvents };
  }, [filtered, events]);

  if (!configured) {
    return (
      <div className="admin-wrap">
        <div className="admin-header">
          <h2>📊 Analytics Dashboard</h2>
          <button className="btn btn-ghost" onClick={onLogout}>Sign Out</button>
        </div>
        <div className="admin-setup-box">
          <h3>⚙️ Supabase Not Configured</h3>
          <p>Add your credentials to <code>src/config.js</code>.</p>
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

  const TABS = [
    { id: 'overview', label: '📈 Overview' },
    { id: 'geo',      label: '🌍 Geography' },
    { id: 'recent',   label: '🕐 Recent' },
  ];

  return (
    <div className="admin-wrap">
      {/* Header */}
      <div className="admin-header">
        <h2>📊 Analytics Dashboard</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Day range filter */}
          {[7, 14, 30, 90, 0].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`btn ${days === d ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '4px 10px', fontSize: 12 }}>
              {d === 0 ? 'All' : `${d}d`}
            </button>
          ))}
          <button className="btn btn-ghost" onClick={onLogout}>Sign Out</button>
        </div>
      </div>

      {err && <div className="admin-error" style={{ marginBottom: 16 }}>Error: {err}</div>}

      {/* Stat cards */}
      <div className="admin-stats-grid">
        <StatCard icon="👁" label="Total Pageviews" value={stats.total.toLocaleString()} />
        <StatCard icon="🙋" label="Unique Sessions" value={stats.uniqueSessions.toLocaleString()} />
        <StatCard icon="📅" label="Today" value={stats.todayViews.toLocaleString()} />
        <StatCard icon="📆" label="Last 7 Days" value={stats.weekViews.toLocaleString()} />
        <StatCard icon="🌍" label="Countries" value={stats.countries.filter(c => c.country !== 'Unknown').length} />
        <StatCard icon="🏙" label="Cities" value={stats.cities.length} />
        <StatCard icon="🗺" label="With Coordinates" value={stats.geoVisitors.length} />
        <StatCard icon="⚡" label="Events" value={events.length.toLocaleString()} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 500, border: 'none', background: 'none',
              cursor: 'pointer', borderBottom: tab === t.id ? '2px solid var(--ink)' : '2px solid transparent',
              color: tab === t.id ? 'var(--ink)' : 'var(--faded)', marginBottom: -1,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div>
          <DailyChart dailyCounts={stats.dailyCounts} />
          <div className="admin-charts-row">
            <BarChart data={stats.topPages} labelKey="page" valueKey="count" title="Top Pages" />
            <BarChart data={stats.referrers} labelKey="source" valueKey="count" title="Referrers" />
          </div>
          <div className="admin-charts-row">
            <BarChart data={stats.devices} labelKey="device" valueKey="count" title="Devices" />
            <BarChart data={stats.browsers} labelKey="browser" valueKey="count" title="Browsers" />
          </div>
          <div className="admin-charts-row">
            <BarChart data={stats.languages} labelKey="language" valueKey="count" title="Languages" />
            {stats.topEvents.length > 0 && (
              <BarChart data={stats.topEvents} labelKey="event" valueKey="count" title="Events" />
            )}
          </div>
        </div>
      )}

      {/* Geography tab */}
      {tab === 'geo' && (
        <div>
          <VisitorMap visitors={stats.geoVisitors} />
          <div className="admin-charts-row">
            <BarChart data={stats.countries} labelKey="country" valueKey="count" title={`Countries (${stats.countries.length})`} maxBars={15} />
            <BarChart data={stats.regions} labelKey="region" valueKey="count" title={`Regions (${stats.regions.length})`} maxBars={15} />
          </div>
          <BarChart data={stats.cities} labelKey="city" valueKey="count" title={`Cities (${stats.cities.length})`} maxBars={20} />
        </div>
      )}

      {/* Recent tab */}
      {tab === 'recent' && <RecentTable pageviews={filtered} />}
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────
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
      {authed ? <AdminDashboard onLogout={handleLogout} /> : <AdminLogin onAuth={() => setAuthed(true)} />}
    </>
  );
}
