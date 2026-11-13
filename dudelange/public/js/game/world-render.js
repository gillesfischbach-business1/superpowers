/**
 * Turns the pure world description into a three.js scene.
 * Everything is instanced where possible so a 4 km² town stays at ~60 fps.
 */
import * as THREE from 'three';
import { TEX } from './textures.js';
import { polylineAt, resamplePolyline, project, clamp, lerp } from '../core/geo.js';
import { ground, heightField } from '../core/heightfield.js';
import { INTERIORS } from '../core/interiors.js';

const V3 = THREE.Vector3;
const dummy = new THREE.Object3D();
const color = new THREE.Color();

export function createTown(world, { quality = 'high' } = {}) {
  const town = new THREE.Group();
  town.name = 'Dudelange';
  const doors = [];
  const interactables = [];
  const lampPools = [];
  const litWindows = [];
  const darkWindows = [];

  // Textured materials carry a flat stand-in colour so the off-screen preview
  // renderer (scripts/preview-render.mjs) can draw a readable picture of the
  // geometry without a GPU or a canvas.
  const preview = (mat, color) => { mat.userData.preview = color; return mat; };
  const M = {
    asphalt: preview(new THREE.MeshStandardMaterial({ map: TEX.asphalt(), color: 0xb8b8b8, roughness: 0.95 }), '#3b3f43'),
    paving: preview(new THREE.MeshStandardMaterial({ map: TEX.paving(), roughness: 0.9 }), '#a8a49b'),
    concrete: preview(new THREE.MeshStandardMaterial({ map: TEX.concrete(), roughness: 0.85 }), '#b9b6ae'),
    grass: preview(new THREE.MeshStandardMaterial({ map: TEX.grass(), vertexColors: true, roughness: 1 }), '#5c7a3f'),
    gravel: preview(new THREE.MeshStandardMaterial({ map: TEX.gravel(), roughness: 1 }), '#8a7f6b'),
    ballast: preview(new THREE.MeshStandardMaterial({ map: TEX.ballast(), roughness: 1 }), '#6f6a63'),
    steel: new THREE.MeshStandardMaterial({ color: 0x7e6a56, roughness: 0.6, metalness: 0.6 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x8a4b32, roughness: 0.85, metalness: 0.3 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2c2f31, roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fc4d4, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.75 }),
    wood: preview(new THREE.MeshStandardMaterial({ map: TEX.door(), roughness: 0.8 }), '#6b4a2f'),
    brick: preview(new THREE.MeshStandardMaterial({ map: TEX.brick(), roughness: 0.95 }), '#8c4a3a'),
    plaster: preview(new THREE.MeshStandardMaterial({ map: TEX.plaster(), roughness: 0.95 }), '#d8cfbc'),
    slate: preview(new THREE.MeshStandardMaterial({ map: TEX.slate(), roughness: 0.9 }), '#4a4a4e'),
    water: new THREE.MeshStandardMaterial({ map: TEX.water(), transparent: true, opacity: 0.86, roughness: 0.15, metalness: 0.35, color: 0x9fc6cf }),
    marked: new THREE.MeshStandardMaterial({ color: 0xf3f0e3, roughness: 0.75 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffdd88, emissiveIntensity: 0.2, roughness: 0.4 }),
    trafficRed: new THREE.MeshStandardMaterial({ color: 0x5b1a1a, emissive: 0x330000 }),
    foliage: new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 1, flatShading: true }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 1 })
  };

  // ------------------------------------------------------------------ terrain
  // The mesh is built from the baked height field — the exact lattice that
  // ground() interpolates — so streets, kerbs and foundations can never be
  // swallowed by the grass.
  const field = heightField();
  if (!field) throw new Error('height field missing: build the world before the town');
  const geo = terrainGeometry(field);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = pos.getY(i);
    const slope = Math.abs(ground(x + 3, z) - ground(x - 3, z)) +
      Math.abs(ground(x, z + 3) - ground(x, z - 3));
    const n = Math.sin(x * 0.013) * Math.cos(z * 0.011) * 0.5 + 0.5;
    let r = 0.42 + n * 0.09, g = 0.55 + n * 0.13, b = 0.28 + n * 0.07;
    if (slope > 2.4) { r = 0.44; g = 0.41; b = 0.35; }
    if (h > 360) { r += 0.03; g -= 0.02; b -= 0.02; }
    colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, M.grass);
  terrain.receiveShadow = true;
  terrain.name = 'terrain';
  town.add(terrain);

  // far ground so the map never visibly ends
  const far = new THREE.Mesh(
    new THREE.CircleGeometry(9000, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x5e7a45, roughness: 1 })
  );
  let lowest = Infinity;
  for (let i = 0; i < field.heights.length; i++) if (field.heights[i] < lowest) lowest = field.heights[i];
  far.position.set(field.x0 + field.width / 2, lowest - 6, field.z0 + field.depth / 2);
  far.receiveShadow = true;
  town.add(far);

  // ------------------------------------------------------------------- roads
  const roadGroup = new THREE.Group();
  const markings = [];
  const curbGroup = new THREE.Group();
  for (const road of world.roads) {
    if (!road.samples || road.samples.length < 2) continue;
    const ribbon = buildRibbon(road.samples, road.width, 0.22, road.cls === 'foot' ? 0.1 : 0);
    if (!ribbon) continue;
    const mesh = new THREE.Mesh(ribbon, road.cls === 'foot' ? M.paving : M.asphalt);
    mesh.receiveShadow = true;
    mesh.name = `road:${road.name}`;
    roadGroup.add(mesh);

    if (road.sidewalk > 0) {
      for (const side of [-1, 1]) {
        const curb = buildRibbonOffset(road.samples, road.width / 2 + road.sidewalk / 2, road.sidewalk, 0.34, side);
        if (curb) {
          const cm = new THREE.Mesh(curb, M.paving);
          cm.receiveShadow = true;
          curbGroup.add(cm);
        }
        const edge = buildRibbonOffset(road.samples, road.width / 2 + 0.02, 0.16, 0.26, side);
        if (edge) curbGroup.add(new THREE.Mesh(edge, M.white));
      }
    }
    if (road.cls === 'primary' || road.cls === 'secondary') {
      for (let d = 4; d < road.length - 4; d += 7.5) {
        const at = polylineAt(road.samples, d);
        markings.push({ x: at.x, z: at.z, rot: at.angle, len: 3.2, wid: 0.16, y: ground(at.x, at.z) + 0.26 });
      }
    }
    if (road.cls === 'motorway') {
      for (const laneOff of [-4.8, 0, 4.8]) {
        for (let d = 4; d < road.length - 4; d += 9) {
          const at = polylineAt(road.samples, d);
          markings.push({
            x: at.x + Math.cos(at.angle) * laneOff, z: at.z - Math.sin(at.angle) * laneOff,
            rot: at.angle, len: 4, wid: 0.18, y: ground(at.x, at.z) + 0.26
          });
        }
      }
    }
  }
  town.add(roadGroup, curbGroup);

  // ------------------------------------------------------- squares & forecourts
  // Every landmark used to sit straight on the grass, and the player spawned on
  // a lawn in the middle of town. A paved apron (and a proper square at the
  // spawn) is the difference between "a model of a town" and a town.
  const pavingSpots = [];
  for (const l of world.landmarks) {
    if (l.kind === 'park' || l.kind === 'nature' || l.kind === 'water') continue;
    pavingSpots.push({ x: l.x, z: l.z, w: l.size.w + 11, d: l.size.d + 11, rot: l.rotation || 0 });
  }
  pavingSpots.push({ x: world.spawn.x, z: world.spawn.z, w: 42, d: 34, rot: 0 });
  const pavingGroup = new THREE.Group();
  for (const spot of pavingSpots) {
    const patch = buildGroundPatch(spot.x, spot.z, spot.w, spot.d, spot.rot, 0.12);
    if (!patch) continue;
    const mesh = new THREE.Mesh(patch, M.paving);
    mesh.receiveShadow = true;
    mesh.name = 'paving';
    pavingGroup.add(mesh);
  }
  town.add(pavingGroup);
  const markMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), M.marked, markings.length);
  markMesh.frustumCulled = false;
  markings.forEach((m, i) => {
    dummy.position.set(m.x, m.y, m.z);
    dummy.rotation.set(-Math.PI / 2, 0, -m.rot);
    dummy.scale.set(m.wid, m.len, 1);
    dummy.updateMatrix();
    markMesh.setMatrixAt(i, dummy.matrix);
  });
  markMesh.receiveShadow = false;
  town.add(markMesh);

  // -------------------------------------------------------------------- rail
  const rail = buildRail(world, M, interactables);
  town.add(rail.group);

  // --------------------------------------------------------------- buildings
  const buildings = buildBuildings(world, M, litWindows, darkWindows);
  town.add(buildings.group);
  town.add(buildings.windowGroup);

  // ------------------------------------------------------------------- trees
  town.add(buildTrees(world, M));

  // ------------------------------------------------------------------- props
  const props = buildProps(world, M, lampPools);
  town.add(props.group);

  // ------------------------------------------------------------------- water
  town.add(buildWater(world, M));

  // --------------------------------------------------------------- landmarks,
  const landmarks = buildLandmarks(world, M, doors, interactables, lampPools);
  town.add(landmarks.group);

  // ----------------------------------------------------------------- tunnels
  town.add(buildTunnels(world, M, lampPools));

  // -------------------------------------------------------------- streetlamps
  const poolTex = makeGlowTexture();
  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTex, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, color: 0xffd9a0
  });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), poolMat, Math.max(1, lampPools.length));
  pools.frustumCulled = false;
  lampPools.forEach((p, i) => {
    dummy.position.set(p.x, ground(p.x, p.z) + 0.24, p.z);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.scale.set(13, 13, 1);
    dummy.updateMatrix();
    pools.setMatrixAt(i, dummy.matrix);
  });
  pools.count = lampPools.length;
  town.add(pools);

  // ------------------------------------------------------------------- sky
  const sky = buildSky();
  town.add(sky.group);

  // ------------------------------------------------------------ parked cars?
  const carSpawns = world.roads
    .filter((r) => r.cls === 'primary' || r.cls === 'secondary')
    .slice(0, 14)
    .map((r, i) => {
      const at = polylineAt(r.samples, (r.length * (0.2 + 0.05 * i)) % r.length);
      return { x: at.x, z: at.z, rot: at.angle, road: r.id, length: r.length, roadRef: r };
    });

  const state = {
    night: 0,
    weather: 'clear'
  };

  return {
    group: town,
    doors,
    interactables,
    carSpawns,
    sky,
    lampPools,
    pools,
    setNight(n) {
      state.night = n;
      M.lamp.emissiveIntensity = 0.15 + n * 2.6;
      poolMat.opacity = Math.max(0, n - 0.12) * 0.55;
      pools.visible = n > 0.14;
      for (const w of litWindows) w.visible = n > 0.32;
      for (const w of darkWindows) w.visible = n <= 0.55;
      rail.setNight(n);
      sky.setNight(n);
    },
    setWeather(kind) {
      state.weather = kind;
      M.asphalt.color.set(kind === 'rain' ? 0x8f9296 : 0xb8b8b8);
      M.asphalt.roughness = kind === 'rain' ? 0.55 : 0.95;
      sky.setWeather(kind);
    },
    update(t, dt, playerPos) {
      rail.update(t, dt);
    }
  };
}

