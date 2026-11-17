/**
 * Deterministic town generator.
 *
 * Pure JS (no three.js, no DOM) so that the multi-agent pipeline can build and
 * validate exactly the world the browser renders. Given the same seed this
 * always produces byte-identical output.
 */
import {
  project, unproject, resamplePolyline, polylineLength, polylineAt,
  closestOnPolyline, pointInPolygon, mulberry32, hash2, clamp, lerp, randRange,
  pick, obbContains, circleHitsBox
} from './geo.js';
import { META, ROADS, RAIL, LANDMARKS, DISTRICTS } from './town-data.js';
import { buildHeightField, ground } from './heightfield.js';
import { createRoadIndex, generateInfillStreets, urbanWeight } from './fabric.js';
import {
  ROAD_WIDTH, SIDEWALK, PROTECTED, GENERATED_NAMES,
  FORESTS, TRAIL_ANCHORS, COMMERCIAL_STREETS, TOWN_CENTRE
} from './world/style.js';
import { raiseFrontage } from './world/buildings.js';

function metricPolygon(poly) {
  return poly.map(([lat, lon]) => project(lat, lon));
}

function roadTouchesProtected(x, z, margin = 0) {
  for (const p of PROTECTED) {
    if (pointInPolygon(x, z, p.metric)) return p.id;
  }
  return null;
}

function districtAt(x, z, districtsMetric) {
  for (const d of districtsMetric) if (pointInPolygon(x, z, d.poly)) return d.id;
  return 'outskirts';
}

