import { useState, useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import {
  LOCATIONS_URL, IMAGES_URL, LOCATION_NAMES_URL, LANDMARKS_URL,
  START_POINTS, ERAS, ERA_LABELS,
  haversine, walkMin, optimizeRoute, filterByEra, findNearbyImages,
  buildImageGrid, buildLandmarkGrid, findNearestLandmark,
  bestThumb, fixTplUrl, tplFallback, isTplUrl, isGcsUrl,
  buildEnriched, fetchStreetRoute, distToRoute, archiveUrl, parseImageYear,
} from './utils'
import { trackPageview, trackEvent } from './analytics'
import AdminPage from './AdminPage'

// ── Escape helper ───────────────────────────────────────────────────────────
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// ── Photo Modal Component ───────────────────────────────────────────────────
function PhotoModal({ images, onClose }) {
  const [idx, setIdx] = useState(0);
  const topStripRef = useRef(null);

  useEffect(() => { setIdx(0); }, [images]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && idx > 0) setIdx(idx - 1);
      if (e.key === 'ArrowRight' && idx < images.length - 1) setIdx(idx + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [idx, images.length, onClose]);

  if (!images || images.length === 0) return null;
  const img = images[idx];
  const af = img.archives_fields || {};
  const isPlaceholder = !img.image?.url && !img.image?.thumb_url;
  const isTpl = isTplUrl(img.image?.url) || isTplUrl(img.image?.thumb_url);

  const fullUrl = isTpl ? fixTplUrl(img.image?.url || img.image?.thumb_url) : (img.image?.url || img.image?.thumb_url || '');
  const linkHref = isPlaceholder ? (img._oldtoUrl || '#') : archiveUrl(img);
  const linkText = isPlaceholder ? 'BROWSE ON OLDTO' : 'OPEN FULL IMAGE';

  const displayDate = af.date || img.date || '';
  const fields = [
    img._totalPhotos ? ['Photos at location', `${img._totalPhotos} archival photos (full dataset)`] : null,
    displayDate ? ['Date of Creation', displayDate] : null,
    af.physical_desc ? ['Physical Description', af.physical_desc] : null,
    af.citation ? ['Archival Citation', af.citation] : null,
    af.condition ? ['Access conditions', af.condition] : null,
    img.geocode?.address ? ['Location', img.geocode.address] : null,
    img.geocode?.lat ? ['Coordinates', `${img.geocode.lat.toFixed(5)}, ${img.geocode.lng.toFixed(5)}`] : null,
  ].filter(Boolean);

  const filmstrip = images.map((im, i) => {
    const isTplImg = isTplUrl(im.image?.url) || isTplUrl(im.image?.thumb_url);
    const thumbSrc = isTplImg ? fixTplUrl(im.image?.thumb_url || im.image?.url) : (im.image?.thumb_url || '');
    return (
      <img key={i} src={thumbSrc} alt=""
        className={i === idx ? 'active' : ''}
        onClick={() => setIdx(i)}
        onError={(e) => tplFallback(e.target)} />
    );
  });

  return (
    <div className="photo-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pm-filmstrip" ref={topStripRef}>{filmstrip}</div>
      <div style={{ display:'flex', alignItems:'stretch', flex:1, minHeight:0, position:'relative' }}>
        <button className="pm-nav-btn" onClick={() => idx > 0 && setIdx(idx-1)}
          style={{ visibility: idx > 0 ? 'visible' : 'hidden' }}>&#8249;</button>
        <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', background:'#000', padding:12 }}>
          {isTpl && !fullUrl ? (
            <div className="pm-tpl-notice">
              <div style={{fontSize:40}}>🏛</div>
              <div>Toronto Public Library image</div>
              <a href={img.image?.url || '#'} target="_blank" rel="noreferrer" style={{color:'#7ab',textDecoration:'underline'}}>View on Toronto Public Library →</a>
            </div>
          ) : (
            <img src={fullUrl} alt="" style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain', borderRadius:2 }}
              onError={(e) => {
                if (isTpl && e.target.src.includes('/full')) {
                  e.target.src = e.target.src.replace('/full', '/preview');
                } else {
                  e.target.style.display = 'none';
                }
              }} />
          )}
        </div>
        <div className="pm-meta-pane">
          <div style={{ fontSize:11, color:'#666', letterSpacing:'.5px', marginBottom:10, textTransform:'uppercase' }}>City of Toronto Archives</div>
          <div style={{ fontSize:20, fontWeight:700, color:'#111', lineHeight:1.3, marginBottom:20, fontFamily:"'Cormorant Garamond',Georgia,serif" }}>{img.title || 'Archival location'}</div>
          <div style={{ fontSize:13, color:'#333', lineHeight:1.6, flex:1 }}>
            {fields.length > 0 ? fields.map(([label, val], i) => (
              <div key={i} style={{ marginBottom:14 }}>
                <div className="pm-field-label">{label}</div>
                <div className="pm-field-value">{String(val)}</div>
              </div>
            )) : (
              <div style={{ color:'#999', fontStyle:'italic', fontSize:13 }}>No metadata available in sample dataset.<br/>Full archive has photos at this location.</div>
            )}
          </div>
          <div style={{ marginTop:16, paddingTop:14, borderTop:'1px solid #e5e5e5', display:'flex', gap:10, flexWrap:'wrap' }}>
            <a href={linkHref} target="_blank" rel="noreferrer"
              style={{ display:'inline-block', background: isPlaceholder ? '#5e4a2e' : '#1a6496', color:'#fff', fontSize:12, fontWeight:600, padding:'7px 16px', borderRadius:3, textDecoration:'none', letterSpacing:'.3px' }}>{linkText}</a>
            {images.length > 1 && <div style={{ fontSize:11, color:'#999', alignSelf:'center' }}>{idx+1} of {images.length}</div>}
          </div>
        </div>
        <button className="pm-nav-btn" onClick={() => idx < images.length-1 && setIdx(idx+1)}
          style={{ visibility: idx < images.length-1 ? 'visible' : 'hidden' }}>&#8250;</button>
      </div>
      <div className="pm-filmstrip">{filmstrip}</div>
      <button className="pm-close-btn" onClick={onClose} title="Close">✕</button>
    </div>
  );
}

// ── Stop Card Component ─────────────────────────────────────────────────────
function StopCard({ stop, index, startOrPrev, onOpenLightbox, enrichedCache }) {
  const [expanded, setExpanded] = useState(false);
  const lm = stop.landmark;
  const isLandmark = !!lm;
  const legDist = haversine(startOrPrev.lat, startOrPrev.lng, stop.lat, stop.lng);
  const hasImgs = stop.images && stop.images.length > 0;
  const displayName = isLandmark ? lm.name : stop.name;

  const openLb = (e) => {
    e.stopPropagation();
    const cached = enrichedCache.find(s => s.lat === stop.lat && s.lng === stop.lng);
    onOpenLightbox(stop.lat, stop.lng, cached?.images || stop.images || []);
  };

  return (
    <>
      <div className="walk-leg">
        🚶 {legDist < 0.1 ? '< 100m' : `${(legDist*1000).toFixed(0)}m`} · ~{Math.max(1, walkMin(legDist))} min
      </div>
      <div className={`stop-card${isLandmark ? ' is-landmark' : ''}${expanded ? ' active' : ''}`}
        style={{ animationDelay: `${index * 0.05}s` }}
        onClick={() => setExpanded(!expanded)}>
        <div className="top-row">
          <div className="stop-num">{index + 1}</div>
          <div className="stop-info">
            <div className="stop-name">{displayName}</div>
            <div className="stop-meta">
              {isLandmark && <span className="landmark-badge">★ Landmark</span>}
              {lm?.desc && <div className="landmark-desc">{lm.desc}</div>}
              <span className="photos-badge" onClick={openLb}>📸 {stop.images.length} archival photos</span>
              {stop.earliestYear && <span>📅 {stop.earliestYear}–{stop.latestYear}</span>}
              <span>📍 {stop.distFromStart?.toFixed(1) || '—'} km</span>
            </div>
          </div>
        </div>
        {hasImgs && (
          <div className="stop-images-strip">
            {stop.images.slice(0, 8).map((im, ii) => (
              <img key={ii} src={fixTplUrl(im.image?.thumb_url || '')} alt={im.title || ''}
                title={im.title || ''} onClick={openLb} onError={(e) => tplFallback(e.target)} />
            ))}
            {stop.images.length > 8 && (
              <div className="more-photos" onClick={openLb}>+{stop.images.length-8}<br/>more</div>
            )}
          </div>
        )}
        <div className="stop-gallery">
          <div className="gallery-label">Archival photos — click to open viewer</div>
          {hasImgs ? (
            <div className="gallery-scroll">
              {stop.images.map((im, ii) => (
                <div key={ii} className="gallery-item" onClick={openLb}>
                  <img src={fixTplUrl(im.image?.thumb_url || '')} alt={im.title || ''}
                    onError={(e) => { e.target.parentElement.style.display = 'none'; }} />
                  <div className="caption">{im.title || ''}</div>
                  {im.date && <div className="year">{im.date}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize:12, color:'var(--faded)', padding:'8px 0', cursor:'pointer' }} onClick={openLb}>
              📷 Browse nearby photos from this era
            </div>
          )}
          <a className="oldto-link" href={`https://www.oldto.org/#${stop.lat},${stop.lng}`} target="_blank" rel="noreferrer"
            onClick={(e) => e.stopPropagation()}>View on OldTO map →</a>
        </div>
      </div>
    </>
  );
}

// ── Route Map Component ─────────────────────────────────────────────────────
function RouteMap({ route, dayIdx, locationsRaw, imagesRaw, locationNamesRaw, landmarksRaw, imgByLocKey, era, imgGrid, onOpenLightbox }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (collapsed || !mapRef.current) return;

    // Clean up previous map
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }

    let map = null;
    let initialized = false;

    function initMap() {
      if (initialized || !mapRef.current) return;
      initialized = true;

      map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: false });
      mapInstanceRef.current = map;
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 19
      }).addTo(map);

      const dayStops = route.days[dayIdx] || [];
      const waypoints = [route.start, ...dayStops];
      const bounds = [];

      // Icons
      const stopIcon = (n, isLm) => L.divIcon({
        className: '',
        html: `<div style="width:28px;height:28px;border-radius:50%;background:${isLm?'#c9a84c':'#5e4a2e'};border:2px solid #f4ece0;display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:13px;font-weight:700;color:#f4ece0;box-shadow:0 2px 6px rgba(0,0,0,.3);">${isLm?'★':n}</div>`,
        iconSize: [28,28], iconAnchor: [14,14], popupAnchor: [0,-16]
      });
      const startIcon = L.divIcon({
        className: '',
        html: `<div style="width:28px;height:28px;border-radius:50%;background:#a0522d;border:2px solid #f4ece0;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,.3);">🚶</div>`,
        iconSize: [28,28], iconAnchor: [14,14], popupAnchor: [0,-16]
      });
      const cameraIcon = (thumbUrl, count) => {
        const badgeVal = count > 1 ? (count >= 100 ? '99+' : count) : null;
        const badge = badgeVal ? `<div style="position:absolute;top:-6px;right:-6px;background:#a0522d;color:#f4ece0;border-radius:10px;font-size:9px;font-weight:700;padding:1px 5px;min-width:16px;text-align:center;line-height:14px;border:1.5px solid #f4ece0;white-space:nowrap;">${badgeVal}</div>` : '';
        return L.divIcon({
          className: '',
          html: thumbUrl
            ? `<div style="position:relative;width:34px;height:34px;"><div style="width:34px;height:34px;border-radius:4px;overflow:hidden;border:2px solid #f4ece0;box-shadow:0 2px 5px rgba(0,0,0,.4);cursor:pointer;"><img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.parentElement.style.background='#8b6f47';this.parentElement.innerHTML='📷';"></div>${badge}</div>`
            : `<div style="position:relative;width:30px;height:30px;"><div style="width:30px;height:30px;background:#8b6f47;border:2px solid #f4ece0;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 5px rgba(0,0,0,.3);">📷</div>${badge}</div>`,
          iconSize: thumbUrl ? [34,34] : [30,30], iconAnchor: thumbUrl ? [17,17] : [15,15], popupAnchor: [0,-20]
        });
      };

      // Start marker
      L.marker([route.start.lat, route.start.lng], { icon: startIcon })
        .bindPopup(`<div class="lm-popup-name">🚶 ${esc(route.start.name)}</div><div class="lm-popup-desc">Starting point</div>`)
        .addTo(map);
      bounds.push([route.start.lat, route.start.lng]);

      // Stop markers
      dayStops.forEach((stop, si) => {
        const lm = stop.landmark;
        const name = lm ? lm.name : stop.name;
        const thumb = stop.images.length > 0 ? bestThumb(stop.images) : null;
        const popupHTML = `
          ${thumb ? `<img class="lm-popup-thumb" src="${thumb}" onerror="this.style.display='none'">` : ''}
          <div class="lm-popup-name"><span class="stop-popup-num">${si+1}</span>${esc(name)}</div>
          ${lm ? `<div class="lm-popup-badge">★ Landmark</div>${lm.desc ? `<div class="lm-popup-desc">${esc(lm.desc)}</div>` : ''}` : ''}
          <div style="font-size:11px;color:var(--faded);margin-top:4px;">📸 ${stop.images.length} archival photos${stop.earliestYear ? ` · ${stop.earliestYear}–${stop.latestYear}` : ''}</div>
          <a class="lm-popup-link" href="https://www.oldto.org/#${stop.lat},${stop.lng}" target="_blank">View on OldTO →</a>`;
        L.marker([stop.lat, stop.lng], { icon: stopIcon(si+1, !!lm) }).bindPopup(popupHTML).addTo(map);
        bounds.push([stop.lat, stop.lng]);
      });

      if (bounds.length) map.fitBounds(bounds, { padding: [40,40] });

      // Async: fetch street route + add photo markers
      (async () => {
        const routedPoints = await fetchStreetRoute(waypoints);
        const allPoints = routedPoints || waypoints;
        const isStraight = !routedPoints;

        L.polyline(allPoints.map(p => [p.lat, p.lng]), {
          color: '#8b6f47', weight: isStraight ? 2.5 : 4, opacity: 0.85,
          dashArray: isStraight ? '6 4' : null, lineJoin: 'round', lineCap: 'round'
        }).addTo(map);

        // Nearby landmarks
        const vb = map.getBounds();
        const stopKeys = new Set(dayStops.map(s => `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`));
        let lmAdded = 0;
        for (const lm of (landmarksRaw || [])) {
          if (!lm.lat || !lm.lng || !vb.contains([lm.lat, lm.lng])) continue;
          if (stopKeys.has(`${lm.lat.toFixed(4)},${lm.lng.toFixed(4)}`)) continue;
          if (lmAdded++ > 60) break;
          const icon = L.divIcon({
            className: '',
            html: `<div style="width:20px;height:20px;border-radius:50%;background:#c9a84c;opacity:0.75;border:1.5px solid #f4ece0;display:flex;align-items:center;justify-content:center;font-size:9px;box-shadow:0 1px 4px rgba(0,0,0,.25);">★</div>`,
            iconSize:[20,20], iconAnchor:[10,10], popupAnchor:[0,-12]
          });
          L.marker([lm.lat, lm.lng], { icon })
            .bindPopup(`<div class="lm-popup-badge">★ Landmark</div><div class="lm-popup-name">${esc(lm.name)}</div>${lm.desc?`<div class="lm-popup-desc">${esc(lm.desc)}</div>`:''}<a class="lm-popup-link" href="https://www.wikidata.org/wiki/${lm.qid}" target="_blank">Wikidata →</a>`)
            .addTo(map);
        }

        // Photo markers along route
        const PATH_THRESHOLD = 0.10, CLUSTER_RADIUS = 0.08;
        const pad = PATH_THRESHOLD / 111;
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        for (const p of allPoints) {
          if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
          if (p.lng < minLng) minLng = p.lng; if (p.lng > maxLng) maxLng = p.lng;
        }
        minLat -= pad; maxLat += pad; minLng -= pad; maxLng += pad;

        const eraAll = (era.min === 0 && era.max === 9999);
        const candidates = [];
        for (const [key, yearCounts] of Object.entries(locationsRaw || {})) {
          const [latS, lngS] = key.split(',');
          const lat = parseFloat(latS), lng = parseFloat(lngS);
          if (isNaN(lat)||isNaN(lng)) continue;
          if (lat<minLat||lat>maxLat||lng<minLng||lng>maxLng) continue;
          if (distToRoute(lat, lng, allPoints) > PATH_THRESHOLD) continue;
          let total = 0;
          for (const [ys, cnt] of Object.entries(yearCounts)) {
            const yr = parseInt(ys);
            if (isNaN(yr)) { if (eraAll) total += cnt; continue; }
            if (eraAll || (yr >= era.min && yr <= era.max)) total += cnt;
          }
          if (total < 1) continue;
          const imgs = imgByLocKey?.[key] || [];
          const nameEntry = locationNamesRaw?.[key];
          const name = (typeof nameEntry === 'object' ? nameEntry?.name : nameEntry) || (imgs[0]?.title) || key;
          candidates.push({ lat, lng, key, total, imgs, name });
        }

        // Cluster
        const clusters = [];
        for (const c of candidates) {
          let nearest = null, nearestDist = Infinity;
          for (const cl of clusters) {
            const d = haversine(c.lat, c.lng, cl.lat, cl.lng);
            if (d < nearestDist) { nearestDist = d; nearest = cl; }
          }
          if (nearest && nearestDist <= CLUSTER_RADIUS) {
            nearest.entries.push(c); nearest.total += c.total; nearest.imgs.push(...c.imgs);
            nearest.lat = nearest.entries.reduce((s,e)=>s+e.lat,0)/nearest.entries.length;
            nearest.lng = nearest.entries.reduce((s,e)=>s+e.lng,0)/nearest.entries.length;
          } else {
            clusters.push({ lat: c.lat, lng: c.lng, entries: [c], total: c.total, imgs: [...c.imgs] });
          }
        }

        for (const cl of clusters) {
          const clusterImgs = findNearbyImages(imgGrid, cl.lat, cl.lng, 50);
          const nearbyImgs = filterByEra(clusterImgs, era);
          if (nearbyImgs.length === 0) continue;
          const thumb = bestThumb(nearbyImgs);
          if (!thumb) continue;
          const icon = cameraIcon(thumb, nearbyImgs.length);
          const marker = L.marker([cl.lat, cl.lng], { icon, zIndexOffset: -50 });
          const imgsForLightbox = nearbyImgs;
          marker.on('click', () => onOpenLightbox(imgsForLightbox));
          marker.addTo(map);
        }
      })();
    }

    // Use ResizeObserver to wait for the container to have real dimensions
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        if (!initialized) {
          initMap();
        } else if (map) {
          map.invalidateSize();
        }
      }
    });
    observer.observe(mapRef.current);

    return () => {
      observer.disconnect();
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, [dayIdx, collapsed]);

  const toggleCollapse = () => {
    setCollapsed(prev => !prev);
  };

  return (
    <div className={`map-panel${collapsed ? ' collapsed' : ''}`}>
      <div className="map-panel-header" onClick={toggleCollapse}>
        <h4>🗺 Route Map</h4>
        <span className="map-toggle-hint">{collapsed ? 'click to expand ▼' : 'click to collapse ▲'}</span>
      </div>
      <div ref={mapRef} className="route-map-container" />
      <div className="map-legend">
        <span><svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="#5e4a2e"/></svg> Route stop</span>
        <span><svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="#c9a84c"/></svg> Landmark</span>
        <span><svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="#c9a84c" opacity=".5"/></svg> Nearby landmark</span>
        <span>📷 Archival photo along route</span>
      </div>
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  // Data state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const dataRef = useRef({ locationsRaw: null, imagesRaw: null, locationNamesRaw: null, landmarksRaw: null, imgGrid: null, landmarkGrid: null, imgByLocKey: null });

  // Config state
  const [days, setDays] = useState('1');
  const [startIdx, setStartIdx] = useState(0);
  const [stopsPerDay, setStopsPerDay] = useState(8);
  const [radius, setRadius] = useState(5);
  const [eraIdx, setEraIdx] = useState(0);

  // App state
  const [view, setView] = useState(() => {
    // Detect #admin hash on initial load
    if (window.location.hash === '#admin') return 'admin';
    return 'config';
  }); // 'config' | 'route' | 'about' | 'admin'
  const [enriched, setEnriched] = useState([]);
  const [route, setRoute] = useState(null);
  const [activeDay, setActiveDay] = useState(0);
  const [modalImages, setModalImages] = useState(null);

  // Listen for hash changes (back/forward)
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === '#admin') setView('admin');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Track pageviews on view change
  useEffect(() => {
    if (view === 'admin') return; // don't track admin visits
    trackPageview(view === 'config' ? '/' : `/${view}`);
  }, [view]);

  // Load data
  useEffect(() => {
    (async () => {
      try {
        const [locs, imgs, names, landmarks] = await Promise.all([
          fetch(LOCATIONS_URL).then(r=>r.json()),
          fetch(IMAGES_URL).then(r=>r.json()),
          fetch(LOCATION_NAMES_URL).then(r=>r.json()),
          fetch(LANDMARKS_URL).then(r=>r.json()),
        ]);
        const imgGrid = buildImageGrid(imgs);
        const landmarkGrid = buildLandmarkGrid(landmarks);
        const imgByLocKey = {};
        for (const img of imgs) {
          if (img.location) {
            if (!imgByLocKey[img.location]) imgByLocKey[img.location] = [];
            imgByLocKey[img.location].push(img);
          }
        }
        dataRef.current = { locationsRaw: locs, imagesRaw: imgs, locationNamesRaw: names, landmarksRaw: landmarks, imgGrid, landmarkGrid, imgByLocKey };
        setLoading(false);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  // Rebuild enriched whenever config changes
  useEffect(() => {
    if (loading) return;
    const d = dataRef.current;
    const sp = START_POINTS[startIdx];
    const era = ERAS[eraIdx];
    const result = buildEnriched(d.locationsRaw, d.imagesRaw, d.locationNamesRaw, d.imgGrid, d.landmarkGrid, sp, era, eraIdx, radius);
    setEnriched(result);
  }, [loading, startIdx, eraIdx, radius, days, stopsPerDay]);

  const generateRoute = useCallback(() => {
    const daysRaw = parseFloat(days);
    const isHalf = daysRaw === 0.5;
    const numDays = isHalf ? 1 : Math.round(daysRaw);
    const sp = START_POINTS[startIdx];
    const result = optimizeRoute(enriched, sp, numDays, stopsPerDay, isHalf);
    if (result) {
      setRoute(result);
      setActiveDay(0);
      setView('route');
      trackEvent('generate_route', { start: sp.name, days: daysRaw, stops: stopsPerDay, era: ERA_LABELS[eraIdx], radius });
    }
  }, [enriched, days, startIdx, stopsPerDay, eraIdx, radius]);

  const showConfig = () => {
    setView('config');
    setRoute(null);
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
  };

  const openLightbox = useCallback((imgsOrLat, lngOrUndef, stopImagesOrUndef) => {
    // Can be called as openLightbox(images) or openLightbox(lat, lng, stopImages)
    if (Array.isArray(imgsOrLat)) {
      if (imgsOrLat.length > 0) setModalImages(imgsOrLat);
      return;
    }
    const lat = imgsOrLat, lng = lngOrUndef;
    const raw = (stopImagesOrUndef && stopImagesOrUndef.length > 0) ? stopImagesOrUndef : [];
    const era = ERAS[eraIdx];
    const imgs = filterByEra(raw.length > 0 ? raw : findNearbyImages(dataRef.current.imgGrid, lat, lng, 30), era);
    if (imgs.length > 0) setModalImages(imgs);
  }, [eraIdx]);

  // ── Admin page (doesn't need data) ──────────────────────────────────────
  if (view === 'admin') {
    return <AdminPage onBack={showConfig} />;
  }

  // ── Loading screen ──────────────────────────────────────────────────────
  if (loading || error) {
    return (
      <div id="loading-screen">
        {error ? (
          <div style={{ color:'var(--rust)', fontSize:15, textAlign:'center', padding:40 }}>Error: {error}<br/><small>Refresh the page.</small></div>
        ) : (
          <>
            <div className="compass" />
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:700, color:'var(--sepia-dark)', letterSpacing:2 }}>LOADING ARCHIVES</div>
            <div className="loading-dots" style={{ fontSize:13, color:'var(--faded)', marginTop:8 }}>Fetching historical records<span>.</span><span>.</span><span>.</span></div>
          </>
        )}
      </div>
    );
  }

  const era = ERAS[eraIdx];

  // ── Day stats for route ─────────────────────────────────────────────────
  const dayStats = route ? route.days.map(ds => {
    const all = [route.start, ...ds];
    let d = 0;
    for(let i=0;i<all.length-1;i++) d += haversine(all[i].lat, all[i].lng, all[i+1].lat, all[i+1].lng);
    return { stops: ds.length, dist: d, walk: walkMin(d) };
  }) : [];

  return (
    <>
      <header>
        <div className="inner">
          <div><h1>Old Toronto<em>Historical Itinerary Planner</em></h1></div>
          <div className="header-right">
            <span>{enriched.length} locations in range</span>
            {view === 'route' && (
              <button className="btn btn-ghost" onClick={showConfig}>← Reconfigure</button>
            )}
            {view === 'about' && (
              <button className="btn btn-ghost" onClick={showConfig}>← Back to Planner</button>
            )}
            {view !== 'about' && (
              <button className="btn btn-ghost" onClick={() => setView('about')}>About</button>
            )}
          </div>
        </div>
      </header>

      {/* ── Config View ────────────────────────────────────────────────────── */}
      {view === 'config' && (
        <div id="config-view">
          <div className="config-panel">
            <div className="config-box">
              <h2>Plan Your Walk Through History</h2>
              <p className="subtitle">Configure your visit to Toronto's most photographed historical locations. Sites are ranked by archival photo density and the route is optimized for walking.</p>
              <div className="controls-grid">
                <div className="control-group">
                  <label>Duration</label>
                  <select value={days} onChange={e => setDays(e.target.value)}>
                    <option value="0.5">Half Day</option>
                    <option value="1">1 Day</option>
                    <option value="2">2 Days</option>
                    <option value="3">3 Days</option>
                    <option value="4">4 Days</option>
                    <option value="5">5 Days</option>
                  </select>
                </div>
                <div className="control-group">
                  <label>Starting Point</label>
                  <select value={startIdx} onChange={e => setStartIdx(+e.target.value)}>
                    {START_POINTS.map((sp, i) => <option key={i} value={i}>{sp.name}</option>)}
                  </select>
                </div>
                <div className="control-group">
                  <label>Stops per Day: <strong>{stopsPerDay}</strong></label>
                  <input type="range" min="3" max="15" value={stopsPerDay} onChange={e => setStopsPerDay(+e.target.value)} />
                  <div className="range-labels"><span>Relaxed (3)</span><span>Packed (15)</span></div>
                </div>
                <div className="control-group">
                  <label>Search Radius: <strong>{radius}</strong> km</label>
                  <input type="range" min="1" max="20" value={radius} onChange={e => setRadius(+e.target.value)} />
                  <div className="range-labels"><span>Nearby</span><span>City-wide</span></div>
                </div>
                <div className="control-group">
                  <label>Historical Era</label>
                  <select value={eraIdx} onChange={e => setEraIdx(+e.target.value)}>
                    {ERA_LABELS.map((label, i) => <option key={i} value={i}>{label}</option>)}
                  </select>
                </div>
              </div>
              <button className="btn btn-primary" onClick={generateRoute}>Generate Itinerary</button>
            </div>
          </div>
          <div className="preview-section">
            {enriched.length > 0 && <h3>Top Documented Locations in Range</h3>}
            <div className="preview-grid">
              {enriched.length === 0 ? (
                <div style={{ color:'var(--faded)', padding:20 }}>No locations found. Try increasing radius or changing era.</div>
              ) : enriched.slice(0, 12).map((loc, i) => {
                const thumb = loc.images.length > 0 ? bestThumb(loc.images) : null;
                const lm = loc.landmark;
                const displayName = lm ? lm.name : loc.name;
                return (
                  <div key={loc.key} className="preview-card" style={{ animationDelay: `${i * 0.05}s`, cursor: 'pointer' }}
                    onClick={() => openLightbox(loc.lat, loc.lng, loc.images)}>
                    {thumb && <img src={thumb} alt="" onError={(e) => tplFallback(e.target)} />}
                    <div style={{ minWidth: 0 }}>
                      <div className="name">{displayName}</div>
                      <div className="meta">
                        {lm && <span style={{ display:'inline-flex', alignItems:'center', gap:3, background:'linear-gradient(135deg,var(--gold),var(--sepia-light))', color:'var(--parchment)', fontSize:8, fontWeight:700, letterSpacing:'1.2px', textTransform:'uppercase', padding:'1px 5px', borderRadius:2, marginRight:4 }}>★ Landmark</span>}
                        {loc.images.length} photos{loc.earliestYear ? ` · Since ${loc.earliestYear}` : ''}
                      </div>
                      <div className="dist">{loc.distFromStart.toFixed(1)} km from start</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Route View ─────────────────────────────────────────────────────── */}
      {view === 'route' && route && (
        <div className="route-wrap">
          {/* Summary */}
          <div className="route-summary">
            <div><div className="stat-label">Starting from</div><div className="stat-value">{route.start.name}</div></div>
            <div className="divider" />
            <div><div className="stat-label">Historical Era</div><div className="stat-value">{ERA_LABELS[eraIdx]}</div></div>
            {dayStats.map((s, di) => (
              <span key={di} style={{ display:'contents' }}>
                <div className="divider" />
                <div><div className="stat-label">{route.isHalfDay ? 'Half Day' : `Day ${di+1}`}</div><div className="stat-value">{s.stops} stops · {s.dist.toFixed(1)} km · ~{s.walk} min</div></div>
              </span>
            ))}
          </div>

          {/* Map */}
          <RouteMap route={route} dayIdx={activeDay} era={era}
            locationsRaw={dataRef.current.locationsRaw} imagesRaw={dataRef.current.imagesRaw}
            locationNamesRaw={dataRef.current.locationNamesRaw} landmarksRaw={dataRef.current.landmarksRaw}
            imgByLocKey={dataRef.current.imgByLocKey} imgGrid={dataRef.current.imgGrid}
            onOpenLightbox={(imgs) => { if (imgs.length > 0) setModalImages(imgs); }} />

          {/* Day tabs */}
          {route.days.length > 1 && (
            <div className="day-tabs">
              {route.days.map((_, di) => (
                <button key={di} className={`day-tab${di === activeDay ? ' active' : ''}`} onClick={() => setActiveDay(di)}>
                  Day {di+1}
                  <span className="tab-stats">{dayStats[di]?.stops} stops · {dayStats[di]?.dist.toFixed(1)} km</span>
                </button>
              ))}
            </div>
          )}

          {/* Day content */}
          {route.days.map((dayStops, dayIdx) => (
            <div key={dayIdx} className={`day-content${dayIdx === activeDay ? ' active' : ''}`}>
              <div className="day-section">
                <div className="day-header">
                  <div className="day-badge">{dayIdx+1}</div>
                  <h3>{route.isHalfDay ? 'Half Day' : `Day ${dayIdx+1}`}</h3>
                </div>
                <div className="timeline">
                  {dayStops.map((stop, si) => (
                    <StopCard key={`${dayIdx}-${si}`} stop={stop} index={si}
                      startOrPrev={si === 0 ? route.start : dayStops[si-1]}
                      onOpenLightbox={openLightbox} enrichedCache={enriched} />
                  ))}
                </div>
              </div>
            </div>
          ))}

          {/* Export */}
          <div className="export-bar">
            <div className="hint">Export your walking route</div>
            {route.days.length > 1 ? route.days.map((ds, di) => {
              const o = `${route.start.lat},${route.start.lng}`;
              const d = `${ds[ds.length-1].lat},${ds[ds.length-1].lng}`;
              const w = ds.slice(0,-1).map(s=>`${s.lat},${s.lng}`).join('|');
              return <a key={di} className="btn-export" href={`https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&waypoints=${w}&travelmode=walking`} target="_blank" rel="noreferrer" style={{ fontSize:12, padding:'10px 20px' }}>Day {di+1} Map</a>;
            }) : (() => {
              const all = route.days.flat();
              const o = `${route.start.lat},${route.start.lng}`;
              const d = `${all[all.length-1].lat},${all[all.length-1].lng}`;
              const w = all.slice(0,-1).map(s=>`${s.lat},${s.lng}`).join('|');
              return <a className="btn-export" href={`https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&waypoints=${w}&travelmode=walking`} target="_blank" rel="noreferrer">Open in Google Maps</a>;
            })()}
          </div>
        </div>
      )}

      {/* ── About View ─────────────────────────────────────────────────────── */}
      {view === 'about' && (
        <main className="about-page-wrap">
          <div className="about-hero">
            <div className="about-hero-eyebrow">About This Project</div>
            <h2>Walking Through History,<br/><em>Guided by the Archive</em></h2>
            <p className="about-hero-lead">A tool for explorers, travellers, and anyone curious about the city that once was — connecting Toronto's living streets to thousands of photographs from the City of Toronto Archives.</p>
          </div>

          <div className="about-ornament">✦</div>

          <section className="about-section">
            <h3>The Inspiration</h3>
            <p>
              This project began with <a href="https://www.oldto.org" target="_blank" rel="noreferrer">OldTO</a> — a remarkable labour of love that placed thousands of digitized historical photographs from the City of Toronto Archives onto an interactive map. Originally built by Sidewalk Labs and later revived by Back Lane Studios, OldTO is an extraordinary resource: a window into more than a century and a half of Toronto's urban life, accessible to anyone with a browser.
            </p>
            <p>
              As a librarian specializing in the visualization of archival collections, I was immediately drawn to it. But I also noticed a tension. The OldTO map excels at answering the question <em>what was photographed here?</em> — but it is harder to use when you are asking <em>where should I walk to see the most of this history?</em> The density of photo clusters in the historic core can be overwhelming, and the map offers no guidance on how to sequence a visit or which locations to prioritize. For a visitor standing at a hotel door, unsure where to begin, it is beautiful but difficult to act on.
            </p>
            <blockquote>
              <p>People do not learn cities by studying maps. They learn cities by walking them — and they remember what they walked past.</p>
            </blockquote>
            <p>
              That observation is the starting point for this tool. Cities are experienced on foot, at the scale of a block, a corner, a building facade. Archival images become most meaningful when they are encountered in the same place where the original photograph was taken — or previewed before a walk so that a visitor knows what to look for when they arrive. History, encountered in motion, sticks.
            </p>
          </section>

          <section className="about-section">
            <h3>How the Tool Works</h3>
            <p>
              The Planner is built around the way people actually move through cities. Visitors typically orient themselves from a fixed point — a hotel, a transit hub, a familiar landmark — and radiate outward from there. The tool reflects this: the first choice you make is your starting location, selected from fifteen well-known points across the city, from Union Station and the Distillery District to Casa Loma and High Park.
            </p>
            <p>
              From that starting point, the Planner generates an optimized walking itinerary through the locations in the OldTO dataset that are richest in archival photographs. Stops are organized around <strong>landmarks</strong> — the places people already seek out and remember — because landmarks are the natural anchors of any urban walk. Routes connect these anchors in a logical sequence, minimized for walking distance using a nearest-neighbour algorithm refined with 2-opt optimization.
            </p>

            <div className="about-data-band">
              <div className="about-data-item"><span className="num">15</span><span className="label">Starting Points</span></div>
              <div className="about-data-item"><span className="num">6</span><span className="label">Historical Eras</span></div>
              <div className="about-data-item"><span className="num">5</span><span className="label">Trip Lengths</span></div>
              <div className="about-data-item"><span className="num">1865</span><span className="label">Earliest Photo</span></div>
            </div>

            <p>
              Along each route, archival photographs are surfaced in two ways: as a thumbnail strip beneath each stop, and as photo markers directly on the route map. This means you can browse images <em>before</em> you leave — previewing what a block looked like a hundred years ago — or consult them while you walk. The archive stops being a database you search from a desk, and becomes a companion for a real walk through a real city.
            </p>
            <p>
              Photographs can also be filtered by historical era, from the Victorian period through the late twentieth century, allowing a visitor to tailor their walk to a particular moment in the city's development: the industrial waterfront of the 1890s, the post-war expansion of the 1950s, or the urban transformation of the 1970s.
            </p>
          </section>

          <section className="about-section">
            <h3>Key Features</h3>
            <div className="about-feature-grid">
              {[
                { icon: '📍', title: 'Start from Where You Are', desc: "Choose from fifteen well-known starting points — hotels, transit hubs, and landmark squares — so your route begins where you actually are, not an arbitrary centre." },
                { icon: '🏛', title: 'Landmark-Anchored Routes', desc: "Routes thread through the city's most-documented landmarks, the sites people seek out and remember. Gold-highlighted stops tell you where history is densest." },
                { icon: '📷', title: 'Preview Before You Walk', desc: 'Browse archival images for every stop before you set out. See the street as it looked in 1910, then walk the same block and see what has changed and what remains.' },
                { icon: '🗺', title: 'Photos Along the Route', desc: 'Archival photographs appear directly on the map as you walk, so the archive travels with you. Every corner has a story; the map makes it visible.' },
                { icon: '🕰', title: 'Filter by Historical Era', desc: "Narrow the archive to a specific period — Victorian, Edwardian, interwar, postwar — and build an itinerary that traces one chapter of the city's history." },
                { icon: '🗓', title: 'Flexible Trip Lengths', desc: 'Plan a half-day wander or a five-day deep dive. The itinerary scales intelligently, distributing stops across days to keep each walk comfortable and memorable.' },
              ].map((f, i) => (
                <div key={i} className="about-feature-card">
                  <span className="about-feature-icon">{f.icon}</span>
                  <h4>{f.title}</h4>
                  <p>{f.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="about-section">
            <h3>Archival Collections and the City</h3>
            <p>
              Archives are among the richest resources a city holds. The City of Toronto Archives contains hundreds of thousands of photographs documenting streets, buildings, neighbourhoods, and people across more than fifteen decades. Yet most of this material remains invisible to the people it depicts — citizens, residents, and visitors who move through the same places every day without knowing what they once looked like or what happened there.
            </p>
            <p>
              One of the persistent challenges in the visualization of archival collections is the gap between the logic of the archive — organized by provenance, date, and description — and the logic of lived urban experience, organized by place and movement. This tool attempts to bridge that gap by meeting users where they are: on a street corner, about to walk somewhere, wanting to know what this place used to be.
            </p>
            <p>
              The photographs are sourced from OldTO's geocoded dataset, which in turn draws from the digitized holdings of the City of Toronto Archives and the Toronto Public Library. Each image carries archival metadata — dates, physical descriptions, citation information — accessible through the full-screen viewer. The goal is not to replace the archive but to bring it into the street, where its meaning is most vivid.
            </p>
          </section>

          <div className="about-ornament">✦</div>

          <div className="about-attribution-box">
            <h3>Sources &amp; Acknowledgements</h3>
            <p>
              <strong>Photographic data</strong> is sourced from <a href="https://www.oldto.org" target="_blank" rel="noreferrer">OldTO</a>, an interactive historical photo map originally created by Sidewalk Labs (Dan Vanderkam) and revived by Back Lane Studios and Michael Lenaghan. OldTO draws on the digitized holdings of the <strong>City of Toronto Archives</strong> and the <strong>Toronto Public Library</strong>.
            </p>
            <p>
              <strong>Landmark data</strong> is derived from Wikidata's open knowledge graph. <strong>Route optimization</strong> uses a nearest-neighbour heuristic refined with 2-opt improvement. Maps are rendered with <strong>Leaflet</strong> and OpenStreetMap contributors.
            </p>
            <p>
              The OldTO source code was generously made open-source by Sidewalk Labs under a permissive licence. This project builds on that foundation with gratitude.
            </p>
          </div>
        </main>
      )}

      <footer>Data sourced from <a href="https://www.oldto.org" target="_blank" rel="noreferrer">OldTO</a> · City of Toronto Archives · Route optimization via nearest-neighbour + 2-opt heuristic</footer>

      {/* Photo Modal */}
      {modalImages && <PhotoModal images={modalImages} onClose={() => setModalImages(null)} />}
    </>
  );
}