/* ------------------------------------------------------------------ helpers */

/**
 * Triangles exactly as ground() interpolates them: cell (i,j) splits into
 * (a, c, b) and (b, c, d) — both wound counter-clockwise seen from above.
 */
function terrainGeometry(field) {
  const { cols, rows, step, x0, z0, heights } = field;
  const w = cols + 1;
  const positions = new Float32Array(w * (rows + 1) * 3);
  const uvs = new Float32Array(w * (rows + 1) * 2);
  let k = 0, u = 0;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      positions[k++] = x;
      positions[k++] = heights[j * w + i];
      positions[k++] = z;
      uvs[u++] = x / 14;
      uvs[u++] = z / 14;
    }
  }
  const idx = new Uint32Array(cols * rows * 6);
  let t = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * w + i, b = a + 1, c = (j + 1) * w + i, d = c + 1;
      idx[t++] = a; idx[t++] = c; idx[t++] = b;
      idx[t++] = b; idx[t++] = c; idx[t++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/**
 * A rectangular patch of ground that follows the terrain, cell by cell.
 * Used for squares and building forecourts, which must not float off a slope.
 */
function buildGroundPatch(cx, cz, w, d, rot, lift) {
  const nx = Math.max(2, Math.min(16, Math.round(w / 3)));
  const nz = Math.max(2, Math.min(16, Math.round(d / 3)));
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const verts = [], uvs = [], idx = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const lx = (i / nx - 0.5) * w;
      const lz = (j / nz - 0.5) * d;
      const x = cx + lx * cos + lz * sin;
      const z = cz - lx * sin + lz * cos;
      verts.push(x, ground(x, z) + lift, z);
      uvs.push((i / nx) * (w / 8), (j / nz) * (d / 8));
    }
  }
  const stride = nx + 1;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * stride + i, b = a + 1, c = (j + 1) * stride + i, dd = c + 1;
      idx.push(a, c, b, b, c, dd);
    }
  }
  if (!verts.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildRibbon(points, width, lift, extraLift = 0) {
  if (points.length < 2) return null;
  const verts = [], uvs = [], idx = [];
  let distance = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x, dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dz / len, nz = -dx / len;
    if (i > 0) distance += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
    const h1 = ground(p.x + nx * width / 2, p.z + nz * width / 2);
    const h2 = ground(p.x - nx * width / 2, p.z - nz * width / 2);
    const y = Math.max(h1, h2, ground(p.x, p.z)) + lift + extraLift;
    verts.push(p.x + nx * width / 2, y, p.z + nz * width / 2);
    verts.push(p.x - nx * width / 2, y, p.z - nz * width / 2);
    uvs.push(0, distance / 12, 1, distance / 12);
    if (i < points.length - 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildRibbonOffset(points, offset, width, lift, side) {
  if (points.length < 2) return null;
  const verts = [], uvs = [], idx = [];
  let distance = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x, dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (dz / len) * side, nz = (-dx / len) * side;
    if (i > 0) distance += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
    const cx = p.x + nx * offset, cz = p.z + nz * offset;
    const y = ground(cx, cz) + lift;
    verts.push(cx + nx * width / 2, y, cz + nz * width / 2);
    verts.push(cx - nx * width / 2, y, cz - nz * width / 2);
    uvs.push(0, distance / 6, 1, distance / 6);
    if (i < points.length - 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function gableGeometry() {
  const p = [
    // left slope
    -0.5, 0, -0.5, 0, 1, -0.5, 0, 1, 0.5,
    -0.5, 0, -0.5, 0, 1, 0.5, -0.5, 0, 0.5,
    // right slope
    0.5, 0, -0.5, 0.5, 0, 0.5, 0, 1, 0.5,
    0.5, 0, -0.5, 0, 1, 0.5, 0, 1, -0.5,
    // gable end -z
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5,
    // gable end +z
    -0.5, 0, 0.5, 0, 1, 0.5, 0.5, 0, 0.5
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

function buildBuildings(world, M, litWindows, darkWindows) {
  const group = new THREE.Group();
  const windowGroup = new THREE.Group();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = gableGeometry();
  const flatGeo = new THREE.BoxGeometry(1, 1, 1);

  const groups = { plaster: [], brick: [], concrete: [] };
  for (const b of world.buildings) {
    const kind = b.style === 'italien' ? 'brick' : (b.style === 'neischmelz' || b.style === 'usines') ? 'concrete' : 'plaster';
    groups[kind].push(b);
  }

  const makeBodies = (list, mat) => {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(boxGeo, mat, list.length);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    list.forEach((b, i) => {
      dummy.position.set(b.x, b.baseY + b.h / 2, b.z);
      dummy.rotation.set(0, b.rot, 0);
      dummy.scale.set(b.d, b.h, b.w);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.set(b.wall);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    return mesh;
  };
  makeBodies(groups.plaster, M.plaster);
  makeBodies(groups.brick, M.brick);
  makeBodies(groups.concrete, M.concrete);

  // A stone plinth under every house. Lots are levelled to their lowest corner,
  // so on any slope the uphill side is buried and the downhill side would hang
  // in the air. The skirt reaches below the ground on every corner, which is
  // what a real foundation does — and it reads as a proper basement wall.
  const skirt = new THREE.InstancedMesh(boxGeo, M.concrete, world.buildings.length);
  skirt.frustumCulled = false;
  skirt.receiveShadow = true;
  world.buildings.forEach((b, i) => {
    const cos = Math.cos(b.rot), sin = Math.sin(b.rot);
    let lo = Infinity, hi = -Infinity;
    for (const [lx, lz] of [[-b.w / 2, -b.d / 2], [b.w / 2, -b.d / 2], [-b.w / 2, b.d / 2], [b.w / 2, b.d / 2]]) {
      const h = ground(b.x + lx * cos + lz * sin, b.z - lx * sin + lz * cos);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
    const depth = (hi - b.baseY) + 1.4;
    dummy.position.set(b.x, b.baseY + 0.06 - depth / 2, b.z);
    dummy.rotation.set(0, b.rot, 0);
    dummy.scale.set(b.d + 0.5, depth, b.w + 0.5);
    dummy.updateMatrix();
    skirt.setMatrixAt(i, dummy.matrix);
  });
  skirt.instanceMatrix.needsUpdate = true;
  group.add(skirt);

  // front hedges: a low green band between the pavement and the house wall is
  // most of what makes a residential street read as lived-in
  const hedges = [];
  for (const b of world.buildings) {
    if (b.shop || b.h > 16) continue;
    if ((b.seed % 3) !== 0) continue;
    const side = b.side || 1;
    const cos = Math.cos(b.rot), sin = Math.sin(b.rot);
    const lx = -side * (b.d / 2 + 2.1);
    hedges.push({
      x: b.x + lx * cos,
      z: b.z - lx * sin,
      rot: b.rot,
      len: Math.max(3, b.w * 0.72),
      y: b.baseY
    });
  }
  if (hedges.length) {
    const hedgeMesh = new THREE.InstancedMesh(boxGeo, M.foliage, hedges.length);
    hedgeMesh.frustumCulled = false;
    hedgeMesh.castShadow = true;
    hedgeMesh.receiveShadow = true;
    hedges.forEach((h, i) => {
      const y = ground(h.x, h.z);
      dummy.position.set(h.x, y + 0.55, h.z);
      dummy.rotation.set(0, h.rot, 0);
      dummy.scale.set(0.55, 1.1, h.len);
      dummy.updateMatrix();
      hedgeMesh.setMatrixAt(i, dummy.matrix);
    });
    hedgeMesh.instanceMatrix.needsUpdate = true;
    group.add(hedgeMesh);
  }

  const gables = [], flats = [], chimneys = [], doors = [], shopfronts = [], awnings = [];
  const winDark = [], winLit = [];

  for (const b of world.buildings) {
    const cos = Math.cos(b.rot), sin = Math.sin(b.rot);
    const local = (lx, lz) => ({ x: b.x + lx * cos + lz * sin, z: b.z - lx * sin + lz * cos });
    const roofY = b.baseY + b.h;
    if (b.roofType === 'gable' || b.roofType === 'hip') {
      const rh = (b.d / 2) * (b.pitch || 0.6) + 1;
      gables.push({ b, y: roofY, h: rh });
    } else {
      flats.push(b);
    }
    if (b.chimney) {
      const p = local(b.d * 0.22, b.w * 0.24);
      chimneys.push({ x: p.x, z: p.z, y: roofY + (b.roofType === 'flat' ? 0.4 : (b.d / 2) * (b.pitch || 0.6) * 0.7), rot: b.rot });
    }
    // door + shopfront on the street facade
    const side = b.side || 1;
    const frontRot = b.rot - side * Math.PI / 2;
    const doorLocal = local(-side * (b.d / 2 + 0.04), (b.seed % 5 - 2) * 0.6);
    doors.push({ x: doorLocal.x, z: doorLocal.z, rot: frontRot, w: 1.15, h: 2.2, y: b.baseY + 1.1 });
    if (b.shop) {
      const sp = local(-side * (b.d / 2 + 0.05), 0);
      shopfronts.push({ x: sp.x, z: sp.z, rot: frontRot, w: Math.min(b.w - 2.4, 6.4), h: 2.4, y: b.baseY + 1.2 });
      if (b.awning) {
        awnings.push({ x: sp.x, z: sp.z, rot: frontRot, w: Math.min(b.w - 2, 6), color: b.awning, y: b.baseY + 3.0 });
      }
    }
    // windows: front & back along local z; sides along local x
    const floors = Math.max(1, b.floors);
    const floorH = b.h / floors;
    for (let f = 0; f < floors; f++) {
      const y = b.baseY + f * floorH + floorH * 0.55;
      if (f === 0 && b.shop) continue;
      const cols = Math.max(1, Math.floor(b.w / 3.4));
      for (let c = 0; c < cols; c++) {
        const lz = (c - (cols - 1) / 2) * (b.w / cols);
        for (const side of [1, -1]) {
          const p = local(side * (b.d / 2 + 0.05), lz);
          const entry = { x: p.x, z: p.z, y, rot: b.rot + (side > 0 ? Math.PI / 2 : -Math.PI / 2) };
          (b.seed % 100) / 100 + (f * 0.13 + c * 0.07) % 1 > 0.55 ? winLit.push(entry) : winDark.push(entry);
        }
      }
      const sideCols = Math.max(1, Math.floor(b.d / 4.2));
      for (let c = 0; c < sideCols; c++) {
        const lx = (c - (sideCols - 1) / 2) * (b.d / sideCols);
        for (const side of [1, -1]) {
          const p = local(lx, side * (b.w / 2 + 0.05));
          const entry = { x: p.x, z: p.z, y, rot: b.rot + (side > 0 ? 0 : Math.PI) };
          (b.seed % 97) / 97 + (f * 0.17 + c * 0.11) % 1 > 0.6 ? winLit.push(entry) : winDark.push(entry);
        }
      }
    }
  }

  const makeInstances = (geo, mat, list, transform, cast = true) => {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.frustumCulled = false;
    mesh.castShadow = cast;
    mesh.receiveShadow = cast;
    list.forEach((item, i) => {
      const t = transform(item);
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(t.rx || 0, t.rot || 0, t.rz || 0);
      dummy.scale.set(t.sx, t.sy, t.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (t.color) { mesh.setColorAt(i, color.set(t.color)); }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  };

  const roofMesh = makeInstances(roofGeo, M.slate, gables, (g) => ({
    x: g.b.x, y: g.y, z: g.b.z, rot: g.b.rot, sx: g.b.d + 0.9, sy: g.h, sz: g.b.w + 0.9,
    color: g.b.roof
  }));
  if (roofMesh) group.add(roofMesh);

  const flatMesh = makeInstances(flatGeo, M.dark, flats, (b) => ({
    x: b.x, y: b.baseY + b.h + 0.18, z: b.z, rot: b.rot, sx: b.d + 0.5, sy: 0.36, sz: b.w + 0.5
  }));
  if (flatMesh) group.add(flatMesh);

  const chimMesh = makeInstances(flatGeo, M.concrete, chimneys, (c) => ({
    x: c.x, y: c.y + 0.8, z: c.z, rot: c.rot, sx: 0.75, sy: 1.8, sz: 0.75
  }));
  if (chimMesh) group.add(chimMesh);

  const doorMesh = makeInstances(new THREE.PlaneGeometry(1, 1), M.wood, doors, (d) => ({
    x: d.x, y: d.y, z: d.z, rot: d.rot, sx: d.w, sy: d.h, sz: 1
  }), false);
  if (doorMesh) group.add(doorMesh);

  const shopMat = new THREE.MeshStandardMaterial({ map: TEX.shopfront(), roughness: 0.4, metalness: 0.1 });
  const shopMesh = makeInstances(new THREE.PlaneGeometry(1, 1), shopMat, shopfronts, (s) => ({
    x: s.x, y: s.y, z: s.z, rot: s.rot, sx: s.w, sy: s.h, sz: 1
  }), false);
  if (shopMesh) group.add(shopMesh);

  const awnMesh = makeInstances(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), awnings, (a) => ({
      x: a.x, y: a.y, z: a.z, rot: a.rot, rz: 0.18, sx: 1.2, sy: 0.12, sz: a.w, color: a.color
    }));
  if (awnMesh) group.add(awnMesh);

  const winGeo = new THREE.PlaneGeometry(1.25, 1.7);
  const winDarkMat = new THREE.MeshStandardMaterial({
    map: TEX.windowDay(), roughness: 0.25, metalness: 0.35, color: 0xcfd8dd
  });
  const winLitMat = new THREE.MeshStandardMaterial({
    map: TEX.windowLit(), emissiveMap: TEX.windowLit(), emissive: 0xffc978, emissiveIntensity: 1.2,
    roughness: 0.4, transparent: false
  });
  const toTransform = (w) => ({ x: w.x, y: w.y, z: w.z, rot: w.rot, sx: 1, sy: 1, sz: 1 });
  const dark = makeInstances(winGeo, winDarkMat, winDark, toTransform, false);
  const lit = makeInstances(winGeo, winLitMat, winLit, toTransform, false);
  if (dark) { windowGroup.add(dark); darkWindows.push(dark); }
  if (lit) { windowGroup.add(lit); litWindows.push(lit); lit.visible = false; }

  return { group, windowGroup, counts: { windows: winDark.length + winLit.length } };
}

function buildTrees(world, M) {
  const group = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 1, 5);
  const crownGeo = new THREE.IcosahedronGeometry(1, 0);
  const coneGeo = new THREE.ConeGeometry(1, 1.6, 6);
  const trunks = new THREE.InstancedMesh(trunkGeo, M.trunk, world.trees.length);
  const crowns = new THREE.InstancedMesh(crownGeo, M.foliage, world.trees.length);
  const cones = new THREE.InstancedMesh(coneGeo, M.foliage, world.trees.length);
  trunks.frustumCulled = crowns.frustumCulled = cones.frustumCulled = false;
  trunks.castShadow = crowns.castShadow = true;
  crowns.receiveShadow = true;
  let ci = 0, ni = 0;
  world.trees.forEach((t, i) => {
    const h = (t.kind === 'street' ? 5 : 7) * t.scale;
    dummy.position.set(t.x, t.y + h * 0.35, t.z);
    dummy.rotation.set(0, t.rot, 0);
    dummy.scale.set(t.scale, h * 0.7, t.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);

    const crownScale = (t.kind === 'street' ? 1.9 : 2.9) * t.scale;
    const tint = 0.82 + (t.variant * 0.08);
    if (t.variant % 2 === 0) {
      dummy.position.set(t.x, t.y + h * 0.95, t.z);
      dummy.scale.set(crownScale, crownScale * 1.05, crownScale);
      dummy.rotation.set(0, t.rot, 0);
      dummy.updateMatrix();
      crowns.setMatrixAt(ci, dummy.matrix);
      crowns.setColorAt(ci, color.setRGB(0.26 * tint, 0.44 * tint, 0.2 * tint));
      ci++;
    } else {
      dummy.position.set(t.x, t.y + h * 0.82, t.z);
      dummy.scale.set(crownScale * 0.8, crownScale * 2.1, crownScale * 0.8);
      dummy.rotation.set(0, t.rot, 0);
      dummy.updateMatrix();
      cones.setMatrixAt(ni, dummy.matrix);
      cones.setColorAt(ni, color.setRGB(0.2 * tint, 0.37 * tint, 0.19 * tint));
      ni++;
    }
  });
  crowns.count = ci; cones.count = ni;
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  cones.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  if (cones.instanceColor) cones.instanceColor.needsUpdate = true;
  group.add(trunks, crowns, cones);
  return group;
}

function buildProps(world, M, lampPools) {
  const group = new THREE.Group();
  const lamps = world.props.filter((p) => p.type === 'lamp');
  const benches = world.props.filter((p) => p.type === 'bench');
  const bins = world.props.filter((p) => p.type === 'bin');
  const buses = world.props.filter((p) => p.type === 'bus_stop');
  const terraces = world.props.filter((p) => p.type === 'terrace');

  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6);
  const poleMesh = new THREE.InstancedMesh(poleGeo, M.dark, lamps.length);
  const headGeo = new THREE.BoxGeometry(0.7, 0.22, 0.4);
  const headMesh = new THREE.InstancedMesh(headGeo, M.lamp, lamps.length);
  poleMesh.frustumCulled = headMesh.frustumCulled = false;
  lamps.forEach((l, i) => {
    dummy.position.set(l.x, l.y + 2.7, l.z);
    dummy.rotation.set(0, l.rot, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poleMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(l.x + Math.cos(l.rot) * 0.45, l.y + 5.4, l.z - Math.sin(l.rot) * 0.45);
    dummy.rotation.set(0, l.rot, 0);
    dummy.updateMatrix();
    headMesh.setMatrixAt(i, dummy.matrix);
    lampPools.push({ x: l.x, z: l.z });
  });
  poleMesh.castShadow = true;
  group.add(poleMesh, headMesh);

  const benchSeat = new THREE.BoxGeometry(1.8, 0.12, 0.55);
  const benchLeg = new THREE.BoxGeometry(0.1, 0.45, 0.5);
  const benchMesh = new THREE.InstancedMesh(benchSeat, M.wood, benches.length);
  const benchLegs = new THREE.InstancedMesh(benchLeg, M.dark, benches.length * 2);
  benchMesh.frustumCulled = benchLegs.frustumCulled = false;
  benches.forEach((b, i) => {
    dummy.position.set(b.x, b.y + 0.48, b.z);
    dummy.rotation.set(0, b.rot, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    benchMesh.setMatrixAt(i, dummy.matrix);
    for (let s = 0; s < 2; s++) {
      const off = (s ? 0.7 : -0.7);
      dummy.position.set(b.x + Math.cos(b.rot) * off, b.y + 0.24, b.z - Math.sin(b.rot) * off);
      dummy.updateMatrix();
      benchLegs.setMatrixAt(i * 2 + s, dummy.matrix);
    }
  });
  group.add(benchMesh, benchLegs);

  const binMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.24, 0.85, 8), M.dark, bins.length);
  binMesh.frustumCulled = false;
  bins.forEach((b, i) => {
    dummy.position.set(b.x, b.y + 0.42, b.z);
    dummy.rotation.set(0, b.rot, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    binMesh.setMatrixAt(i, dummy.matrix);
  });
  group.add(binMesh);

  const shelterMat = new THREE.MeshStandardMaterial({ color: 0x2b6cb0, roughness: 0.6, metalness: 0.3, transparent: true, opacity: 0.55 });
  buses.forEach((b) => {
    const shelter = new THREE.Group();
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.14, 1.9), M.dark);
    roof.position.y = 2.6;
    const back = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 0.08), shelterMat);
    back.position.set(0, 1.3, -0.9);
    const post1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), M.dark);
    post1.position.set(-2, 1.3, 0.85);
    const post2 = post1.clone(); post2.position.x = 2;
    const sign = makeSign('RGTR', { bg: '#1d3557', size: 44 });
    sign.position.set(2.3, 2.2, 0.2);
    sign.scale.set(1.1, 0.55, 1);
    shelter.add(roof, back, post1, post2, sign);
    shelter.position.set(b.x, b.y, b.z);
    shelter.rotation.y = b.rot;
    group.add(shelter);
  });

  // forest trails — dirt ribbons you can actually follow on foot
  const trailMat = new THREE.MeshStandardMaterial({ color: 0x8a7150, roughness: 1, map: TEX.gravel() });
  for (const trail of world.forestPaths || []) {
    const geo = buildRibbon(trail.samples, 2.8, 0.19, 0.06);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, trailMat);
    mesh.receiveShadow = true;
    mesh.name = `trail:${trail.name}`;
    group.add(mesh);
    // trail head marker
    const head = trail.samples[0];
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.1, 0.14), M.wood);
    post.position.set(head.x, ground(head.x, head.z) + 1.05, head.z);
    const sign = makeSign(trail.name, { bg: '#3c2f22', fg: '#f3e7cb', size: 40 });
    sign.position.set(head.x, ground(head.x, head.z) + 2.2, head.z);
    sign.rotation.y = 0.4;
    group.add(post, sign);
  }

  // glades: a ring of stones, a log seat and a lantern
  for (const c of world.clearings || []) {
    const y = ground(c.x, c.z);
    const ring = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), M.gravel);
      stone.position.set(Math.cos(a) * 1.1, 0.16, Math.sin(a) * 1.1);
      stone.scale.set(1, 0.7, 1);
      ring.add(stone);
    }
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.6, 8), M.wood);
    log.rotation.z = Math.PI / 2;
    log.position.set(0, 0.3, 2.2);
    ring.add(log);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), M.lamp);
    lamp.position.set(0, 1.6, 0);
    const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6), M.dark);
    lampPost.position.set(0, 0.8, 0);
    ring.add(lamp, lampPost);
    ring.position.set(c.x, y, c.z);
    ring.rotation.y = (c.x % 7) * 0.4;
    group.add(ring);
    lampPools.push({ x: c.x, z: c.z });
  }

  // undergrowth: ferns and bramble, instanced
  const ferns = (world.undergrowth || []).filter((u) => u.kind === 'fern');
  const bushes = (world.undergrowth || []).filter((u) => u.kind === 'bush');
  if (ferns.length) {
    const fernGeo = new THREE.ConeGeometry(0.5, 1.05, 5, 1, true);
    const fernMat = new THREE.MeshStandardMaterial({ color: 0x466b34, roughness: 1, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(fernGeo, fernMat, ferns.length);
    mesh.frustumCulled = false;
    ferns.forEach((f, i) => {
      dummy.position.set(f.x, f.y + 0.45 * f.scale, f.z);
      dummy.rotation.set(0, f.rot, 0);
      dummy.scale.set(f.scale, f.scale, f.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    group.add(mesh);
  }
  if (bushes.length) {
    const bushGeo = new THREE.IcosahedronGeometry(0.75, 0);
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x37542b, roughness: 1, flatShading: true });
    const mesh = new THREE.InstancedMesh(bushGeo, bushMat, bushes.length);
    mesh.frustumCulled = false;
    bushes.forEach((b, i) => {
      dummy.position.set(b.x, b.y + 0.4 * b.scale, b.z);
      dummy.rotation.set(0, b.rot, 0);
      dummy.scale.set(b.scale, b.scale * 0.8, b.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    group.add(mesh);
  }

  // terraces (café tables under umbrellas)
  for (const t of terraces) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const table = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 10), M.white);
      table.position.set((i - 1) * 3.2, 0.75, 0);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.75, 6), M.dark);
      leg.position.set((i - 1) * 3.2, 0.37, 0);
      const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0xbc4749, roughness: 0.9 }));
      umbrella.position.set((i - 1) * 3.2, 2.3, 0);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 6), M.dark);
      pole.position.set((i - 1) * 3.2, 1.15, 0);
      g.add(table, leg, umbrella, pole);
    }
    g.position.set(t.x, t.y, t.z);
    g.rotation.y = t.rot;
    group.add(g);
  }

  return { group };
}