/** Public: build the complete world description. */
export function buildWorld({ seed = 20261112 } = {}) {
  const rng = mulberry32(seed);
  // Bake the ground first: every placement below asks the same lattice the
  // renderer will draw, so nothing floats and nothing sinks.
  buildHeightField(META.bbox);
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
  // The side streets are grown from the real ones (see core/fabric.js): the
  // town's grain comes out of the traced streets, not out of a lattice.
  const railPts = RAIL.points.map(([lat, lon]) => project(lat, lon));
  const roadIndex = createRoadIndex(roads);
  let bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const r of roads) {
    for (const p of r.points) {
      bounds.minX = Math.min(bounds.minX, p.x); bounds.maxX = Math.max(bounds.maxX, p.x);
      bounds.minZ = Math.min(bounds.minZ, p.z); bounds.maxZ = Math.max(bounds.maxZ, p.z);
    }
  }
  const fabricCtx = {
    roadIndex,
    roads,
    bounds: { minX: bounds.minX - 120, maxX: bounds.maxX + 120, minZ: bounds.minZ - 120, maxZ: bounds.maxZ + 120 },
    quarterAt: (x, z) => districtAt(x, z, districtsMetric),
    blocked: (x, z) => protectedZone(x, z) || closestOnPolyline(railPts, x, z).dist < 16,
    // Lanes are cut where the hillside is too steep to build a street on: the
    // real town keeps its side streets on the valley floor and the terraces.
    crossSlope: (x, z) => {
      const gx = (ground(x + 7, z) - ground(x - 7, z)) / 14;
      const gz = (ground(x, z + 7) - ground(x, z - 7)) / 14;
      return Math.hypot(gx, gz);
    }
  };
  const generated = generateInfillStreets(
    fabricCtx, rng, (i) => GENERATED_NAMES[i % GENERATED_NAMES.length]
  );
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
  const railSamples = resamplePolyline(railPts, 6);
  const railLength = polylineLength(railPts);
  const stations = RAIL.stations.map((s) => {
    const p = project(s.lat, s.lon);
    const near = closestOnPolyline(railPts, p.x, p.z);
    const d = distanceAlong(railPts, near.x, near.z);
    return { ...s, x: p.x, z: p.z, railDist: d, elevation: ground(p.x, p.z) };
  });
  // tune station chainage so the train always stops in order
  stations.sort((a, b) => a.railDist - b.railDist);
  for (let i = 0; i < stations.length; i++) {
    stations[i].platformY = stations[i].elevation + 2.6;
  }

  // Every station gets an approach: a short residential street from the
  // forecourt to the nearest real street. The traced streets leave Burange
  // station 60+ m out in the fields, and a station you cannot walk to is not
  // a station.
  for (const st of stations) {
    let best = null;
    for (const r of roads) {
      if (r.id.startsWith('station_access_')) continue;
      for (const sp of r.samples) {
        const d = Math.hypot(sp.x - st.x, sp.z - st.z);
        if (d > 20 && (!best || d < best.d)) best = { d, x: sp.x, z: sp.z, road: r.id };
      }
    }
    if (!best || best.d < 42) continue;
    const points = [{ x: st.x, z: st.z }, { x: best.x, z: best.z }];
    const samples = resamplePolyline(points, 8);
    const access = {
      id: `station_access_${st.id}`, name: `Accès ${st.name}`,
      cls: 'residential', src: 'model', points, samples,
      width: ROAD_WIDTH.residential, sidewalk: SIDEWALK.residential,
      length: polylineLength(points), lanes: 2
    };
    roads.push(access);
    for (const sp of samples) roadGrid.insert(sp.x, sp.z, { x: sp.x, z: sp.z, w: access.width, id: access.id });
  }

  // ---------------------------------------------------------------- landmarks
  const landmarks = LANDMARKS.map((l) => {
    const p = project(l.lat, l.lon);
    return {
      ...l, x: p.x, z: p.z,
      baseY: ground(p.x, p.z),
      district: districtAt(p.x, p.z, districtsMetric)
    };
  });
  const landmarkAt = (x, z, pad = 0) => landmarks.find((l) => {
    const hw = l.size.w / 2 + pad, hd = l.size.d / 2 + pad;
    return Math.abs(x - l.x) <= hw && Math.abs(z - l.z) <= hd;
  });

  // ---------------------------------------------------------------- buildings
  const railDistance = (x, z) => closestOnPolyline(railPts, x, z).dist;
  const buildings = [];
  const buildingGrid = new SpatialGrid(28);
  const colliders = [];
  let colliderGrid = new SpatialGrid(40);

  /**
   * Levelling that cannot float.
   *
   * Every caller used to invent its own base height — the lot generator took the
   * lowest corner, the Nei Schmelz blocks took the centre — and the centre-based
   * ones hung in the air wherever the plot sloped. The height is therefore
   * derived here, from the four corners, for every building that enters the
   * world, whatever path it came from.
   */
  const levelPlot = (b) => {
    const cos = Math.cos(b.rot), sin = Math.sin(b.rot);
    let lowest = Infinity;
    for (const [lx, lz] of [[-b.w / 2, -b.d / 2], [b.w / 2, -b.d / 2], [-b.w / 2, b.d / 2], [b.w / 2, b.d / 2]]) {
      lowest = Math.min(lowest, ground(b.x + lx * cos + lz * sin, b.z - lx * sin + lz * cos));
    }
    b.baseY = Math.min(b.baseY ?? Infinity, lowest) - 0.4;
    return b;
  };

  const addBuilding = (b) => {
    if (b.w < 4 || b.d < 4) return false;
    levelPlot(b);
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

  let uid = 0;
  const nextId = () => `b${uid++}`;
  const built = raiseFrontage({
    rng, roads, districtsMetric, districtAt, protectedZone, urbanWeight, fabricCtx,
    commercialStreets: COMMERCIAL_STREETS, landmarkAt, nearRoad, railDistance, stations, townCentre: TOWN_CENTRE,
    addBuilding, nextId
  });
  uid = built.uid;

  // ---------------------------------------------------------- forest trails
  // Footpaths that make the woods properly walkable: each one leaves the nearest
  // street, passes a viewpoint or landmark, and carries on into the trees.
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
  for (const spec of TRAIL_ANCHORS) {
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
    const tree = { x, z, y: ground(x, z), scale, kind, rot: rng() * Math.PI * 2, variant: Math.floor(rng() * 3) };
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
      undergrowth.push({ x, z, y: ground(x, z), scale: randRange(rng, 0.7, 1.5), rot: rng() * Math.PI * 2, kind: rng() < 0.7 ? 'fern' : 'bush' });
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
      props.push({ type: 'lamp', x, z, rot: at.angle, y: ground(x, z) });
      if (rng() < 0.22) {
        props.push({ type: 'bench', x: x + Math.cos(at.angle) * side * 1.6, z: z - Math.sin(at.angle) * side * 1.6, rot: at.angle + Math.PI, y: ground(x, z) });
      }
      if (rng() < 0.12) {
        props.push({ type: 'bin', x: x + Math.cos(at.angle) * side * 1.1, z: z - Math.sin(at.angle) * side * 1.1, rot: at.angle, y: ground(x, z) });
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
      y: ground(x, z), district: districtAt(x, z, districtsMetric), parked: true
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
    props.push({ type: 'bus_stop', x: s.x + 18, z: s.z + 12, rot: 0.2, y: ground(s.x + 18, s.z + 12) });
  }
  for (const l of landmarks) {
    if (l.kind === 'supermarket' || l.kind === 'restaurant') {
      props.push({ type: 'terrace', x: l.x + Math.cos(l.rotation || 0) * (l.size.d / 2 + 3), z: l.z - Math.sin(l.rotation || 0) * (l.size.d / 2 + 3), rot: l.rotation || 0, y: ground(l.x, l.z), w: Math.min(16, l.size.w * 0.6) });
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
      x: door.x, z: door.z, rot: door.rot, y: ground(door.x, door.z) + 1.5,
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
  const spawn = { x: spawnPoint.x, z: spawnPoint.z, y: ground(spawnPoint.x, spawnPoint.z), rot: Math.PI * 0.85 };

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
      y: ground(at.x, at.z),
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
      y: ground(at.x, at.z),
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
