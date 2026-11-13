/**
 * Pure geometry + terrain helpers. No DOM, no three.js: this module also runs
 * inside Node so the QA agents can build and validate the same world.
 */
import { META, ELEV_GRID } from './town-data.js';

export const DEG = Math.PI / 180;
export const M_PER_DEG_LAT = 110574;
export const M_PER_DEG_LON = 111320 * Math.cos(META.centre.lat * DEG);

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smoothstep(xf), v = smoothstep(yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm(x, y, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** WGS84 → local metres. x = east, z = south (three.js friendly). */
export function project(lat, lon) {
  return {
    x: (lon - META.centre.lon) * M_PER_DEG_LON,
    z: (META.centre.lat - lat) * M_PER_DEG_LAT
  };
}

export function unproject(x, z) {
  return {
    lat: META.centre.lat - z / M_PER_DEG_LAT,
    lon: META.centre.lon + x / M_PER_DEG_LON
  };
}

/** Bilinear sample of the real EU-DEM 10 × 10 grid. */
export function sampleElevation(lat, lon) {
  const { south, north, west, east } = META.bbox;
  const rows = ELEV_GRID.length, cols = ELEV_GRID[0].length;
  const fy = clamp((lat - south) / (north - south), 0, 1) * (rows - 1);
  const fx = clamp((lon - west) / (east - west), 0, 1) * (cols - 1);
  const y0 = Math.floor(fy), x0 = Math.floor(fx);
  const y1 = Math.min(y0 + 1, rows - 1), x1 = Math.min(x0 + 1, cols - 1);
  const ty = smoothstep(fy - y0), tx = smoothstep(fx - x0);
  const top = lerp(ELEV_GRID[y0][x0], ELEV_GRID[y0][x1], tx);
  const bot = lerp(ELEV_GRID[y1][x0], ELEV_GRID[y1][x1], tx);
  return lerp(top, bot, ty);
}

/** How strongly we are inside the built-up valley (0 = countryside, 1 = town). */
export function urbanFactor(x, z) {
  const c = project(49.4787, 6.0846);
  const d = Math.hypot(x - c.x, z - c.z);
  return 1 - smoothstep(clamp((d - 650) / 900, 0, 1));
}

/**
 * Terrain height in metres. Real DEM trend + fractal micro-relief, damped in
 * the built-up valley so streets and lots stay walkable.
 */
export function terrainHeight(x, z) {
  const ll = unproject(x, z);
  const base = sampleElevation(ll.lat, ll.lon);
  const u = urbanFactor(x, z);
  // A town is not a field: streets, kerbs, doorsteps and shopfronts are all
  // within centimetres of each other. The valley therefore keeps only a trace
  // of fractal relief, while the hills around it stay untouched. Before this,
  // ±3 m of noise sat inside the built-up area and every house, road edge and
  // crossing floated or sank by a metre or more.
  const n = (fbm(x * 0.0042, z * 0.0042, 4) - 0.5) * 2;
  const micro = (valueNoise(x * 0.05, z * 0.05) - 0.5) * 0.8;
  const detailAmp = lerp(9, 0.30, u);
  const hills = lerp(1, 0.04, u);
  const slopeBias = (fbm(x * 0.0016 + 11.3, z * 0.0016 - 4.1, 3) - 0.5) * 10 * hills;
  const microAmp = lerp(1.4, 0.10, u);
  return base + n * detailAmp + micro * microAmp + slopeBias;
}

export function terrainNormal(x, z, eps = 2) {
  const hL = terrainHeight(x - eps, z), hR = terrainHeight(x + eps, z);
  const hD = terrainHeight(x, z - eps), hU = terrainHeight(x, z + eps);
  const nx = hL - hR, nz = hD - hU, ny = 2 * eps;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}

export function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }
  return total;
}