function buildWater(world, M) {
  const group = new THREE.Group();
  const streamGeo = buildRibbon(world.water.stream.points, world.water.stream.width, -0.25, 0);
  if (streamGeo) {
    const mesh = new THREE.Mesh(streamGeo, M.water);
    mesh.renderOrder = 1;
    group.add(mesh);
  }
  const pond = new THREE.Mesh(new THREE.CircleGeometry(world.water.pond.r, 26).rotateX(-Math.PI / 2), M.water);
  pond.position.set(world.water.pond.x, ground(world.water.pond.x, world.water.pond.z) - 0.35, world.water.pond.z);
  group.add(pond);
  // rocks along the stream
  const rockGeo = new THREE.DodecahedronGeometry(0.45, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, M.gravel, 140);
  rocks.frustumCulled = false;
  let ri = 0;
  const pts = resamplePolyline(world.water.stream.points, 18);
  for (const p of pts) {
    for (let s = 0; s < 3; s++) {
      dummy.position.set(p.x + (Math.random() - 0.5) * 5, ground(p.x, p.z) - 0.1, p.z + (Math.random() - 0.5) * 5);
      dummy.rotation.set(Math.random(), Math.random(), Math.random());
      dummy.scale.setScalar(0.5 + Math.random());
      dummy.updateMatrix();
      rocks.setMatrixAt(ri++, dummy.matrix);
      if (ri >= 140) break;
    }
    if (ri >= 140) break;
  }
  rocks.count = ri;
  group.add(rocks);
  return group;
}

