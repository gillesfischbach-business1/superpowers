/**
 * Deterministic town generator.
 *
 * Pure JS (no three.js, no DOM) so that the multi-agent pipeline can build and
 * validate exactly the world the browser renders. Given the same seed this
 * always produces byte-identical output.
 */
import {
  project, unproject, terrainHeight, resamplePolyline, polylineLength, polylineAt,
  closestOnPolyline, pointInPolygon, mulberry32, hash2, clamp, lerp, randRange,
  pick, obbContains, circleHitsBox
} from './geo.js';
import { META, ROADS, RAIL, LANDMARKS, DISTRICTS } from './town-data.js';

const ROAD_WIDTH = { motorway: 20, primary: 12, secondary: 9.5, residential: 7, foot: 3.2 };
const SIDEWALK = { motorway: 0, primary: 2.4, secondary: 2.2, residential: 1.8, foot: 0 };
const SETBACK = { motorway: 12, primary: 6, secondary: 4, residential: 3, foot: 2 };

const STYLE_SETS = {
  centre: {
    wall: ['#e6d8bf', '#dcc9a8', '#e9ddc9', '#d3bd9b', '#efe6d6', '#cbb693'],
    roof: ['#5a5148', '#4c443c', '#6a5a4c', '#54463c'],
    floors: [3, 4], pitch: 0.62, shopChance: 0.55
  },
  italien: {
    wall: ['#a4543c', '#9c4a35', '#b06a4f', '#8f4531', '#a85c41'],
    roof: ['#6b4a3a', '#5c4033', '#7a5240'],
    floors: [2, 3], pitch: 0.5, shopChance: 0.34
  },
  burange: {
    wall: ['#f0ece4', '#e6e0d5', '#dcd6c8', '#efe9de', '#e2d9c9'],
    roof: ['#7a4b3a', '#6b4433', '#5d3d30', '#84614a'],
    floors: [2, 2], pitch: 0.72, shopChance: 0.08
  },
  budersberg: {
    wall: ['#e8e2d2', '#d9d0bb', '#cfc4ab', '#efe8d8'],
    roof: ['#5d4636', '#4f3c2f', '#6a5240'],
    floors: [2, 2], pitch: 0.85, shopChance: 0.05
  },
  neischmelz: {
    wall: ['#dcdcd8', '#c9c9c2', '#b9a58c', '#8fa3a8', '#e5e2dc'],
    roof: ['#585f60', '#4a5152'],
    floors: [3, 5], pitch: 0.05, shopChance: 0.12
  },
  usines: {
    wall: ['#9aa0a1', '#8b8f8d', '#a8a29a', '#7f8785'],
    roof: ['#5c6363', '#4b5252'],
    floors: [1, 2], pitch: 0.12, shopChance: 0.05
  },
  outskirts: {
    wall: ['#efe9dc', '#e3dbc9', '#d8cfba', '#f2ece0'],
    roof: ['#6d4b38', '#5b3f2f', '#7c5a44'],
    floors: [2, 3], pitch: 0.7, shopChance: 0.04
  }
};

const GENERATED_NAMES = [
  'Rue Alexander Fleming', 'Rue Louis Pasteur', 'Rue de la Fontaine', 'Rue des Romains',
  'Rue du Moulin', 'Rue de l’Usine', 'Rue des Martyrs', 'Rue du Parc', 'Rue des Champs',
  'Rue de l’École', 'Rue de la Chapelle', 'Rue des Prés', 'Rue du Stade',
  'Rue de l’Industrie', 'Rue des Acacias', 'Rue des Tilleuls', 'Rue des Cerisiers',
  'Rue du Cimetière', 'Rue des Roseaux', 'Rue de la Gare', 'Rue des Vergers',
  'Rue du Lavoir', 'Rue des Houblonnières', 'Rue de la Bruyère', 'Rue des Aulnes',
  'Rue du Château d’Eau', 'Rue des Ciments', 'Rue de la Minette', 'Rue du Verger',
  'Rue des Sources', 'Rue de la Frontière', 'Rue des Pins', 'Rue des Peupliers'
];

/** Zones where the generator must not put ordinary houses. */
const PROTECTED = [
  { id: 'parc_leh', polygon: [[49.4838, 6.0955], [49.4876, 6.0955], [49.4880, 6.1045], [49.4840, 6.1050]] },
  { id: 'mont_st_jean', polygon: [[49.4855, 6.0540], [49.4945, 6.0540], [49.4945, 6.0680], [49.4855, 6.0680]] },
  { id: 'kalebierg', polygon: [[49.4630, 6.0500], [49.4710, 6.0500], [49.4710, 6.0680], [49.4630, 6.0680]] },
  { id: 'works_core', polygon: [[49.4710, 6.0782], [49.4750, 6.0782], [49.4752, 6.0842], [49.4712, 6.0852]] },
  { id: 'stade', polygon: [[49.4888, 6.0876], [49.4920, 6.0876], [49.4920, 6.0920], [49.4888, 6.0920]] },
  { id: 'pond', polygon: [[49.4796, 6.0810], [49.4810, 6.0810], [49.4810, 6.0829], [49.4796, 6.0829]] },
  { id: 'cemetery', polygon: [[49.4808, 6.0796], [49.4820, 6.0796], [49.4820, 6.0810], [49.4808, 6.0810]] }
];

