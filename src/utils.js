// ── Constants ───────────────────────────────────────────────────────────────
export const LOCATIONS_URL = 'locations_ex.json';
export const IMAGES_URL = 'images_ex.json';
export const LOCATION_NAMES_URL = 'location_names.json';
export const LANDMARKS_URL = 'wikidata_toronto_landmarks.json';

export const START_POINTS = [
  { name: 'Union Station', lat: 43.6453, lng: -79.3806 },
  { name: 'CN Tower', lat: 43.6426, lng: -79.3871 },
  { name: 'City Hall', lat: 43.6535, lng: -79.3840 },
  { name: 'Dundas Square', lat: 43.6561, lng: -79.3803 },
  { name: 'St. Lawrence Market', lat: 43.6487, lng: -79.3716 },
  { name: 'Royal Ontario Museum', lat: 43.6677, lng: -79.3948 },
  { name: 'Harbourfront Centre', lat: 43.6388, lng: -79.3822 },
  { name: 'Kensington Market', lat: 43.6547, lng: -79.4006 },
  { name: 'Distillery District', lat: 43.6503, lng: -79.3596 },
  { name: 'High Park', lat: 43.6412, lng: -79.4632 },
  { name: 'Casa Loma', lat: 43.6780, lng: -79.4094 },
  { name: 'Exhibition Place', lat: 43.6332, lng: -79.4197 },
  { name: 'Bloor-Yonge Station', lat: 43.6709, lng: -79.3857 },
  { name: 'Queen & Spadina', lat: 43.6490, lng: -79.3965 },
  { name: 'Fort York', lat: 43.6387, lng: -79.4056 },
];

export const ERAS = [
  { min: 0, max: 9999 }, { min: 1850, max: 1900 }, { min: 1901, max: 1918 },
  { min: 1919, max: 1938 }, { min: 1939, max: 1969 }, { min: 1970, max: 2000 },
];

export const ERA_LABELS = [
  'All Eras', 'Victorian (1850–1900)', 'Edwardian (1901–1918)',
  'Interwar (1919–1938)', 'Mid-Century (1939–1969)', 'Modern (1970–2000)',
];

// ── Geo math ────────────────────────────────────────────────────────────────
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function walkMin(km) { return Math.round((km/5)*60); }

function totalDist(route, locs) {
  let d=0;
  for(let i=0;i<route.length-1;i++) d+=haversine(locs[route[i]].lat,locs[route[i]].lng,locs[route[i+1]].lat,locs[route[i+1]].lng);
  return d;
}

// ── Route optimization ──────────────────────────────────────────────────────
function nearestNeighbor(locs, start) {
  const n=locs.length, visited=new Set([start]), route=[start]; let cur=start;
  while(route.length<n) {
    let best=Infinity,bestIdx=-1;
    for(let i=0;i<n;i++){if(visited.has(i))continue;const d=haversine(locs[cur].lat,locs[cur].lng,locs[i].lat,locs[i].lng);if(d<best){best=d;bestIdx=i;}}
    if(bestIdx===-1)break; visited.add(bestIdx); route.push(bestIdx); cur=bestIdx;
  }
  return route;
}

function twoOpt(route, locs, iters) {
  let best=[...route], bestD=totalDist(best,locs);
  for(let it=0;it<iters;it++){let imp=false;for(let i=1;i<best.length-1;i++){for(let j=i+1;j<best.length;j++){const nr=[...best.slice(0,i),...best.slice(i,j+1).reverse(),...best.slice(j+1)];const d=totalDist(nr,locs);if(d<bestD){best=nr;bestD=d;imp=true;}}}if(!imp)break;}
  return best;
}

export function optimizeRoute(candidates, startPoint, numDays, stopsPerDay, isHalf) {
  const stopsTotal = isHalf ? Math.ceil(stopsPerDay/2) : numDays*stopsPerDay;
  const selected = candidates.slice(0, Math.min(stopsTotal*3, candidates.length));
  if (!selected.length) return null;
  const withStart = [{lat:startPoint.lat,lng:startPoint.lng,name:startPoint.name,isStart:true,score:0,images:[],totalPhotos:0}, ...selected.slice(0, stopsTotal)];
  const optimized = twoOpt(nearestNeighbor(withStart,0), withStart, 200);
  const ordered = optimized.map(i=>withStart[i]);
  const perDay = isHalf ? stopsTotal : Math.ceil((ordered.length-1)/numDays);
  const dayPlans = []; let idx=1;
  for(let d=0; d<numDays; d++){
    const ds=[];
    for(let s=0;s<perDay&&idx<ordered.length;s++,idx++) ds.push(ordered[idx]);
    if(ds.length) dayPlans.push(ds);
  }
  return { start: ordered[0], days: dayPlans, allStops: ordered, isHalfDay: isHalf };
}