function makeSign(text, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    map: TEX.sign(text, opts), roughness: 0.6, side: THREE.DoubleSide
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(4, 1), mat);
}

/* ------------------------------------------------------------------- rail */

function buildRail(world, M, interactables) {
  const group = new THREE.Group();
  const pts = world.rail.samples;
  const railY = (x, z) => ground(x, z) + 3.1;

  const ballast = buildRibbonElevated(pts, 5.6, (x, z) => railY(x, z) + 0.05);
  if (ballast) {
    const m = new THREE.Mesh(ballast, M.ballast);
    m.receiveShadow = true;
    group.add(m);
  }
  // embankment sides
  for (const side of [-1, 1]) {
    const slope = buildEmbankment(pts, 2.8, 6.5, side, railY);
    if (slope) {
      const m = new THREE.Mesh(slope, M.gravel);
      m.receiveShadow = true;
      group.add(m);
    }
  }
  // sleepers
  const sleeperGeo = new THREE.BoxGeometry(2.6, 0.16, 0.28);
  const sleepers = [];
  for (let d = 0; d < world.rail.length; d += 1.15) {
    const at = polylineAt(pts, d);
    sleepers.push(at);
  }
  const sleeperMesh = new THREE.InstancedMesh(sleeperGeo, M.dark, sleepers.length);
  sleeperMesh.frustumCulled = false;
  sleepers.forEach((s, i) => {
    dummy.position.set(s.x, railY(s.x, s.z) + 0.18, s.z);
    dummy.rotation.set(0, s.angle, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    sleeperMesh.setMatrixAt(i, dummy.matrix);
  });
  group.add(sleeperMesh);

  // rails
  for (const off of [-0.7175, 0.7175]) {
    const railGeo = buildOffsetRibbon(pts, off, 0.1, (x, z) => railY(x, z) + 0.3);
    if (railGeo) {
      const m = new THREE.Mesh(railGeo, M.steel);
      m.castShadow = false;
      group.add(m);
    }
  }

  // catenary
  const mastGeo = new THREE.CylinderGeometry(0.09, 0.11, 6.2, 5);
  const masts = [];
  for (let d = 20; d < world.rail.length; d += 44) {
    const at = polylineAt(pts, d);
    const side = (Math.floor(d / 44) % 2) ? 1 : -1;
    masts.push({ x: at.x + Math.cos(at.angle) * side * 3.4, z: at.z - Math.sin(at.angle) * side * 3.4, rot: at.angle, y: railY(at.x, at.z) });
  }
  const mastMesh = new THREE.InstancedMesh(mastGeo, M.dark, masts.length);
  mastMesh.frustumCulled = false;
  masts.forEach((m, i) => {
    dummy.position.set(m.x, m.y + 3.1, m.z);
    dummy.rotation.set(0, m.rot, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mastMesh.setMatrixAt(i, dummy.matrix);
  });
  group.add(mastMesh);
  // contact wire
  const wirePoints = [];
  for (let d = 0; d < world.rail.length; d += 8) {
    const at = polylineAt(pts, d);
    wirePoints.push(new THREE.Vector3(at.x, railY(at.x, at.z) + 5.4, at.z));
  }
  const wireGeo = new THREE.BufferGeometry().setFromPoints(wirePoints);
  group.add(new THREE.Line(wireGeo, new THREE.LineBasicMaterial({ color: 0x2a2a2a })));

  // stations
  const stationObjects = [];
  for (const st of world.rail.stations) {
    const at = polylineAt(pts, st.railDist);
    const cos = Math.cos(at.angle), sin = Math.sin(at.angle);
    const platformY = railY(st.x, st.z) + 0.55;
    const SPAN = 132;
    // The line runs on a 3 m embankment, so a platform is a retaining wall, not
    // a slab in mid-air. Find the lowest ground along the platform and carry the
    // wall down past it.
    let lowest = Infinity;
    for (let d = -SPAN / 2; d <= SPAN / 2; d += 8) {
      const at = polylineAt(pts, clamp(st.railDist + d, 0, world.rail.length));
      lowest = Math.min(lowest, ground(at.x, at.z));
    }
    const baseBottom = lowest - 1.2;
    const baseHeight = Math.max(1.2, platformY - baseBottom);
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
      const plat = new THREE.Mesh(new THREE.BoxGeometry(4.2, baseHeight, SPAN), M.concrete);
      plat.position.set(side * 4.2, baseBottom + baseHeight / 2, 0);
      plat.castShadow = true;
      plat.receiveShadow = true;
      g.add(plat);
      // a stair down to the street on the town side
      const stair = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.28, 3.2), M.paving);
      stair.position.set(side * 4.2, baseBottom + baseHeight - 1.6, 30);
      stair.rotation.x = 0.36;
      g.add(stair);
      const tactile = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 130), new THREE.MeshStandardMaterial({ color: 0xe8c547, roughness: 0.8 }));
      tactile.position.set(side * 2.5, platformY + 0.02, 0);
      g.add(tactile);
      // shelter
      for (const zOff of [-28, 22]) {
        const shelter = new THREE.Group();
        const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.16, 9), M.dark);
        roof.position.y = 2.9;
        const glass = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 8.4), M.glass);
        glass.position.set(-1.4, 1.4, 0);
        const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.9, 0.12), M.dark);
        p1.position.set(1.3, 1.45, -4.2);
        const p2 = p1.clone(); p2.position.z = 4.2;
        const bench = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 3.4), M.wood);
        bench.position.set(-0.9, 0.55, 0);
        shelter.add(roof, glass, p1, p2, bench);
        shelter.position.set(side * 4.2, platformY, zOff);
        g.add(shelter);
      }
      // name signs
      for (const zOff of [-2, 46, -50]) {
        const sign = makeSign(st.name, { bg: '#0b3d6b', fg: '#ffffff', size: 46 });
        sign.position.set(side * 5.4, platformY + 2.2, zOff);
        sign.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        g.add(sign);
      }
      // lamps
      for (let z = -56; z <= 56; z += 16) {
        const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4, 5), M.dark);
        lampPost.position.set(side * 5.2, platformY + 2, z);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), M.lamp);
        head.position.set(side * 4.8, platformY + 4, z);
        g.add(lampPost, head);
      }
    }
    // station building + ticket hall door
    const hall = new THREE.Mesh(new THREE.BoxGeometry(12, 4.6, 9), M.plaster);
    hall.position.set(-8.5, ground(st.x, st.z) + 2.3, 6);
    hall.castShadow = true;
    const hallRoof = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.4, 9.8), M.slate);
    hallRoof.position.set(-8.5, ground(st.x, st.z) + 4.7, 6);
    const hallSign = makeSign(st.name, { bg: '#f4f1e8', fg: '#0b3d6b', size: 40 });
    hallSign.position.set(-8.5, ground(st.x, st.z) + 3.6, 10.55);
    g.add(hall, hallRoof, hallSign);

    g.position.set(at.x, 0, at.z);
    g.rotation.y = at.angle;
    group.add(g);
    stationObjects.push({ station: st, group: g, platformY, at });
    interactables.push({
      kind: 'station', id: st.id, name: st.name, x: st.x, z: st.z,
      y: platformY, radius: 30, station: st, at
    });
    const doorLocal = { x: -8.5, z: 10.6 };
    const doorWorld = {
      x: at.x + doorLocal.x * Math.cos(at.angle) + doorLocal.z * Math.sin(at.angle),
      z: at.z - doorLocal.x * Math.sin(at.angle) + doorLocal.z * Math.cos(at.angle)
    };
    interactables.push({
      kind: 'door', id: `station_${st.id}`, name: `${st.name} — hall`, interior: 'station',
      x: doorWorld.x, z: doorWorld.z, radius: 4.6
    });
  }

  const state = { night: 0 };
  return {
    group,
    stationObjects,
    setNight(n) { state.night = n; },
    update(t, dt) {}
  };
}