function metricPolygon(poly) {
  return poly.map(([lat, lon]) => project(lat, lon));
}

function roadTouchesProtected(x, z, margin = 0) {
  for (const p of PROTECTED) {
    if (pointInPolygon(x, z, p.metric)) return p.id;
  }
  return null;
}

/** Build side streets inside each district polygon, aligned to the main axes. */
function generateStreets(rng) {
  const streets = [];
  let nameIdx = 0;
  const districts = DISTRICTS.filter((d) => ['centre', 'italien', 'burange'].includes(d.id));
  for (const d of districts) {
    const poly = metricPolygon(d.polygon);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of poly) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const angles = d.id === 'centre' || d.id === 'italien' ? [0.06, 1.63] : [0.28, 1.86];
    const spacing = d.id === 'centre' || d.id === 'italien' ? 128 : 168;
    for (let ai = 0; ai < 2; ai++) {
      const angle = angles[ai];
      const dirX = Math.sin(angle), dirZ = Math.cos(angle);
      const nX = Math.cos(angle), nZ = -Math.sin(angle);
      const diag = Math.hypot(maxX - minX, maxZ - minZ);
      const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
      for (let off = -diag / 2; off <= diag / 2; off += spacing) {
        const pts = [];
        for (let s = -diag / 2; s <= diag / 2; s += 12) {
          const x = cx + nX * off + dirX * s;
          const z = cz + nZ * off + dirZ * s;
          if (pointInPolygon(x, z, poly)) pts.push({ x, z });
          else if (pts.length) break;
        }
        if (pts.length < 4) continue;
        const length = polylineLength(pts);
        if (length < 90) continue;
        // slice long lines into 2-3 named streets so the map feels real
        const chunks = Math.max(1, Math.min(3, Math.round(length / 260)));
        let start = 0;
        for (let c = 0; c < chunks; c++) {
          const len = length / chunks;
          const seg = slicePolyline(pts, start, start + len);
          start += len;
          if (seg.length < 3) continue;
          streets.push({
            id: `gen_${streets.length}`,
            name: GENERATED_NAMES[nameIdx++ % GENERATED_NAMES.length],
            cls: 'residential',
            src: 'model',
            points: seg
          });
        }
      }
    }
  }
  return streets;
}

function slicePolyline(points, from, to) {
  const out = [];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (acc + seg < from) { acc += seg; continue; }
    if (acc > to) break;
    if (!out.length) {
      const t = clamp((from - acc) / seg, 0, 1);
      out.push({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) });
    }
    out.push({ ...b });
    acc += seg;
  }
  return out;
}

function districtAt(x, z, districtsMetric) {
  for (const d of districtsMetric) if (pointInPolygon(x, z, d.poly)) return d.id;
  return 'outskirts';
}