export function resamplePolyline(points, step) {
  if (points.length < 2) return points.slice();
  const out = [{ ...points[0] }];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    const segLen = Math.hypot(dx, dz);
    if (segLen < 1e-6) continue;
    let d = step - carry;
    while (d <= segLen) {
      out.push({ x: a.x + (dx * d) / segLen, z: a.z + (dz * d) / segLen });
      d += step;
    }
    carry = (segLen - (d - step)) % step;
  }
  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.z - tail.z) > step * 0.25) out.push({ ...last });
  else out[out.length - 1] = { ...last };
  return out;
}

export function polylineAt(points, dist) {
  let d = Math.max(0, dist);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= seg || i === points.length - 1) {
      const t = seg < 1e-9 ? 0 : clamp(d / seg, 0, 1);
      return {
        x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t),
        angle: Math.atan2(b.x - a.x, b.z - a.z),
        index: i - 1
      };
    }
    d -= seg;
  }
  const p = points[points.length - 1];
  return { x: p.x, z: p.z, angle: 0, index: points.length - 2 };
}

/** Closest point on a polyline to (x,z). */
/**
 * Metres along the polyline to the point closest to (x, z).
 *
 * `closestOnPolyline().dist` is the *perpendicular* distance to the line, which
 * is what a train station is next to, not where it is along the track. Using it
 * as a chainage stacked every station at ~0 and broke the timetable.
 */
export function chainageAlong(points, x, z) {
  let acc = 0, best = { d: Infinity, along: 0 };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t = len2 < 1e-9 ? 0 : clamp(((x - a.x) * dx + (z - a.z) * dz) / len2, 0, 1);
    const px = a.x + dx * t, pz = a.z + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, along: acc + Math.sqrt(len2) * t };
    acc += Math.sqrt(len2);
  }
  return best.along;
}

export function closestOnPolyline(points, x, z) {
  let best = { dist: Infinity, x: 0, z: 0, angle: 0, index: 0 };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-9) continue;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
    t = clamp(t, 0, 1);
    const px = a.x + dx * t, pz = a.z + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.dist) {
      best = { dist: d, x: px, z: pz, angle: Math.atan2(dx, dz), index: i - 1 };
    }
  }
  return best;
}

export function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Oriented box: centre, half extents, yaw. */
export function obbContains(obb, x, z, radius = 0) {
  const dx = x - obb.x, dz = z - obb.z;
  const cos = Math.cos(obb.rot), sin = Math.sin(obb.rot);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return Math.abs(lx) <= obb.hw + radius && Math.abs(lz) <= obb.hd + radius;
}

export function obbCorners(obb) {
  const c = Math.cos(obb.rot), s = Math.sin(obb.rot);
  const pts = [
    [-obb.hw, -obb.hd], [obb.hw, -obb.hd], [obb.hw, obb.hd], [-obb.hw, obb.hd]
  ];
  return pts.map(([lx, lz]) => ({ x: obb.x + lx * c + lz * s, z: obb.z - lx * s + lz * c }));
}

/** True if a circle overlaps an oriented box (used for player collision). */
export function circleHitsBox(px, pz, radius, obb) {
  const dx = px - obb.x, dz = pz - obb.z;
  const cos = Math.cos(obb.rot), sin = Math.sin(obb.rot);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const cx = clamp(lx, -obb.hw, obb.hw);
  const cz = clamp(lz, -obb.hd, obb.hd);
  return (lx - cx) ** 2 + (lz - cz) ** 2 <= radius * radius;
}

export function segmentsIntersect(a, b, c, d) {
  const d1 = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const d2 = (b.x - a.x) * (d.z - a.z) - (b.z - a.z) * (d.x - a.x);
  const d3 = (d.x - c.x) * (a.z - c.z) - (d.z - c.z) * (a.x - c.x);
  const d4 = (d.x - c.x) * (b.z - c.z) - (d.z - c.z) * (b.x - c.x);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export function randRange(rng, a, b) { return a + rng() * (b - a); }
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }
