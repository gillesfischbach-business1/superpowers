/**
 * The urban fabric of Dudelange.
 *
 * The first version of this town invented its side streets on a fixed
 * orthogonal grid — two bearings, 128 m apart, repeated across three districts.
 * Any town looks like that, and Dudelange does not: the real streets are short,
 * irregular, and follow the valley floor and the slope contours.
 *
 * This module derives the fabric from the traced OpenStreetMap streets instead:
 *
 *   - the real streets are the skeleton and are never moved;
 *   - side streets are *offsets* of a real street: a lane parallel to it at a
 *     plot depth, drifting in and out the way real frontages do, cut wherever
 *     the town stops, the rail runs, or a protected zone starts;
 *   - short cross lanes tie each offset back to its parent, which is how the
 *     comb of a valley town is actually put together;
 *   - `urbanWeight()` is the shared notion of "how much town is here", used both
 *     to cut the fabric and to decide where houses may stand.
 */
import { resamplePolyline, polylineLength, clamp } from './geo.js';

/** Real roads that carry the skeleton; only these get side streets. */
const SKELETON_CLASSES = new Set(['primary', 'secondary', 'residential']);

/** How built-up each quarter is, relative to its centre. */
export const QUARTER_WEIGHT = {
  centre: 1.0,
  italien: 0.95,
  burange: 0.62,
  neischmelz: 0.55,
  usines: 0.30,
  budersberg: 0.22,
  outskirts: 0.10
};

/** Spatial index over road samples, with the local street bearing. */
export function createRoadIndex(roads) {
  const cell = 64;
  const buckets = new Map();
  const key = (i, j) => `${i}:${j}`;
  const samples = [];

  for (const road of roads) {
    if (!SKELETON_CLASSES.has(road.cls)) continue;
    const pts = road.samples && road.samples.length > 1 ? road.samples : road.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.5) continue;
      const s = {
        x: (a.x + b.x) / 2, z: (a.z + b.z) / 2,
        bearing: Math.atan2(b.x - a.x, b.z - a.z),
        len, width: road.width, cls: road.cls, roadId: road.id
      };
      samples.push(s);
      const i0 = Math.floor(s.x / cell), j0 = Math.floor(s.z / cell);
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          const k = key(i0 + di, j0 + dj);
          if (!buckets.has(k)) buckets.set(k, []);
          buckets.get(k).push(s);
        }
      }
    }
  }

  const nearest = (x, z, maxRadius = 400) => {
    let best = null;
    const rings = Math.ceil(maxRadius / cell) + 1;
    const i0 = Math.floor(x / cell), j0 = Math.floor(z / cell);
    for (let r = 0; r <= rings; r++) {
      for (let di = -r; di <= r; di++) {
        for (let dj = -r; dj <= r; dj++) {
          if (r > 0 && Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const list = buckets.get(key(i0 + di, j0 + dj));
          if (!list) continue;
          for (const s of list) {
            const d = Math.hypot(s.x - x, s.z - z) - s.width / 2;
            if (!best || d < best.d) best = { d, sample: s };
          }
        }
      }
      if (best && best.d < r * cell) return best;
    }
    return best;
  };

  return { nearest, samples, count: samples.length };
}

/**
 * How much town is here: 1 in the middle of a dense quarter next to a real
 * street, 0 out where the fields and the forests are.
 *
 * Everything that decides "should there be a street / a house here?" asks this,
 * so the built-up edge of the model is one shape, not seven different guesses.
 */
export function urbanWeight(x, z, ctx) {
  if (ctx.blocked(x, z)) return 0;
  const near = ctx.roadIndex.nearest(x, z, 420);
  if (!near) return 0;
  const distance = Math.max(0, near.d);
  const quarter = ctx.quarterAt(x, z);
  const reach = 55 + 175 * (QUARTER_WEIGHT[quarter] ?? 0.1);
  if (distance > reach) return 0;
  const falloff = 1 - distance / reach;
  return clamp((QUARTER_WEIGHT[quarter] ?? 0.1) * falloff * falloff, 0, 1);
}

/** Lateral offset of a polyline, with a slow drift so it is not a tram line. */
function offsetPolyline(samples, offset, drift) {
  const out = [];
  let along = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (seg < 0.5) continue;
    const nx = (b.z - a.z) / seg, nz = -(b.x - a.x) / seg;
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const o = offset + Math.sin(along / 95 + drift) * 7 + Math.sin(along / 31 + drift * 2) * 2.2;
    out.push({ x: mid.x + nx * o, z: mid.z + nz * o });
    along += seg;
  }
  return out;
}

/** Split a polyline into the runs that pass `ok`, keeping long ones only. */
function runsWhere(points, ok, minLength) {
  const runs = [];
  let run = [];
  for (const p of points) {
    if (ok(p.x, p.z)) {
      run.push(p);
    } else if (run.length) {
      if (polylineLength(run) >= minLength) runs.push(run);
      run = [];
    }
  }
  if (run.length && polylineLength(run) >= minLength) runs.push(run);
  return runs;
}