// ── Image helpers ───────────────────────────────────────────────────────────
export function isGcsUrl(url) { return url && url.includes('storage.googleapis.com'); }
export function isTplUrl(url) { return url && (url.includes('torontopubliclibrary') || url.includes('digitalarchive.tpl.ca')); }
export function fixTplUrl(url) {
  if (!url) return url;
  return url.replace(/\/media\/dispatcher\/(\d+)\/(preview|thumbnail)/, '/media/dispatcher/$1/full');
}

export function tplFallback(el) {
  const src = el.src || '';
  if (src.includes('/media/dispatcher/') && src.includes('/full')) {
    el.onerror = () => { el.style.display = 'none'; };
    el.src = src.replace('/full', '/preview');
  } else {
    el.style.display = 'none';
  }
}

export function bestThumb(imgs) {
  const gcs = imgs.find(img => isGcsUrl(img.image?.thumb_url));
  if (gcs) return gcs.image.thumb_url;
  const tpl = imgs.find(img => isTplUrl(img.image?.thumb_url) || isTplUrl(img.image?.url));
  if (tpl) return fixTplUrl(tpl.image?.thumb_url || tpl.image?.url);
  return imgs[0]?.image?.thumb_url || null;
}

export function parseImageYear(img) {
  const d = img?.date || img?.archives_fields?.date || '';
  const m = String(d).match(/(\d{4})/);
  return m ? parseInt(m[1]) : null;
}

export function filterByEra(imgs, era) {
  if (era.min === 0 && era.max === 9999) return imgs;
  return imgs.filter(img => {
    const yr = parseImageYear(img);
    return yr !== null && yr >= era.min && yr <= era.max;
  });
}

// ── Spatial grids ───────────────────────────────────────────────────────────
export function buildImageGrid(imagesRaw) {
  const grid = {};
  for (const img of imagesRaw) {
    if (!img.geocode) continue;
    const k = Math.round(img.geocode.lat*1000)+','+Math.round(img.geocode.lng*1000);
    if (!grid[k]) grid[k] = [];
    grid[k].push(img);
  }
  return grid;
}

export function buildLandmarkGrid(landmarksRaw) {
  const grid = {};
  for (const lm of landmarksRaw) {
    if (!lm.lat || !lm.lng) continue;
    const k = Math.round(lm.lat*200)+','+Math.round(lm.lng*200);
    if (!grid[k]) grid[k] = [];
    grid[k].push(lm);
  }
  return grid;
}

export function findNearestLandmark(landmarkGrid, lat, lng, maxDist=0.3) {
  if (!landmarkGrid) return null;
  const gLat=Math.round(lat*200), gLng=Math.round(lng*200);
  let best=null, bestDist=maxDist;
  for (let dLat=-1; dLat<=1; dLat++) for (let dLng=-1; dLng<=1; dLng++) {
    const cell = landmarkGrid[`${gLat+dLat},${gLng+dLng}`];
    if (!cell) continue;
    for (const lm of cell) {
      const d = haversine(lat, lng, lm.lat, lm.lng);
      if (d < bestDist) { best=lm; bestDist=d; }
    }
  }
  return best;
}

export function findNearbyImages(imgGrid, lat, lng, max=30) {
  if (!imgGrid) return [];
  const gLat=Math.round(lat*1000), gLng=Math.round(lng*1000), results=[], seen=new Set();
  for (let dLat=-3; dLat<=3; dLat++) for (let dLng=-3; dLng<=3; dLng++) {
    const cell = imgGrid[`${gLat+dLat},${gLng+dLng}`];
    if (!cell) continue;
    for (const img of cell) {
      const key = img.image?.thumb_url || img.title;
      if (seen.has(key)) continue;
      const d = haversine(lat, lng, img.geocode.lat, img.geocode.lng);
      if (d < 0.3) { results.push({img, dist:d}); seen.add(key); }
    }
  }
  results.sort((a,b) => a.dist - b.dist);
  return results.slice(0, max).map(r => r.img);
}

