/**
 * Houses, as a street frontage.
 *
 * A town is not a set of buildings: it is a set of street walls. Each side of
 * every street is walked continuously and the row closes up to itself — gables
 * 1.2-4.5 m apart in the centre and the Cité Italienne, front gardens of 0.6-2.2
 * m against 5-11 m in the outskirts — which is what makes a street read as a
 * street instead of scattered pavilions.
 *
 * The placer is given everything it needs through `ctx` (all the checks the
 * world owns: is this on a landmark, on the rail, too steep, too far out) and
 * hands each building to `ctx.addBuilding`, so collision, levelling and the id
 * sequence stay in one place.
 */
import { project, polylineAt, randRange, pick } from '../geo.js';
import { ground } from '../heightfield.js';
import {
  STYLE_SETS, FRONT_GARDEN, DENSITY, pickStyle
} from './style.js';

/** Quarters that build hard on the pavement. */
const DENSE = new Set(['centre', 'italien']);

const AWNINGS = ['#b23a48', '#2a6f97', '#3f7d20', '#d98f2b', '#6d597a'];

/** Nei Schmelz: the new quarter's apartment blocks, laid out block by block. */
const CLUSTERS = [
  { lat: 49.47560, lon: 6.08620, rows: 2, cols: 3, w: 32, d: 15, gapX: 13, gapZ: 22, h: 15, rot: 0.12 },
  { lat: 49.47060, lon: 6.08640, rows: 2, cols: 2, w: 30, d: 14, gapX: 14, gapZ: 22, h: 12, rot: -0.1 },
  { lat: 49.47210, lon: 6.08760, rows: 1, cols: 3, w: 26, d: 13, gapX: 12, gapZ: 20, h: 10, rot: 0.3 }
];

export function raiseFrontage(ctx) {
  const {
    rng, roads, districtsMetric, districtAt, protectedZone, urbanWeight, fabricCtx,
    commercialStreets, landmarkAt, nearRoad, railDistance, stations, townCentre,
    addBuilding
  } = ctx;
  let uid = ctx.uid ?? 0;
  const nextId = () => `b${uid++}`;

/**
 * Street frontage, walked continuously.
 *
 * Houses are placed as a row along each side of a street, closing up to each
 * other in the dense quarters (2-5 m between gables, as in a real terraced
 * street) and standing apart in the outskirts. Previously every lot was an
 * independent random step, which left gaps of 20-40 m everywhere and made the
 * town read as scattered pavilions instead of streets.
 */
for (const road of roads) {
  if (road.cls === 'motorway' || road.cls === 'foot') continue;
  if (road.length < 30) continue;
  const fromFabric = road.src === 'model';
  for (const side of [-1, 1]) {
    let d = Math.max(8, road.width / 2 + road.sidewalk);
    while (d < road.length - 8) {
      const at = polylineAt(road.samples, d);
      const nx = Math.cos(at.angle) * side;
      const nz = -Math.sin(at.angle) * side;
      const dist = districtAt(at.x, at.z, districtsMetric);
      if (protectedZone(at.x, at.z)) { d += 8; continue; }

      // how much town is here decides whether there is a row at all
      const urban = urbanWeight(at.x, at.z, fabricCtx);
      if (urban < 0.1) { d += 12; continue; }
      if (rng() > (DENSITY[dist] ?? 0.1) * (fromFabric ? 1 : 0.75)) { d += 10; continue; }

      const garden = FRONT_GARDEN[dist] ?? [3, 6];
      const setback = road.width / 2 + road.sidewalk + randRange(rng, garden[0], garden[1])
        + (road.cls === 'primary' ? 1.5 : 0);
      const style = pickStyle(dist, at.x, at.z, road, rng, commercialStreets);
      const set = STYLE_SETS[style];
      const dense = DENSE.has(dist);
      const w = style === 'usines'
        ? randRange(rng, 18, 34)
        : dense ? randRange(rng, 8, 16) : randRange(rng, 10, 20);
      const depth = style === 'usines' ? randRange(rng, 12, 26) : dense ? randRange(rng, 9, 14) : randRange(rng, 8, 14);
      const mid = polylineAt(road.samples, d + w / 2);
      const cx = mid.x + nx * (setback + depth / 2);
      const cz = mid.z + nz * (setback + depth / 2);
      const gap = dense ? randRange(rng, 1.2, 4.5) : randRange(rng, 5, 16);

      const skip = landmarkAt(cx, cz, 6)
        || nearRoad(cx, cz, 12) < 2.5
        || railDistance(cx, cz) < 13
        || stations.some((st) => Math.hypot(st.x - cx, st.z - cz) < 46)
        || Math.hypot(cx - townCentre.x, cz - townCentre.z) > 1850 && !['burange', 'budersberg'].includes(dist);
      if (skip) { d += 7; continue; }

      const corners = [
        { x: cx - w / 2, z: cz - depth / 2 }, { x: cx + w / 2, z: cz - depth / 2 },
        { x: cx + w / 2, z: cz + depth / 2 }, { x: cx - w / 2, z: cz + depth / 2 }
      ];
      const hs = corners.map((c) => ground(c.x, c.z));
      const baseY = Math.min(...hs) - 0.4;
      if (Math.max(...hs) - Math.min(...hs) > 5.5) { d += 7; continue; }

      const floors = Math.round(randRange(rng, set.floors[0], set.floors[1] + 0.99));
      const h = floors * 3.15 + randRange(rng, 1.2, 2.6);
      const shop = rng() < set.shopChance;
      const placed = addBuilding({
        id: nextId(),
        x: cx, z: cz, rot: at.angle, side,
        w, d: depth, h, floors, baseY,
        style, district: dist, road: road.id,
        wall: pick(rng, set.wall),
        roof: pick(rng, set.roof),
        roofType: style === 'usines' || style === 'neischmelz' ? (rng() < 0.5 ? 'flat' : 'saw') : (rng() < 0.88 ? 'gable' : 'hip'),
        pitch: set.pitch,
        shop,
        awning: shop ? pick(rng, ['#b23a48', '#2a6f97', '#3f7d20', '#d98f2b', '#6d597a']) : null,
        chimney: rng() < 0.6,
        floorsLit: [],
        seed: Math.floor(rng() * 100000)
      });
      d += placed ? w + gap : 6;
    }
  }
}

// ------------------------------------------------ Nei Schmelz new quarter
// Modern apartment blocks of the Nei Schmelz eco-district (model layout).
for (const c of CLUSTERS) {
  const o = project(c.lat, c.lon);
  const ax = { x: Math.cos(c.rot), z: -Math.sin(c.rot) };
  const az = { x: Math.sin(c.rot), z: Math.cos(c.rot) };
  for (let r = 0; r < c.rows; r++) {
    for (let col = 0; col < c.cols; col++) {
      const ox = (col - (c.cols - 1) / 2) * (c.w + c.gapX);
      const oz = (r - (c.rows - 1) / 2) * (c.d + c.gapZ);
      const x = o.x + ax.x * ox + az.x * oz;
      const z = o.z + ax.z * ox + az.z * oz;
      if (railDistance(x, z) < 16) continue;
      addBuilding({
        id: nextId(), x, z, rot: c.rot, side: 1, w: c.w, d: c.d, h: c.h,
        floors: Math.round(c.h / 3.3), baseY: ground(x, z) - 0.4,
        style: 'neischmelz', district: 'neischmelz', road: 'neischmelz_block',
        wall: pick(rng, STYLE_SETS.neischmelz.wall), roof: pick(rng, STYLE_SETS.neischmelz.roof),
        roofType: 'flat', pitch: 0.05, shop: rng() < 0.25,
        awning: null, chimney: false, floorsLit: [], seed: Math.floor(rng() * 100000)
      });
    }
  }
}

  return { uid };
}