/** Public: build the complete world description. */
export function buildWorld({ seed = 20261112 } = {}) {
  const rng = mulberry32(seed);
  const districtsMetric = DISTRICTS.map((d) => ({
    ...d, poly: metricPolygon(d.polygon), centre: polygonCentre(metricPolygon(d.polygon))
  }));
  for (const p of PROTECTED) p.metric = metricPolygon(p.polygon);

  // ---------------------------------------------------------------- roads
  const roads = [];
  for (const r of ROADS) {
    const pts = r.points.map(([lat, lon]) => project(lat, lon));
    const samples = resamplePolyline(pts, 8);
    roads.push({
      ...r, points: pts, samples,
      width: ROAD_WIDTH[r.cls] ?? 7,
      sidewalk: SIDEWALK[r.cls] ?? 1.8,
      length: polylineLength(pts),
      lanes: r.cls === 'motorway' ? 4 : r.cls === 'foot' ? 0 : r.cls === 'primary' ? 2 : 2
    });
  }
  const generated = generateStreets(rng);
  for (const g of generated) {
    const samples = resamplePolyline(g.points, 8);
    roads.push({
      ...g, samples, width: ROAD_WIDTH.residential, sidewalk: SIDEWALK.residential,
      length: polylineLength(g.points), lanes: 2
    });
  }

  // spatial index of road samples for "is this lot on another street?" tests
  const roadGrid = new SpatialGrid(48);
  for (const r of roads) {
    for (const s of r.samples) roadGrid.insert(s.x, s.z, { x: s.x, z: s.z, w: r.width, id: r.id });
  }
  const nearRoad = (x, z, radius) => {
    let worst = Infinity;
    for (const o of roadGrid.query(x, z, radius + 20)) {
      const d = Math.hypot(o.x - x, o.z - z) - o.w / 2;
      if (d < worst) worst = d;
    }
    return worst;
  };

  // ---------------------------------------------------------------- rail
  const railPts = RAIL.points.map(([lat, lon]) => project(lat, lon));
  const railSamples = resamplePolyline(railPts, 6);
  const railLength = polylineLength(railPts);
  const stations = RAIL.stations.map((s) => {
    const p = project(s.lat, s.lon);
    const near = closestOnPolyline(railPts, p.x, p.z);
    const d = distanceAlong(railPts, near.x, near.z);
    return { ...s, x: p.x, z: p.z, railDist: d, elevation: terrainHeight(p.x, p.z) };
  });
  // tune station chainage so the train always stops in order
  stations.sort((a, b) => a.railDist - b.railDist);
  for (let i = 0; i < stations.length; i++) {
    stations[i].platformY = stations[i].elevation + 2.6;
  }

  // ---------------------------------------------------------------- landmarks
  const landmarks = LANDMARKS.map((l) => {
    const p = project(l.lat, l.lon);
    return {
      ...l, x: p.x, z: p.z,
      baseY: terrainHeight(p.x, p.z),
      district: districtAt(p.x, p.z, districtsMetric)
    };
  });
  const landmarkAt = (x, z, pad = 0) => landmarks.find((l) => {
    const hw = l.size.w / 2 + pad, hd = l.size.d / 2 + pad;
    return Math.abs(x - l.x) <= hw && Math.abs(z - l.z) <= hd;
  });

  // ---------------------------------------------------------------- buildings
  const buildings = [];
  const buildingGrid = new SpatialGrid(28);
  const colliders = [];
  let colliderGrid = new SpatialGrid(40);

  const addBuilding = (b) => {
    if (b.w < 4 || b.d < 4) return false;
    const obb = { x: b.x, z: b.z, hw: b.d / 2, hd: b.w / 2, rot: b.rot };
    for (const other of buildingGrid.query(b.x, b.z, Math.max(b.w, b.d) + 8)) {
      // near-identical centres slip past a corner-inside test, so guard the gap too
      if (Math.hypot(other.obb.x - b.x, other.obb.z - b.z) < 3) return false;
      if (obbOverlap(obb, other.obb, 1.6)) return false;
    }
    buildings.push(b);
    buildingGrid.insert(b.x, b.z, { obb });
    colliders.push({ ...obb, type: 'building', id: b.id, h: b.h });
    if (!colliderGrid) return true;
    colliderGrid.insert(b.x, b.z, colliders[colliders.length - 1]);
    return true;
  };

  const commercialStreets = new Set(['zoufftgen', 'liberation', 'gdc', 'commerce']);
  const DENSITY = { centre: 1.0, italien: 0.92, burange: 0.55, budersberg: 0.16, neischmelz: 0.35, usines: 0.22, outskirts: 0.07 };
  const townCentre = project(49.4787, 6.0846);
  const railDistance = (x, z) => closestOnPolyline(railPts, x, z).dist;
  let uid = 0;
  for (const road of roads) {
    if (road.cls === 'motorway' || road.cls === 'foot') continue;
    if (road.length < 40) continue;
    for (const side of [-1, 1]) {
      let d = 18;
      while (d < road.length - 14) {
        const step = randRange(rng, 22, 40);
        const at = polylineAt(road.samples, d);
        d += step;
        const nx = Math.cos(at.angle) * side;
        const nz = -Math.sin(at.angle) * side;
        const dist = districtAt(at.x, at.z, districtsMetric);
        if (protectedZone(at.x, at.z)) continue;

        const setback = road.width / 2 + road.sidewalk + (SETBACK[road.cls] ?? 3) * randRange(rng, 0.7, 1.3);
        const style = pickStyle(dist, at.x, at.z, road, rng, commercialStreets);
        const set = STYLE_SETS[style];
        const w = randRange(rng, 10, style === 'usines' ? 34 : 20);
        const depth = randRange(rng, 9, style === 'usines' ? 26 : 15);
        const floors = Math.round(randRange(rng, set.floors[0], set.floors[1] + 0.99));
        const h = floors * 3.15 + randRange(rng, 1.2, 2.6);
        const cx = at.x + nx * (setback + depth / 2);
        const cz = at.z + nz * (setback + depth / 2);
        if (landmarkAt(cx, cz, 8)) continue;
        if (nearRoad(cx, cz, 10) < 3) continue;
        if (railDistance(cx, cz) < 13) continue;
        if (stations.some((st) => Math.hypot(st.x - cx, st.z - cz) < 46)) continue;
        if (rng() > (DENSITY[dist] ?? 0.1)) continue;
        const centreDist = Math.hypot(cx - townCentre.x, cz - townCentre.z);
        if (centreDist > 1850 && !['burange', 'budersberg'].includes(dist)) continue;
        if (['burange'].includes(dist) && rng() < 0.18 && centreDist > 1200) continue;

        // footprint corners must sit on reasonably level ground
        const corners = [
          { x: cx - w / 2, z: cz - depth / 2 }, { x: cx + w / 2, z: cz - depth / 2 },
          { x: cx + w / 2, z: cz + depth / 2 }, { x: cx - w / 2, z: cz + depth / 2 }
        ];
        const hs = corners.map((c) => terrainHeight(c.x, c.z));
        const baseY = Math.min(...hs) - 0.4;
        if (Math.max(...hs) - Math.min(...hs) > 8.5) continue;

        const shop = rng() < set.shopChance;
        const building = {
          id: `b${uid++}`,
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
        };
        addBuilding(building);
      }
    }
  }

  // ------------------------------------------------ Nei Schmelz new quarter
  // Modern apartment blocks of the Nei Schmelz eco-district (model layout).
  const clusters = [
    { lat: 49.47560, lon: 6.08620, rows: 2, cols: 3, w: 32, d: 15, gapX: 13, gapZ: 22, h: 15, rot: 0.12 },
    { lat: 49.47060, lon: 6.08640, rows: 2, cols: 2, w: 30, d: 14, gapX: 14, gapZ: 22, h: 12, rot: -0.1 },
    { lat: 49.47210, lon: 6.08760, rows: 1, cols: 3, w: 26, d: 13, gapX: 12, gapZ: 20, h: 10, rot: 0.3 }
  ];
  for (const c of clusters) {
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
          id: `b${uid++}`, x, z, rot: c.rot, side: 1, w: c.w, d: c.d, h: c.h,
          floors: Math.round(c.h / 3.3), baseY: terrainHeight(x, z) - 0.4,
          style: 'neischmelz', district: 'neischmelz', road: 'neischmelz_block',
          wall: pick(rng, STYLE_SETS.neischmelz.wall), roof: pick(rng, STYLE_SETS.neischmelz.roof),
          roofType: 'flat', pitch: 0.05, shop: rng() < 0.25,
          awning: null, chimney: false, floorsLit: [], seed: Math.floor(rng() * 100000)
        });
      }
    }
  }

  const FORESTS = [
    { id: 'mont_st_jean', centre: project(49.4898, 6.0615), rx: 620, rz: 520, count: 1350 },
    { id: 'kalebierg', centre: project(49.4670, 6.0570), rx: 560, rz: 460, count: 900 },
    { id: 'parc_leh', centre: project(49.4862, 6.0995), rx: 250, rz: 200, count: 620 },
    { id: 'north_woods', centre: project(49.4960, 6.0700), rx: 560, rz: 340, count: 760 },
    { id: 'east_ridge', centre: project(49.4700, 6.1000), rx: 380, rz: 460, count: 620 },
    { id: 'valley_belt', centre: project(49.4680, 6.0700), rx: 320, rz: 280, count: 420 }
  ];

  // ---------------------------------------------------------- forest trails
  // Footpaths that make the woods properly walkable: each one leaves the nearest
  // street, passes a viewpoint or landmark, and carries on into the trees.
  const trailAnchors = [
    { id: 'trail_st_jean', name: 'Sentier du Mont Saint-Jean', landmark: 'mont_st_jean', forest: 'mont_st_jean', dist: 430 },
    { id: 'trail_kalebierg', name: 'Sentier du Kalebierg', landmark: 'kalebierg', forest: 'kalebierg', dist: 390 },
    { id: 'trail_parc', name: 'Sentier du Parc Le’h', landmark: 'parc_leh_rest', forest: 'parc_leh', dist: 280 },
    { id: 'trail_etang', name: 'Sentier de l’Étang', landmark: 'etang', forest: 'valley_belt', dist: 250, kind: 'park' },
    { id: 'trail_north', name: 'Sentier de la vallée', landmark: null, forest: 'north_woods', start: [49.4948, 6.0742], dist: 560 }
  ];
  const nearestStreet = (x, z) => {
    let best = { d: Infinity, x, z };
    for (const r of roads) {
      for (const sp of r.samples) {
        const d = Math.hypot(sp.x - x, sp.z - z);
        if (d < best.d) best = { d, x: sp.x, z: sp.z };
      }
    }
    return best;
  };
  const forestPaths = [];
  const clearings = [];
  for (const spec of trailAnchors) {
    const lm = spec.landmark ? landmarks.find((l) => l.id === spec.landmark) : null;
    const anchor = lm ? { x: lm.x, z: lm.z } : project(spec.start[0], spec.start[1]);
    const street = nearestStreet(anchor.x, anchor.z);
    if (street.d > 900) continue;
    const centre = (FORESTS.find((f) => f.id === spec.forest) || FORESTS[0]).centre;
    // where the path bends into the trees: towards the middle of the forest belt
    let dx = centre.x - anchor.x, dz = centre.z - anchor.z;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl; dz /= dl;
    const mouth = { x: anchor.x + dx * spec.dist, z: anchor.z + dz * spec.dist };
    const raw = [{ x: street.x, z: street.z }];
    const segs = [[street, anchor], [anchor, mouth]];
    for (const [a, b] of segs) {
      const sx = b.x - a.x, sz = b.z - a.z;
      const sl = Math.hypot(sx, sz);
      if (sl < 20) continue;
      const nx = -sz / sl, nz = sx / sl;
      for (const t of [0.35, 0.7]) {
        const amp = randRange(rng, 6, 16) * Math.sin(t * Math.PI);
        const bend = (rng() < 0.5 ? -1 : 1) * amp;
        raw.push({ x: a.x + sx * t + nx * bend, z: a.z + sz * t + nz * bend });
      }
      raw.push(b);
    }
    const pts = resamplePolyline(raw, 5);
    if (pts.length < 4) continue;
    forestPaths.push({
      id: spec.id, name: spec.name, kind: spec.kind || 'forest', points: raw, samples: pts,
      length: +polylineLength(pts).toFixed(1), from: spec.landmark || 'road', to: 'forest'
    });
    clearings.push({ id: `${spec.id}_view`, name: spec.name, x: mouth.x, z: mouth.z, r: 15, trail: spec.id });
    clearings.push({ id: `${spec.id}_glade`, name: spec.name, x: raw[Math.floor(raw.length / 2)].x, z: raw[Math.floor(raw.length / 2)].z, r: 11, trail: spec.id });
  }
  const nearTrail = (x, z, pad = 0) => forestPaths.some((t) => t.samples.some((p) => Math.hypot(p.x - x, p.z - z) < 3.4 + pad));

  // ---------------------------------------------------------------- trees
  const treeGrid = new SpatialGrid(6);
  const trees = [];
  const plantTree = (x, z, scale = 1, kind = 'deciduous') => {
    // a proper distance test: the grid only narrows the candidate set
    if (treeGrid.query(x, z, 4).some((t) => Math.hypot(t.x - x, t.z - z) < 4)) return false;
    if (kind === 'deciduous' && nearTrail(x, z)) return false;
    if (kind === 'deciduous' && clearings.some((c) => Math.hypot(c.x - x, c.z - z) < c.r)) return false;
    const tree = { x, z, y: terrainHeight(x, z), scale, kind, rot: rng() * Math.PI * 2, variant: Math.floor(rng() * 3) };
    trees.push(tree);
    treeGrid.insert(x, z, tree);
    // trunks are solid, but you can always walk between them
    if (kind === 'deciduous' && scale >= 0.95) {
      const r = 0.34 * scale;
      const trunk = { x, z, hw: r, hd: r, rot: 0, type: 'tree', h: 6 * scale };
      colliders.push(trunk);
      if (colliderGrid) colliderGrid.insert(x, z, trunk);
    }
    return true;
  };

  // forest belts
  // Trees grow in thickets: pick a cluster centre, then a handful of trunks around it.
  for (const f of FORESTS) {
    let placed = 0, guard = 0;
    while (placed < f.count && guard++ < f.count * 14) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng());
      const cx = f.centre.x + Math.cos(a) * f.rx * r;
      const cz = f.centre.z + Math.sin(a) * f.rz * r;
      if (nearRoad(cx, cz, 12) < 4) continue;
      if (landmarkAt(cx, cz, 4)) continue;
      if (nearRoad(cx, cz, 30) < 6 && nearTrail(cx, cz, 30)) continue;
      if (buildings.some((b) => obbContains({ x: b.x, z: b.z, hw: b.d / 2 + 3, hd: b.w / 2 + 3, rot: b.rot }, cx, cz))) continue;
      const thicket = 2 + Math.floor(rng() * 4);
      for (let k = 0; k < thicket && placed < f.count; k++) {
        const ox = cx + randRange(rng, -9, 9), oz = cz + randRange(rng, -9, 9);
        if (nearRoad(ox, oz, 10) < 4) continue;
        if (landmarkAt(ox, oz, 3)) continue;
        if (plantTree(ox, oz, randRange(rng, 0.8, 1.7), 'deciduous')) placed++;
      }
    }
  }
  // undergrowth: ferns and bramble at the forest edge, kept off the paths
  const undergrowth = [];
  for (const f of FORESTS) {
    let placed = 0, guard = 0;
    while (placed < 320 && guard++ < 6000) {
      const a2 = rng() * Math.PI * 2, r2 = Math.sqrt(rng());
      const x = f.centre.x + Math.cos(a2) * f.rx * r2;
      const z = f.centre.z + Math.sin(a2) * f.rz * r2;
      if (nearTrail(x, z, -1.6)) continue;
      if (nearRoad(x, z, 40) < 3) continue;
      undergrowth.push({ x, z, y: terrainHeight(x, z), scale: randRange(rng, 0.7, 1.5), rot: rng() * Math.PI * 2, kind: rng() < 0.7 ? 'fern' : 'bush' });
      placed++;
    }
  }

  // street + garden trees
  for (const road of roads) {
    if (road.cls === 'foot' || road.cls === 'motorway') continue;
    if (road.cls === 'residential' && rng() > 0.4) continue;
    for (let d = 12; d < road.length - 10; d += randRange(rng, 22, 38)) {
      const side = rng() < 0.5 ? -1 : 1;
      const at = polylineAt(road.samples, d);
      const off = road.width / 2 + road.sidewalk + randRange(rng, 2, 5);
      const x = at.x + Math.cos(at.angle) * side * off;
      const z = at.z - Math.sin(at.angle) * side * off;
      if (landmarkAt(x, z, 2)) continue;
      if (buildings.some((b) => obbContains({ x: b.x, z: b.z, hw: b.d / 2 + 1, hd: b.w / 2 + 1, rot: b.rot }, x, z))) continue;
      plantTree(x, z, randRange(rng, 0.55, 1.05), 'street');
    }
  }

  // ---------------------------------------------------------------- props
  const props = [];
  for (const road of roads) {
    if (road.cls === 'motorway' || road.cls === 'foot') continue;
    let side = 1;
    for (let d = 16; d < road.length - 8; d += randRange(rng, 26, 36)) {
      side *= -1;
      const at = polylineAt(road.samples, d);
      const off = road.width / 2 + road.sidewalk * 0.55;
      const x = at.x + Math.cos(at.angle) * side * off;
      const z = at.z - Math.sin(at.angle) * side * off;
      if (landmarkAt(x, z, 1)) continue;
      props.push({ type: 'lamp', x, z, rot: at.angle, y: terrainHeight(x, z) });
      if (rng() < 0.22) {
        props.push({ type: 'bench', x: x + Math.cos(at.angle) * side * 1.6, z: z - Math.sin(at.angle) * side * 1.6, rot: at.angle + Math.PI, y: terrainHeight(x, z) });
      }
      if (rng() < 0.12) {
        props.push({ type: 'bin', x: x + Math.cos(at.angle) * side * 1.1, z: z - Math.sin(at.angle) * side * 1.1, rot: at.angle, y: terrainHeight(x, z) });
      }
    }
  }
  // parked cars — every one of them can be hot-wired
  const cars = [];
  const carColors = ['#b23a48', '#2a6f97', '#e9c46a', '#264653', '#e6e6e6', '#1d1d1d', '#7f8c8d', '#bc6c25', '#457b9d', '#6a994e'];
  const carGrid = new SpatialGrid(24);
  const addCar = (x, z, rot, color, owned = false) => {
    if (carGrid.query(x, z, 11).length) return false;
    for (const b of buildings) {
      if (obbContains({ x: b.x, z: b.z, hw: b.d / 2 + 2.6, hd: b.w / 2 + 2.2, rot: b.rot }, x, z)) return false;
    }
    const car = {
      id: `car_${cars.length}`, x, z, rot, color, owned,
      y: terrainHeight(x, z), district: districtAt(x, z, districtsMetric), parked: true
    };
    cars.push(car);
    carGrid.insert(x, z, car);
    const collider = { x, z, hw: 2.05, hd: 0.92, rot, type: 'car', id: car.id };
    car.collider = collider;
    colliders.push(collider);
    return true;
  };
  // the player's own car, parked by the town-hall square
  const ownSpot = project(49.47790, 6.08560);
  addCar(ownSpot.x, ownSpot.z, Math.PI * 0.5, '#b23a48', true);
  for (const road of roads) {
    if (cars.length >= 34) break;
    if (road.cls === 'foot' || road.cls === 'motorway' || road.length < 90) continue;
    const spacing = road.cls === 'residential' ? 70 : 110;
    for (let d = 24; d < road.length - 16; d += spacing + randRange(rng, 0, 40)) {
      if (cars.length >= 34) break;
      if (rng() > (road.cls === 'residential' ? 0.55 : 0.75)) continue;
      const at = polylineAt(road.samples, d);
      const side = rng() < 0.5 ? -1 : 1;
      const off = road.width / 2 + 1.4;
      const x = at.x + Math.cos(at.angle) * side * off;
      const z = at.z - Math.sin(at.angle) * side * off;
      if (landmarkAt(x, z, 3)) continue;
      addCar(x, z, at.angle + (side > 0 ? 0 : Math.PI), pick(rng, carColors));
    }
  }
  // bus stops at the stations + town hall
  for (const s of stations) {
    props.push({ type: 'bus_stop', x: s.x + 18, z: s.z + 12, rot: 0.2, y: terrainHeight(s.x + 18, s.z + 12) });
  }
  for (const l of landmarks) {
    if (l.kind === 'supermarket' || l.kind === 'restaurant') {
      props.push({ type: 'terrace', x: l.x + Math.cos(l.rotation || 0) * (l.size.d / 2 + 3), z: l.z - Math.sin(l.rotation || 0) * (l.size.d / 2 + 3), rot: l.rotation || 0, y: terrainHeight(l.x, l.z), w: Math.min(16, l.size.w * 0.6) });
    }
  }

  // ---------------------------------------------------------------- water
  const streamPoints = [
    project(49.4970, 6.0874), project(49.4900, 6.0850), project(49.4845, 6.0833),
    project(49.4803, 6.0819), project(49.4770, 6.0828), project(49.4730, 6.0818),
    project(49.4680, 6.0800), project(49.4640, 6.0788)
  ];
  const water = {
    stream: { name: 'Diddelengerbaach', points: streamPoints, width: 3.4 },
    pond: { name: 'Étang', x: project(49.48030, 6.08190).x, z: project(49.48030, 6.08190).z, r: 17 }
  };

  // ---------------------------------------------------------------- POIs
  const pois = [];
  for (const l of landmarks) {
    pois.push({ id: l.id, name: l.name, kind: l.kind, x: l.x, z: l.z, blurb: l.blurb, interior: l.interior });
  }
  for (const s of stations) {
    pois.push({ id: `st_${s.id}`, name: s.name, kind: 'station', x: s.x, z: s.z, blurb: 'CFL stop on line 60a', interior: 'station', station: s.id });
  }
  pois.push({ id: 'parc_leh_park', name: 'Parc Le’h', kind: 'park', x: project(49.4860, 6.0990).x, z: project(49.4860, 6.0990).z, blurb: 'Forest park with playground and treetop course' });
  pois.push({ id: 'pl_townhall', name: 'Place de l’Hôtel de Ville', kind: 'square', x: project(49.47860, 6.08420).x, z: project(49.47860, 6.08420).z, blurb: 'The heart of Diddeleng' });
  pois.push({ id: 'frontier', name: 'Frontière française / Zoufftgen', kind: 'border', x: project(49.47860, 6.11000).x, z: project(49.47860, 6.11000).z, blurb: 'Schengen border — the road carries on into Moselle' });
  pois.push({ id: 'volmerange', name: 'Volmerange-les-Mines (FR)', kind: 'border', x: project(49.45900, 6.07560).x, z: project(49.45900, 6.07560).z, blurb: 'French terminus of line 60a, with its P+R' });

  // ----------------------------------------------------------------- doors
  // Entrances face the nearest street so they are always reachable on foot.
  const allSamples = roads.flatMap((r) => r.samples);
  const nearestRoadTo = (x, z) => {
    let best = { d: Infinity, x, z };
    for (const s of allSamples) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < best.d) best = { d, x: s.x, z: s.z };
    }
    return best;
  };
  const facingDoor = (obj, halfExtent) => {
    const nr = nearestRoadTo(obj.x, obj.z);
    let dx = nr.x - obj.x, dz = nr.z - obj.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    return {
      x: obj.x + dx * halfExtent,
      z: obj.z + dz * halfExtent,
      rot: Math.atan2(dx, dz),
      distanceToRoad: Math.max(0, nr.d - halfExtent)
    };
  };

  const doors = [];
  for (const l of landmarks) {
    if (!l.interior) continue;
    const door = facingDoor(l, Math.min(l.size.w, l.size.d) / 2 + 1.2);
    doors.push({
      id: l.id, name: l.name, interior: l.interior,
      x: door.x, z: door.z, rot: door.rot, y: terrainHeight(door.x, door.z) + 1.5,
      distanceToRoad: +door.distanceToRoad.toFixed(1), source: 'landmark'
    });
  }
  // Station halls are built with their door on the +z face of the hall block; mirror that
  // local point here so the validation, the marker and the renderer agree on one entrance.
  for (const s of stations) {
    const at = polylineAt(railPts, s.railDist) || { x: s.x, z: s.z, angle: 0 };
    const lx = -8.5, lz = 10.6;
    const cos = Math.cos(at.angle || 0), sin = Math.sin(at.angle || 0);
    const x = at.x + lx * cos + lz * sin;
    const z = at.z - lx * sin + lz * cos;
    const nr = nearestRoadTo(x, z);
    doors.push({
      id: `station_${s.id}`, name: `${s.name} — hall`, interior: 'station',
      x, z, rot: at.angle || 0, y: s.elevation + 1.6,
      distanceToRoad: +Math.max(0, nr.d).toFixed(1), source: 'station'
    });
  }

  // ---------------------------------------------------------------- tunnels
  const tunnels = buildTunnels(railPts, roads);

  // ---------------------------------------------------------------- spawn
  const spawnPoint = project(49.47835, 6.08410);
  const spawn = { x: spawnPoint.x, z: spawnPoint.z, y: terrainHeight(spawnPoint.x, spawnPoint.z), rot: Math.PI * 0.85 };

  // cars placed after the collider grid exists would not be grabbable for push-out
  for (const c of cars) if (colliderGrid) colliderGrid.insert(c.x, c.z, c.collider);

  const stats = {
    seed,
    roads: roads.length,
    namedRoads: roads.filter((r) => r.src === 'osm').length,
    roadKm: +(roads.reduce((s, r) => s + r.length, 0) / 1000).toFixed(2),
    buildings: buildings.length,
    trees: trees.length,
    props: props.length,
    landmarks: landmarks.length,
    stations: stations.length,
    districts: districtsMetric.length,
    tunnels: tunnels.length,
    pois: pois.length,
    doors: doors.length,
    cars: cars.length,
    trails: forestPaths.length,
    undergrowth: undergrowth.length,
    railKm: +(railLength / 1000).toFixed(2)
  };

  return {
    meta: META, seed, stats,
    districts: districtsMetric,
    roads, rail: { ...RAIL, points: railPts, samples: railSamples, length: railLength, stations },
    landmarks, buildings, trees, props, water, pois, tunnels, doors, cars, spawn,
    forestPaths, clearings, undergrowth,
    colliders, colliderGrid, forests: FORESTS.map((f) => ({ id: f.id, ...f })),
    protectedZones: PROTECTED.map((p) => ({ id: p.id, poly: p.metric })),
    functions: { nearRoad, landmarkAt, districtAt: (x, z) => districtAt(x, z, districtsMetric) }
  };
}

function protectedZone(x, z) {
  return PROTECTED.some((p) => p.metric && pointInPolygon(x, z, p.metric));
}

function pickStyle(district, x, z, road, rng, commercialStreets) {
  if (district === 'neischmelz') return 'neischmelz';
  if (district === 'usines') return 'usines';
  if (district === 'budersberg') return 'budersberg';
  if (district === 'burange') return rng() < 0.12 ? 'centre' : 'burange';
  if (district === 'italien') return rng() < 0.82 ? 'italien' : 'centre';
  if (district === 'centre') return rng() < 0.86 ? 'centre' : 'italien';
  if (commercialStreets.has(road.id)) return rng() < 0.5 ? 'centre' : 'italien';
  return 'outskirts';
}

function polygonCentre(poly) {
  let x = 0, z = 0;
  for (const p of poly) { x += p.x; z += p.z; }
  return { x: x / poly.length, z: z / poly.length };
}

function distanceAlong(points, x, z) {
  let acc = 0, best = { d: Infinity, along: 0 };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (len * len || 1), 0, 1);
    const px = a.x + dx * t, pz = a.z + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, along: acc + len * t };
    acc += len;
  }
  return best.along;
}

function obbOverlap(a, b, margin = 0) {
  const cornersA = obbCornersLocal(a, margin);
  const cornersB = obbCornersLocal(b, margin);
  for (const c of cornersA) if (obbContains(b, c.x, c.z, 0)) return true;
  for (const c of cornersB) if (obbContains(a, c.x, c.z, 0)) return true;
  return false;
}

function obbCornersLocal(obb, margin) {
  const c = Math.cos(obb.rot), s = Math.sin(obb.rot);
  return [
    [-obb.hw - margin, -obb.hd - margin], [obb.hw + margin, -obb.hd - margin],
    [obb.hw + margin, obb.hd + margin], [-obb.hw - margin, obb.hd + margin]
  ].map(([lx, lz]) => ({ x: obb.x + lx * c + lz * s, z: obb.z - lx * s + lz * c }));
}

/**
 * Underpasses and tunnels.
 *  - road underpasses beneath the railway embankment (real infrastructure type)
 *  - one longer road tunnel through the Budersberg ridge (model)
 */
function buildTunnels(railPts, roads) {
  const tunnels = [];
  // rail crossings: sample the rail and find roads that run close & cross
  const candidates = [
    { name: 'Passage souterrain — Gare de Dudelange-Centre', station: 'centre', len: 34 },
    { name: 'Passage souterrain — Gare de Dudelange-Ville', station: 'ville', len: 30 },
    { name: 'Passage souterrain — Gare de Dudelange-Usines', station: 'usines', len: 30 }
  ];
  const railLength = polylineLength(railPts);
  for (const c of candidates) {
    const st = RAIL.stations.find((s) => s.id === c.station);
    const p = project(st.lat, st.lon);
    const near = closestOnPolyline(railPts, p.x, p.z);
    const along = distanceAlong(railPts, near.x, near.z);
    const at = polylineAt(resamplePolyline(railPts, 6), (along + 92) % railLength);
    tunnels.push({
      id: `railpass_${c.station}`,
      name: c.name,
      kind: 'underpass',
      x: at.x, z: at.z,
      rot: at.angle + Math.PI / 2,
      length: c.len, width: 7.5, height: 3.4,
      y: terrainHeight(at.x, at.z),
      src: 'model'
    });
  }
  // Budersberg tunnel on the Kayl road
  const kayl = roads.find((r) => r.id === 'rue_kayl');
  if (kayl) {
    const at = polylineAt(kayl.samples, kayl.length * 0.62);
    tunnels.push({
      id: 'tunnel_budersberg',
      name: 'Tunnel de Budersberg',
      kind: 'tunnel',
      x: at.x, z: at.z,
      rot: at.angle,
      length: 260, width: 9, height: 6.4,
      y: terrainHeight(at.x, at.z),
      src: 'model'
    });
  }
  return tunnels;
}