function buildRibbonElevated(points, width, yFn) {
  const verts = [], uvs = [], idx = [];
  let dist = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x, dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dz / len, nz = -dx / len;
    if (i > 0) dist += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
    const y = yFn(p.x, p.z);
    verts.push(p.x + nx * width / 2, y, p.z + nz * width / 2);
    verts.push(p.x - nx * width / 2, y, p.z - nz * width / 2);
    uvs.push(0, dist / 8, 1, dist / 8);
    if (i < points.length - 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildOffsetRibbon(points, offset, width, yFn) {
  const verts = [], idx = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x, dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dz / len, nz = -dx / len;
    const cx = p.x + nx * offset, cz = p.z + nz * offset;
    const y = yFn(cx, cz);
    verts.push(cx + nx * width / 2, y, cz + nz * width / 2);
    verts.push(cx - nx * width / 2, y, cz - nz * width / 2);
    if (i < points.length - 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildEmbankment(points, topOffset, bottomOffset, side, railY) {
  const verts = [], idx = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x, dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (dz / len) * side, nz = (-dx / len) * side;
    const topX = p.x + nx * topOffset, topZ = p.z + nz * topOffset;
    const botX = p.x + nx * bottomOffset, botZ = p.z + nz * bottomOffset;
    verts.push(topX, railY(p.x, p.z), topZ);
    verts.push(botX, ground(botX, botZ) - 0.4, botZ);
    if (i < points.length - 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* --------------------------------------------------------------- landmarks */

function buildLandmarks(world, M, doors, interactables, lampPools) {
  const group = new THREE.Group();
  for (const l of world.landmarks) {
    const g = new THREE.Group();
    g.position.set(l.x, l.baseY, l.z);
    g.rotation.y = l.rotation || 0;
    const { w, d, h } = l.size;
    switch (l.kind) {
      case 'civic': buildTownHall(g, M, l, w, d, h); break;
      case 'church': buildChurch(g, M, l, w, d, h); break;
      case 'supermarket': buildSupermarket(g, M, l, w, d, h); break;
      case 'restaurant': buildRestaurant(g, M, l, w, d, h); break;
      case 'culture': buildGallery(g, M, l, w, d, h); break;
      case 'industrial': buildIndustry(g, M, l, w, d, h); break;
      case 'sport':
        if (l.id === 'stade') buildStadium(g, M, l); else buildPool(g, M, l, w, d, h);
        break;
      case 'school': buildSchool(g, M, l, w, d, h); break;
      case 'hotel': buildHotel(g, M, l, w, d, h); break;
      case 'nature': buildNatureSpot(g, M, l); break;
      case 'park': break;
      case 'water': break;
      default: break;
    }
    // entrance door marker for visitable buildings (position comes from the world)
    if (l.interior && INTERIORS[l.interior]) {
      const wd = (world.doors || []).find((x) => x.id === l.id);
      const doorX = wd ? wd.x : l.x + Math.sin(l.rotation || 0) * (d / 2 + 0.6);
      const doorZ = wd ? wd.z : l.z + Math.cos(l.rotation || 0) * (d / 2 + 0.6);
      const doorRot = wd ? wd.rot : (l.rotation || 0);
      // inverse of the world OBB convention: wx = x + lx·cos + lz·sin, wz = z − lx·sin + lz·cos
      const dx = doorX - l.x, dz = doorZ - l.z;
      const cosR = Math.cos(l.rotation || 0), sinR = Math.sin(l.rotation || 0);
      const lx = dx * cosR - dz * sinR;
      const lz = dx * sinR + dz * cosR;
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.6), M.wood);
      door.position.set(lx, ground(doorX, doorZ) - l.baseY + 1.3, lz);
      door.rotation.y = doorRot - (l.rotation || 0);
      g.add(door);
      const sign = makeSign(l.name, { bg: '#20242a', fg: '#f6f2e8', size: 40 });
      sign.position.set(lx * 1.02, door.position.y + 2.6, lz * 1.02);
      sign.rotation.y = doorRot - (l.rotation || 0);
      g.add(sign);
      doors.push({ id: l.id, name: l.name, interior: l.interior, x: doorX, z: doorZ, y: l.baseY + 1.6 });
      interactables.push({ kind: 'door', id: l.id, name: l.name, interior: l.interior, x: doorX, z: doorZ, radius: 4.6, source: 'landmark' });
    }
    group.add(g);
  }
  // Parc Le'h playground + treetop course
  const parc = world.landmarks.find((x) => x.id === 'parc_leh');
  if (parc) {
    const playground = new THREE.Group();
    const colours = [0xe76f51, 0x2a9d8f, 0xe9c46a, 0x457b9d];
    for (let i = 0; i < 6; i++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.6 + i * 0.3, 1.2 + (i % 3) * 0.7, 1.6), new THREE.MeshStandardMaterial({ color: colours[i % 4], roughness: 0.8 }));
      box.position.set((i - 3) * 4.5, 0.6, (i % 2) * 3);
      box.castShadow = true;
      playground.add(box);
    }
    playground.position.set(parc.x - 22, ground(parc.x - 22, parc.z + 16), parc.z + 16);
    group.add(playground);
    const posts = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 9, 6), M.wood);
      post.position.set((i % 4) * 12, 4.5, Math.floor(i / 4) * 14);
      const ropeGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3((i % 4) * 12, 8.6, Math.floor(i / 4) * 14),
        new THREE.Vector3(((i + 1) % 4) * 12, 8.6, Math.floor(i / 4) * 14)
      ]);
      posts.add(post, new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0x3c2f23 })));
    }
    const pc = project(49.4866, 6.0990);
    posts.position.set(pc.x, ground(pc.x, pc.z), pc.z);
    group.add(posts);
  }
  return { group };
}

function makeWindowStrip(w, h, cols, rows, mat) {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(1.2, 1.5);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set((c - (cols - 1) / 2) * 2.6, (r - (rows - 1) / 2) * 2.8, 0);
      g.add(m);
    }
  }
  return g;
}

function buildTownHall(g, M, l, w, d, h) {
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.plaster);
  body.position.y = h / 2;
  body.castShadow = body.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1.2, d + 1), M.slate);
  roof.position.y = h + 0.5;
  g.add(body, roof);
  // stone base + steps
  const base = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, 1.4, d + 1.4), M.concrete);
  base.position.y = 0.6;
  g.add(base);
  const steps = new THREE.Mesh(new THREE.BoxGeometry(12, 0.9, 3.2), M.concrete);
  steps.position.set(0, 0.45, d / 2 + 1.4);
  g.add(steps);
  // clock tower
  const tower = new THREE.Mesh(new THREE.BoxGeometry(7, 10, 7), M.plaster);
  tower.position.set(0, h + 5, 0);
  tower.castShadow = true;
  const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(5.4, 6.5, 4), M.slate);
  towerRoof.position.set(0, h + 13.2, 0);
  towerRoof.rotation.y = Math.PI / 4;
  g.add(tower, towerRoof);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(1.7, 20), M.white);
  clock.position.set(0, h + 7.4, 3.52);
  g.add(clock);
  const face = makeWindowStrip(w * 0.5, h, 6, 2, M.glass);
  face.position.set(0, h * 0.55, d / 2 + 0.06);
  g.add(face);
  const sign = makeSign('HÔTEL DE VILLE', { bg: '#5e3a26', fg: '#f7e9c9', size: 52 });
  sign.position.set(0, h - 1.4, d / 2 + 0.12);
  g.add(sign);
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 8, 5), M.white);
  flagPole.position.set(-w / 2 + 2, h + 4, 0);
  g.add(flagPole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshStandardMaterial({ color: 0xef3340, side: THREE.DoubleSide }));
  flag.position.set(-w / 2 + 3.3, h + 7, 0);
  g.add(flag);
}

function buildChurch(g, M, l, w, d, h) {
  const stone = new THREE.MeshStandardMaterial({ color: 0x8b8474, roughness: 0.95 });
  const nave = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.7, d * 0.8), stone);
  nave.position.y = h * 0.35;
  nave.castShadow = true;
  const roof = new THREE.Mesh(gableGeometry(), M.slate);
  roof.scale.set(w + 1.2, 6, d * 0.8 + 1.2);
  roof.position.y = h * 0.7;
  g.add(nave, roof);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, h * 1.5, w * 0.55), stone);
  tower.position.set(0, h * 0.75, d * 0.36);
  tower.castShadow = true;
  const spire = new THREE.Mesh(new THREE.ConeGeometry(w * 0.42, h * 0.9, 4), M.slate);
  spire.position.set(0, h * 1.5 + h * 0.45, d * 0.36);
  spire.rotation.y = Math.PI / 4;
  g.add(tower, spire);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), M.steel);
  crossV.position.set(0, h * 1.5 + h * 0.9 + 1.2, d * 0.36);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.18, 0.18), M.steel);
  crossH.position.copy(crossV.position);
  g.add(crossV, crossH);
  const rose = new THREE.Mesh(new THREE.CircleGeometry(2.2, 18), new THREE.MeshStandardMaterial({ color: 0x7d9cc0, roughness: 0.3, metalness: 0.2 }));
  rose.position.set(0, h * 1.05, d * 0.36 + w * 0.28);
  g.add(rose);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.4), M.wood);
  door.position.set(0, 1.7, d * 0.36 + w * 0.281);
  g.add(door);
  const sign = makeSign('SAINT-MARTIN', { bg: '#3b3a33', fg: '#f2ead6', size: 44 });
  sign.position.set(0, 4.6, d * 0.36 + w * 0.282);
  g.add(sign);
}

function buildSupermarket(g, M, l, w, d, h) {
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0xe4e1d8, roughness: 0.85 }));
  body.position.y = h / 2;
  body.castShadow = body.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.5, d + 0.8), M.concrete);
  roof.position.y = h + 0.2;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, h * 0.55), M.glass);
  glass.position.set(0, h * 0.4, d / 2 + 0.06);
  g.add(body, roof, glass);
  const sign = makeSign(l.name, { bg: '#2f6b3d', fg: '#ffffff', size: 40 });
  sign.position.set(0, h - 0.8, d / 2 + 0.12);
  sign.scale.set(10, 2.2, 1);
  g.add(sign);
  // parking
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(w + 14, 20), M.asphalt);
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(0, 0.05, d / 2 + 11);
  lot.receiveShadow = true;
  g.add(lot);
  for (let i = 0; i < 7; i++) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 4.6), M.marked);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set((i - 3) * 2.8, 0.07, d / 2 + 11);
    g.add(stripe);
  }
  const cart = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 1.1), M.steel);
  cart.position.set(3.4, 0.45, d / 2 + 2.6);
  g.add(cart);
}

function buildRestaurant(g, M, l, w, d, h) {
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.plaster);
  body.position.y = h / 2;
  body.castShadow = body.receiveShadow = true;
  const roof = new THREE.Mesh(gableGeometry(), M.slate);
  roof.scale.set(w + 1, 3, d + 1);
  roof.position.y = h;
  g.add(body, roof);
  const win = makeWindowStrip(w, h, 4, 2, M.glass);
  win.position.set(0, h * 0.55, d / 2 + 0.07);
  g.add(win);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.14, 2), new THREE.MeshStandardMaterial({ color: l.accent || 0x9b2226, roughness: 0.9 }));
  awning.position.set(0, 3, d / 2 + 1);
  awning.rotation.x = 0.16;
  g.add(awning);
  const sign = makeSign(l.name, { bg: '#2b2118', fg: '#f3d9a4', size: 40 });
  sign.position.set(0, h - 0.7, d / 2 + 0.12);
  sign.scale.set(Math.min(8.5, w * 0.7), 1.6, 1);
  g.add(sign);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.1), M.dark);
  board.position.set(-w / 2 + 1.6, 0.6, d / 2 + 1.8);
  g.add(board);
}

function buildGallery(g, M, l, w, d, h) {
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0xd9d5cc, roughness: 0.8 }));
  body.position.y = h / 2;
  body.castShadow = body.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, 0.6, d + 1.4), M.dark);
  roof.position.y = h + 0.2;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, h * 0.7), M.glass);
  glass.position.set(0, h * 0.42, d / 2 + 0.06);
  g.add(body, roof, glass);
  const sign = makeSign('CNA — CENTRE NATIONAL DE L’AUDIOVISUEL', { bg: '#1d3557', fg: '#ffffff', size: 30 });
  sign.position.set(0, h - 0.6, d / 2 + 0.12);
  sign.scale.set(18, 1.8, 1);
  g.add(sign);
}

function buildIndustry(g, M, l, w, d, h) {
  if (l.id === 'rolling_mill') {
    // open steel skeleton of the 600 m hall
    const cols = 12, rows = 10;
    const colGeo = new THREE.BoxGeometry(0.7, h, 0.7);
    const columns = new THREE.InstancedMesh(colGeo, M.steel, cols * rows);
    const beamsX = new THREE.InstancedMesh(new THREE.BoxGeometry(w / cols + 1, 0.5, 0.5), M.steel, cols * rows);
    const beamsZ = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, d / rows + 1), M.steel, cols * rows);
    columns.castShadow = beamsX.castShadow = beamsZ.castShadow = true;
    let idx = 0;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = (i / (cols - 1) - 0.5) * w;
        const z = (j / (rows - 1) - 0.5) * d;
        dummy.position.set(x, h / 2, z);
        dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        columns.setMatrixAt(idx, dummy.matrix);
        dummy.position.set(x, h - 0.2, z);
        dummy.updateMatrix();
        beamsX.setMatrixAt(idx, dummy.matrix);
        dummy.rotation.set(0, Math.PI / 2, 0);
        dummy.updateMatrix();
        beamsZ.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }
    g.add(columns, beamsX, beamsZ);
    // concrete floor
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), M.concrete);
    floor.position.y = 0.1;
    floor.receiveShadow = true;
    g.add(floor);
    // rolling machinery
    for (let i = 0; i < 7; i++) {
      const stand = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 3), M.rust);
      stand.position.set(-w / 4, 2, (i - 3) * 16);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.4, 12), M.steel);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(-w / 4, 4.6, (i - 3) * 16);
      g.add(stand, wheel);
    }
    // gantry crane
    const crane = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, 1.2), M.steel);
    crane.position.set(0, h - 4, -d / 3);
    g.add(crane);
    // skate bowls
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 1.4, 16, 1, true), M.concrete);
    bowl.position.set(w / 3, 0.7, d / 3);
    bowl.rotation.x = Math.PI;
    bowl.material.side = THREE.DoubleSide;
    g.add(bowl);
  } else if (l.id === 'blast_furnace') {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 7, h, 12, 1, true), M.rust);
    tower.position.y = h / 2;
    tower.material.side = THREE.DoubleSide;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 1, 12), M.steel);
    top.position.y = h;
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 14, 10), M.rust);
    stack.position.set(6, h + 5, 0);
    g.add(tower, top, stack);
    for (let i = 0; i < 4; i++) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 18, 8), M.rust);
      pipe.rotation.z = Math.PI / 2.4;
      pipe.position.set(-8 + i * 2, h * 0.5, 3 - i * 2);
      g.add(pipe);
    }
    const sign = makeSign('ARBED 1882 — 2005', { bg: '#3b2f2a', fg: '#e8c547', size: 40 });
    sign.position.set(0, 3, 10);
    g.add(sign);
  } else if (l.id === 'water_tower') {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 8, 14), M.rust);
    tank.position.y = h - 6;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(6.4, 3, 14), M.steel);
    cone.position.y = h - 0.8;
    g.add(tank, cone);
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, h, 6), M.steel);
      const a = (i / 4) * Math.PI * 2 + 0.4;
      leg.position.set(Math.cos(a) * 4.4, h / 2 - 3, Math.sin(a) * 4.4);
      leg.rotation.z = Math.cos(a) * 0.09;
      leg.rotation.x = Math.sin(a) * 0.09;
      g.add(leg);
    }
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.concrete);
    body.position.y = h / 2;
    body.castShadow = true;
    g.add(body);
  }
}

function buildStadium(g, M, l) {
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(100, 64), new THREE.MeshStandardMaterial({ color: 0x3f7a34, roughness: 1 }));
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0.06;
  pitch.receiveShadow = true;
  g.add(pitch);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2f2ea });
  const border = new THREE.Mesh(new THREE.RingGeometry(0, 1, 4), lineMat);
  const centre = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0x3f7a34 }));
  centre.rotation.x = -Math.PI / 2;
  centre.position.y = 0.08;
  g.add(centre);
  // touchlines
  for (const [w, d, x, z] of [[100, 0.3, 0, -32], [100, 0.3, 0, 32], [0.3, 64, -50, 0], [0.3, 64, 50, 0], [0.3, 64, 0, 0]]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.07, z);
    g.add(line);
  }
  const stand = new THREE.Mesh(new THREE.BoxGeometry(60, 7, 10), M.concrete);
  stand.position.set(0, 3.5, 38);
  stand.castShadow = true;
  g.add(stand);
  for (let i = 0; i < 4; i++) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 18, 6), M.dark);
    mast.position.set((i % 2 ? 1 : -1) * 48, 9, (i < 2 ? -1 : 1) * 34);
    const light = new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 0.6), M.lamp);
    light.position.set(mast.position.x, 18, mast.position.z);
    g.add(mast, light);
  }
}