export function derivePlaceName(images, coordKey) {
  if (!images || images.length === 0) return 'Location ' + coordKey;
  const names = [];
  for (const img of images) {
    const t = img.geocode?.original_title || img.title;
    if (t) names.push(t);
  }
  if (names.length === 0) return 'Location ' + coordKey;
  const cleaned = names.map(n => n.replace(/,?\s*looking\s+(north|south|east|west).*$/i,'').replace(/,?\s+from\s+.*$/i,'').trim()).filter(n => n.length > 0 && n.length < 80);
  if (cleaned.length === 0) return names[0].substring(0,60);
  const preferred = cleaned.filter(n => !/^\d/.test(n));
  const pool = preferred.length > 0 ? preferred : cleaned;
  const freq = {};
  for (const n of pool) { const k=n.toLowerCase(); freq[k]=(freq[k]||0)+1; }
  const best = Object.entries(freq).sort((a,b)=>b[1]-a[1])[0][0];
  return pool.find(n => n.toLowerCase() === best) || pool[0];
}

// ── Route enrichment ────────────────────────────────────────────────────────
export function buildEnriched(locationsRaw, imagesRaw, locationNamesRaw, imgGrid, landmarkGrid, startPoint, era, eraIdx, radius) {
  const results = [];
  for (const [coordKey, yearCounts] of Object.entries(locationsRaw)) {
    const [latS,lngS] = coordKey.split(',');
    const lat = parseFloat(latS), lng = parseFloat(lngS);
    if(isNaN(lat)||isNaN(lng)||lat<43.5||lat>43.85||lng<-79.7||lng>-79.1) continue;
    const dist = haversine(startPoint.lat, startPoint.lng, lat, lng);
    if(dist > radius) continue;
    let total=0, eraPhotos=0, earliest=9999, latest=0;
    for(const [ys,cnt] of Object.entries(yearCounts)){
      const yr=parseInt(ys);
      if(isNaN(yr)){total+=cnt;continue;}
      total+=cnt;
      if(yr>=era.min&&yr<=era.max) eraPhotos+=cnt;
      if(yr<earliest) earliest=yr;
      if(yr>latest) latest=yr;
    }
    const score = eraIdx===0 ? total : eraPhotos;
    if(score<3) continue;
    const imgs = filterByEra(findNearbyImages(imgGrid, lat, lng, 30), era);
    const namedEntry = locationNamesRaw ? locationNamesRaw[coordKey] : null;
    const name = namedEntry ? (typeof namedEntry === 'object' ? namedEntry.name : namedEntry) : derivePlaceName(imgs, coordKey);
    const landmark = findNearestLandmark(landmarkGrid, lat, lng, 0.25);
    results.push({key:coordKey, lat, lng, name, totalPhotos:total, score, earliestYear:earliest===9999?null:earliest, latestYear:latest===0?null:latest, distFromStart:dist, images:imgs, landmark});
  }
  results.sort((a,b) => b.score - a.score);
  return results;
}

// ── OSRM routing ────────────────────────────────────────────────────────────
export async function fetchStreetRoute(waypoints) {
  try {
    const coords = waypoints.map(p => `${p.lng},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/foot/${coords}?overview=full&geometries=geojson&steps=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) return null;
    return data.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
  } catch {
    return null;
  }
}

export function distToRoute(lat, lng, allPoints, earlyExit = 0.05) {
  let minDist = Infinity;
  for (let i = 0; i < allPoints.length - 1; i++) {
    const ax = allPoints[i].lat, ay = allPoints[i].lng;
    const bx = allPoints[i+1].lat, by = allPoints[i+1].lng;
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx*dx + dy*dy;
    let t = lenSq > 0 ? ((lat-ax)*dx + (lng-ay)*dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const d = haversine(lat, lng, ax + t*dx, ay + t*dy);
    if (d < minDist) { minDist = d; if (minDist < earlyExit) return minDist; }
  }
  return minDist;
}

export function archiveUrl(img) {
  const url = img?.image?.url || img?.image?.thumb_url || '#';
  return fixTplUrl(url);
}