/**
 * Grow the side streets as offsets of the real skeleton.
 *
 * A valley town is a comb: two or three lanes parallel to the main road at plot
 * depths, joined by short cross lanes every 90-140 m. This builds exactly that,
 * using the real streets' own geometry, so the fabric inherits their bends.
 */
export function generateInfillStreets(ctx, rng, nameFor) {
  const { roadIndex, bounds } = ctx;
  const streets = [];
  const placed = [];             // samples of generated streets, for spacing tests

  const generatedCell = new Map();
  const gkey = (i, j) => `${i}:${j}`;
  const addSample = (p) => {
    const i = Math.floor(p.x / 24), j = Math.floor(p.z / 24);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const k = gkey(i + di, j + dj);
        if (!generatedCell.has(k)) generatedCell.set(k, []);
        generatedCell.get(k).push(p);
      }
    }
  };
  const nearGenerated = (x, z) => {
    const list = generatedCell.get(gkey(Math.floor(x / 24), Math.floor(z / 24)));
    if (!list) return Infinity;
    let best = Infinity;
    for (const p of list) best = Math.min(best, Math.hypot(p.x - x, p.z - z));
    return best;
  };

  const skeletons = [];
  for (const road of ctx.roads) {
    if (!SKELETON_CLASSES.has(road.cls)) continue;
    if (road.length < 110) continue;
    if (road.points.some((p) => p.x < bounds.minX || p.x > bounds.maxX || p.z < bounds.minZ || p.z > bounds.maxZ)) {
      // border roads still count, the bounds are generous
    }
    skeletons.push(road);
  }
  // longest first, so the main valley roads get their lanes before the side ones
  skeletons.sort((a, b) => b.length - a.length);

  for (const road of skeletons) {
    const samples = road.samples && road.samples.length > 3
      ? road.samples
      : resamplePolyline(road.points, 8);
    const depth = 42 + (road.width / 2) * 1.6;
    const mid = road.samples[Math.floor(road.samples.length / 2)] || road.points[0];
    const rings = (QUARTER_WEIGHT[ctx.quarterAt(mid.x, mid.z)] ?? 0.1) >= 0.5 ? 3 : 2;
    for (const side of [-1, 1]) {
      for (let ring = 0; ring < rings; ring++) {
        const offset = side * (depth + ring * 46 + (rng() - 0.5) * 10);
        const line = offsetPolyline(samples, offset, rng() * 6.28);
        if (line.length < 4) continue;
        const drift = rng() * 3;
        const runs = runsWhere(line, (x, z) => {
          if (urbanWeight(x, z, ctx) < 0.14) return false;
          if (nearGenerated(x, z) < 17) return false;
          if (ctx.crossSlope && ctx.crossSlope(x, z) > 0.11) return false;
          return true;
        }, 55);
        for (const run of runs) {
          if (polylineLength(run) < 55) continue;
          for (const p of resamplePolyline(run, 12)) addSample(p);
          streets.push({ points: run, kind: 'lane' });

          // cross lanes back to the parent road, like the gaps between blocks
          const usable = polylineLength(run);
          const step = 95 + rng() * 45;
          for (let s = step * 0.5 + drift * 8; s < usable - 20; s += step) {
            const at = sampleAlong(run, s);
            const parent = nearestOn(road.samples, at.x, at.z);
            if (!parent) continue;
            const link = [{ x: at.x, z: at.z }, { x: parent.x, z: parent.z }];
            const len = polylineLength(link);
            if (len < 18 || len > Math.abs(offset) + 30) continue;
            if (link.some((p) => ctx.blocked(p.x, p.z))) continue;
            if (ctx.crossSlope && link.some((p) => ctx.crossSlope(p.x, p.z) > 0.14)) continue;
            if (nearGenerated(link[0].x, link[0].z) < 6 && nearGenerated(link[1].x, link[1].z) < 6) continue;
            streets.push({ points: link, kind: 'cross' });
            addSample(link[0]);
          }
        }
      }
    }
  }

  let index = 0;
  return streets
    .map((s) => ({
      id: `fabric_${index}`,
      name: nameFor(index++),
      cls: 'residential',
      src: 'model',
      points: s.points
    }))
    .filter((s) => polylineLength(s.points) >= 30);
}

function sampleAlong(points, along) {
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (acc + seg >= along) {
      const t = (along - acc) / (seg || 1);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    acc += seg;
  }
  return points[points.length - 1];
}

function nearestOn(points, x, z) {
  let best = null;
  for (const p of points) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (!best || d < best.d) best = { d, x: p.x, z: p.z };
  }
  return best;
}

export { resamplePolyline };