function buildPool(g, M, l, w, d, h) {
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.white);
  body.position.y = h / 2;
  body.castShadow = true;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, h * 0.5), M.glass);
  glass.position.set(0, h * 0.4, d / 2 + 0.06);
  const sign = makeSign('PISCINE MUNICIPALE', { bg: '#0f6f8f', fg: '#ffffff', size: 42 });
  sign.position.set(0, h - 0.6, d / 2 + 0.14);
  g.add(body, glass, sign);
}

function buildSchool(g, M, l, w, d, h) {
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.plaster);
  body.position.y = h / 2;
  body.castShadow = true;
  const windows = makeWindowStrip(w, h, 8, 3, M.glass);
  windows.position.set(0, h * 0.55, d / 2 + 0.08);
  const sign = makeSign('LYCÉE NIC-BIEVER', { bg: '#e9e4d8', fg: '#2a9d8f', size: 44 });
  sign.position.set(0, h - 0.8, d / 2 + 0.14);
  g.add(body, windows, sign);
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(40, 26), M.asphalt);
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(w / 2 - 4, 0.06, d / 2 + 15);
  g.add(yard);
}

function buildHotel(g, M, l, w, d, h) {
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.plaster);
  body.position.y = h / 2;
  body.castShadow = true;
  const roof = new THREE.Mesh(gableGeometry(), M.slate);
  roof.scale.set(w + 1, 3.4, d + 1);
  roof.position.y = h;
  const windows = makeWindowStrip(w, h, 5, 3, M.glass);
  windows.position.set(0, h * 0.55, d / 2 + 0.08);
  const sign = makeSign('MILLE 9 SENS', { bg: '#3d2b1f', fg: '#e8c547', size: 44 });
  sign.position.set(0, h - 0.6, d / 2 + 0.14);
  g.add(body, roof, windows, sign);
}

function buildNatureSpot(g, M, l) {
  const stone = new THREE.MeshStandardMaterial({ color: 0x8c8579, roughness: 0.95 });
  if (l.id === 'mont_st_jean') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(7, 3.4, 1.1), stone);
      wall.position.set(Math.cos(a) * 9, 1.7, Math.sin(a) * 9);
      wall.rotation.y = -a + Math.PI / 2;
      wall.castShadow = true;
      g.add(wall);
    }
    const keep = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 12, 10), stone);
    keep.position.y = 6;
    keep.castShadow = true;
    g.add(keep);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 0.4), M.steel);
    cross.position.set(0, 16, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 0.4), M.steel);
    arm.position.set(0, 17.4, 0);
    g.add(cross, arm);
    const sign = makeSign('GEHAANSBIERG · 417 m', { bg: '#3b4a36', fg: '#f1ead6', size: 40 });
    sign.position.set(0, 2.6, 12);
    g.add(sign);
  } else {
    const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 1.6, 10), stone);
    marker.position.y = 0.8;
    const sign = makeSign(l.name, { bg: '#3b4a36', fg: '#f1ead6', size: 40 });
    sign.position.set(0, 2.4, 0);
    g.add(marker, sign);
  }
}

/* ----------------------------------------------------------------- tunnels */

function buildTunnels(world, M, lampPools) {
  const group = new THREE.Group();
  for (const t of world.tunnels) {
    const g = new THREE.Group();
    g.position.set(t.x, t.y, t.z);
    g.rotation.y = t.rot;
    const halfL = t.length / 2;
    const wallMat = M.concrete;
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.8, t.height, t.length), wallMat);
      wall.position.set(side * t.width / 2, t.height / 2, 0);
      g.add(wall);
    }
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(t.width, 0.6, t.length), wallMat);
    ceiling.position.y = t.height;
    g.add(ceiling);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(t.width - 1.6, 0.2, t.length), M.asphalt);
    floor.position.y = 0.12;
    g.add(floor);
    // portals
    for (const zs of [-1, 1]) {
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(t.width + 3, 1.4, 1.4), wallMat);
      lintel.position.set(0, t.height + 0.7, zs * (halfL + 0.6));
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, t.height + 1.4, 1.4), wallMat);
      p1.position.set(-(t.width / 2 + 0.7), (t.height + 1.4) / 2, zs * (halfL + 0.6));
      const p2 = p1.clone(); p2.position.x = (t.width / 2 + 0.7);
      g.add(lintel, p1, p2);
    }
    if (t.kind === 'tunnel') {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), M.foliage);
      hill.scale.set(t.length * 0.42, t.height + 26, t.length * 0.55);
      hill.position.set(0, 1.5, 0);
      hill.castShadow = true;
      g.add(hill);
    }
    for (let i = -2; i <= 2; i++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(t.width * 0.5, 0.05, 0.5), M.lamp);
      strip.position.set(Math.random() * 2 - 1, t.height - 0.4, i * t.length * 0.18);
      g.add(strip);
    }
    const sign = makeSign(t.name, { bg: '#28323a', fg: '#f0e6d2', size: 34 });
    sign.position.set(0, t.height + 1.6, halfL + 1.3);
    g.add(sign);
    group.add(g);
  }
  return group;
}

/* ---------------------------------------------------------------- glow/sky */

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,230,180,0.85)');
  g.addColorStop(0.4, 'rgba(255,214,150,0.25)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildSky() {
  const uniforms = {
    top: { value: new THREE.Color(0x5b8fc7) },
    bottom: { value: new THREE.Color(0xd9e4ee) },
    sunDir: { value: new THREE.Vector3(0.4, 0.7, 0.3) },
    sunColor: { value: new THREE.Color(0xfff2cf) },
    night: { value: 0 }
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `varying vec3 vWorld; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float night;
      varying vec3 vWorld;
      void main(){
        vec3 dir = normalize(vWorld);
        float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(bottom, top, pow(h, 0.85));
        float sun = pow(max(dot(dir, normalize(sunDir)), 0.0), 220.0);
        float glow = pow(max(dot(dir, normalize(sunDir)), 0.0), 6.0);
        col += sunColor * sun * 3.0 + sunColor * glow * 0.18;
        vec3 nightCol = mix(vec3(0.02,0.03,0.06), vec3(0.06,0.08,0.15), h);
        col = mix(col, nightCol, night);
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const group = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(7000, 32, 20), skyMat);
  dome.frustumCulled = false;
  group.add(dome);

  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 1400; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(6500);
    if (v.y < 100) v.y = Math.abs(v.y) + 100;
    starPos.push(v.x, v.y, v.z);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.0, sizeAttenuation: false, transparent: true, opacity: 0 }));
  group.add(stars);

  // clouds
  const cloudGroup = new THREE.Group();
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
  for (let i = 0; i < 26; i++) {
    const puffs = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(60 + Math.random() * 40, 8, 6), cloudMat);
      puff.position.set(j * 55 - 80, Math.random() * 20, Math.random() * 40 - 20);
      puff.scale.y = 0.5;
      puffs.add(puff);
    }
    puffs.position.set((Math.random() - 0.5) * 5000, 420 + Math.random() * 300, (Math.random() - 0.5) * 5000);
    cloudGroup.add(puffs);
  }
  group.add(cloudGroup);

  const sunLight = new THREE.DirectionalLight(0xfff0d0, 2.1);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 900;
  sunLight.shadow.camera.left = -220;
  sunLight.shadow.camera.right = 220;
  sunLight.shadow.camera.top = 220;
  sunLight.shadow.camera.bottom = -220;
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.4;
  group.add(sunLight);
  group.add(sunLight.target);
  const hemi = new THREE.HemisphereLight(0xbcd8f0, 0x4a5b3a, 0.85);
  group.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0.15);
  group.add(ambient);

  return {
    group, sunLight, hemi, uniforms, stars, cloudGroup,
    sunDir: new THREE.Vector3(0.4, 0.7, 0.3),
    setNight(n) {
      uniforms.night.value = n;
      stars.material.opacity = Math.max(0, n - 0.25) * 0.9;
      sunLight.intensity = lerp(2.2, 0.06, n);
      hemi.intensity = lerp(0.9, 0.18, n);
      ambient.intensity = lerp(0.16, 0.1, n);
    },
    setWeather(kind) {
      if (kind === 'rain') {
        uniforms.top.value.set(0x55636d);
        uniforms.bottom.value.set(0x9aa6ac);
        hemi.intensity = Math.min(hemi.intensity, 0.55);
      } else if (kind === 'fog') {
        uniforms.top.value.set(0x93a4ab);
        uniforms.bottom.value.set(0xc4cfd2);
      } else if (kind === 'overcast') {
        uniforms.top.value.set(0x6f8296);
        uniforms.bottom.value.set(0xb6c2cc);
      } else {
        uniforms.top.value.set(0x5b8fc7);
        uniforms.bottom.value.set(0xd9e4ee);
      }
    },
    update(dt, time, playerPos) {
      cloudGroup.position.x = Math.sin(time * 0.004) * 120;
      if (playerPos) {
        sunLight.position.set(playerPos.x + this.sunDir.x * 400, playerPos.y + this.sunDir.y * 400, playerPos.z + this.sunDir.z * 400);
        sunLight.target.position.copy(playerPos);
        sunLight.target.updateMatrixWorld();
      }
    }
  };
}