/** Uniform grid for cheap neighbourhood queries (buildings, props, trees). */
export class SpatialGrid {
  constructor(cell) {
    this.cell = cell;
    this.map = new Map();
  }
  key(ix, iz) { return `${ix},${iz}`; }
  insert(x, z, value) {
    const ix = Math.floor(x / this.cell), iz = Math.floor(z / this.cell);
    const k = this.key(ix, iz);
    let arr = this.map.get(k);
    if (!arr) this.map.set(k, (arr = []));
    arr.push(value);
  }
  query(x, z, radius) {
    const out = [];
    const r = Math.ceil(radius / this.cell);
    const ix = Math.floor(x / this.cell), iz = Math.floor(z / this.cell);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const arr = this.map.get(this.key(ix + dx, iz + dz));
        if (arr) out.push(...arr);
      }
    }
    return out;
  }
}

/** Collision helper used by the player controller (pure, also unit-tested). */
export function resolveCollisions(world, x, z, radius = 0.42) {
  let px = x, pz = z;
  const nearby = world.colliderGrid ? world.colliderGrid.query(px, pz, 26) : world.colliders;
  for (let iter = 0; iter < 3; iter++) {
    let hit = false;
    for (const c of nearby) {
      if (Math.abs(c.x - px) > 60 + c.hw || Math.abs(c.z - pz) > 60 + c.hd) continue;
      if (circleHitsBox(px, pz, radius, c)) {
        // push out along the smallest penetration axis in box space
        const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
        const dx = px - c.x, dz = pz - c.z;
        const lx = dx * cos - dz * sin;
        const lz = dx * sin + dz * cos;
        const ox = c.hw + radius - Math.abs(lx);
        const oz = c.hd + radius - Math.abs(lz);
        let nlx = lx, nlz = lz;
        if (ox < oz) nlx = Math.sign(lx || 1) * (c.hw + radius);
        else nlz = Math.sign(lz || 1) * (c.hd + radius);
        const c2 = Math.cos(c.rot), s2 = Math.sin(c.rot);
        px = c.x + nlx * c2 + nlz * s2;
        pz = c.z - nlx * s2 + nlz * c2;
        hit = true;
      }
    }
    if (!hit) break;
  }
  return { x: px, z: pz };
}
