/**
 * Off-screen renderer: draw the live scene to a PNG without a GPU.
 *
 * There is no headless WebGL in this sandbox, so the only way to *look* at the
 * game — to check that a house is not buried, a road is not floating, a car is
 * not upside down — is to walk the scene graph the game itself builds and
 * rasterise the triangles with the CPU. It is not a screenshot of the shaders;
 * it is a picture of the geometry, which is exactly what "the heights don't fit"
 * is about.
 *
 *   node scripts/preview-render.mjs [--out shot.png] [--w 900] [--h 560]
 *                                   [--mode foot|top|aerial] [--yaw 0] [--pitch 0]
 *                                   [--x N] [--z N] [--dist 7]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { installDomStub } from '../tests/_dom-stub.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const out = arg('out', path.join(root, 'preview.png'));
const W = Number(arg('w', 900));
const H = Number(arg('h', 560));
const mode = arg('mode', 'foot');
const yaw = Number(arg('yaw', 0));
const pitch = Number(arg('pitch', 0.08));
const dist = Number(arg('dist', 7));
const only = arg('only', null);
const paint = arg('paint', null);   // debug: draw every triangle in one colour
const hide = arg('hide', null);

/* ------------------------------------------------------------------- png */
function writePng(file, width, height, rgbaa) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgb.constructor;
    Buffer.from(rgb.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crcTable = writePng._crc || (writePng._crc = Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    }));
    let crc = 0xffffffff;
    for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, body, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]));
}

/* ---------------------------------------------------------------- raster */
const rgb = new Uint8ClampedArray(W * H * 4);
const depth = new Float32Array(W * H);

function clear() {
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const r = Math.round(176 - t * 26), g = Math.round(201 - t * 22), b = Math.round(214 - t * 14);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      rgb[i] = r; rgb[i + 1] = g; rgb[i + 2] = b; rgb[i + 3] = 255;
    }
  }
  depth.fill(0);      // invZ: bigger is nearer, so 0 means 'nothing drawn yet'
}

/** fill a triangle given screen coords and 1/z, with a flat colour */
function triangle(x0, y0, z0, x1, y1, z1, x2, y2, z2, col) {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
  if (minX > maxX || minY > maxY) return;
  const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (Math.abs(denom) < 1e-9) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const a = ((y1 - y2) * (x + 0.5 - x2) + (x2 - x1) * (y + 0.5 - y2)) / denom;
      const b = ((y2 - y0) * (x + 0.5 - x2) + (x0 - x2) * (y + 0.5 - y2)) / denom;
      const c = 1 - a - b;
      if (a < 0 || b < 0 || c < 0) continue;
      const invZ = a * z0 + b * z1 + c * z2;
      const idx = y * W + x;
      if (invZ <= 0 || invZ <= depth[idx]) continue;   // keep the nearest surface
      depth[idx] = invZ;
      const p = idx * 4;
      rgb[p] = col[0]; rgb[p + 1] = col[1]; rgb[p + 2] = col[2]; rgb[p + 3] = 255;
    }
  }
}

/* ------------------------------------------------------------------ boot */
const stub = installDomStub();
await import('../public/js/game/main.js');
const waitStart = Date.now();
while (Date.now() - waitStart < 60_000 && String(stub.byId('loadtext').textContent) !== 'Dudelange is ready.') {
  await new Promise((r) => setTimeout(r, 25));
}
const game = globalThis.__diddeleng;
if (!game) throw new Error('the game did not boot');
const { app, THREE, terrainHeight } = game;

app.mode = 'foot';
const p = app.player;
p.yaw = yaw;
p.pitch = pitch;
if (arg('x', null) !== null) p.x = Number(arg('x'));
if (arg('z', null) !== null) p.z = Number(arg('z'));
p.y = terrainHeight(p.x, p.z);
p.camDist = dist;

const cam = app.camera;
cam.aspect = W / H;
if (mode === 'top') {
  cam.position.set(p.x, p.y + 240, p.z);
  cam.up.set(0, 0, -1);
  cam.lookAt(p.x, p.y, p.z);
} else if (mode === 'aerial') {
  cam.position.set(p.x - Math.sin(yaw) * 120, p.y + 80, p.z - Math.cos(yaw) * 120);
  cam.lookAt(p.x, p.y + 2, p.z);
} else {
  // exactly the third-person rig the game uses
  const target = new THREE.Vector3(p.x, p.y + 1.7, p.z);
  cam.position.set(
    p.x - Math.sin(yaw) * Math.cos(pitch) * dist,
    p.y + 1.7 + Math.sin(pitch) * dist + 1.2,
    p.z - Math.cos(yaw) * Math.cos(pitch) * dist
  );
  cam.lookAt(target);
}
cam.updateMatrixWorld();
cam.updateProjectionMatrix();
const viewProj = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

/* ------------------------------------------------------------- triangles */
const light = new THREE.Vector3(-0.45, 0.82, 0.35).normalize();
const tmp = new THREE.Vector3();
const nrm = new THREE.Matrix3();

let tris = 0, drawn = 0;
const world = new THREE.Matrix4();
const instWorld = new THREE.Matrix4();
const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

const lin2srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function shade(material, normal, fallback, instanceColor) {
  const hint = material && material.userData && material.userData.preview;
  const base = instanceColor || (hint ? new THREE.Color(hint) : (material && material.color ? material.color : null));
  let r = base ? base.r : fallback[0], g = base ? base.g : fallback[1], b = base ? base.b : fallback[2];
  if (material && material.emissive && material.emissiveIntensity > 0.4) {
    r = Math.min(1, r + material.emissive.r * 0.6); g = Math.min(1, g + material.emissive.g * 0.6); b = Math.min(1, b + material.emissive.b * 0.6);
  }
  const lambert = 0.45 + 0.55 * Math.max(0, normal.dot(light));
  return [
    Math.round(255 * lin2srgb(Math.min(1, r * lambert))),
    Math.round(255 * lin2srgb(Math.min(1, g * lambert))),
    Math.round(255 * lin2srgb(Math.min(1, b * lambert)))
  ];
}

function wanted(node) {
  const name = `${node.name || ''} ${node.geometry ? node.geometry.type : ''} ${node.type}`;
  if (only && !name.includes(only)) return false;
  if (hide && name.includes(hide)) return false;
  return true;
}

function emitMesh(mesh, matrix, instanceColor) {
  const geo = mesh.geometry;
  const pos = geo && geo.attributes && geo.attributes.position;
  if (!pos) return;
  const index = geo.index;
  const colorAttr = geo.attributes.color;
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (mat && mat.visible === false) return;
  if (mat && (mat.transparent === true && mat.opacity !== undefined && mat.opacity < 0.35)) return;
  if (mesh.name === 'rain' || (mat && mat.depthWrite === false)) return;
  nrm.getNormalMatrix(matrix);
  const count = index ? index.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    const ia = index ? index.getX(i) : i;
    const ib = index ? index.getX(i + 1) : i + 1;
    const ic = index ? index.getX(i + 2) : i + 2;
    v[0].fromBufferAttribute(pos, ia).applyMatrix4(matrix);
    v[1].fromBufferAttribute(pos, ib).applyMatrix4(matrix);
    v[2].fromBufferAttribute(pos, ic).applyMatrix4(matrix);
    tris++;
    const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0]));
    if (n.lengthSq() < 1e-10) continue;
    n.normalize();
    // backface cull against the camera
    tmp.copy(v[0]).sub(cam.position);
    if (n.dot(tmp) > 0) continue;

    let fallback = [0.5, 0.5, 0.5];
    if (colorAttr) {
      const ci = (ia + ib + ic) / 3;
      fallback = [colorAttr.getX(ci), colorAttr.getY(ci), colorAttr.getZ(ci)];
    }
    let col = shade(mat, n, fallback, instanceColor);
    if (paint) {
      const hex = parseInt(paint.replace('#', ''), 16);
      col = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    }

    // clip the triangle against the near plane in clip space, otherwise every
    // large polygon under the camera (the ground!) disappears
    let poly = [v[0], v[1], v[2]].map((p) => new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(viewProj));
    const kept = [];
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      const da = a.z + a.w, db = b.z + b.w;
      if (da >= 0) kept.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        kept.push(new THREE.Vector4(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t, a.w + (b.w - a.w) * t));
      }
    }
    if (kept.length < 3) continue;

    const sx = [], sy = [], sz = [];
    for (const c of kept) {
      sx.push((c.x / c.w * 0.5 + 0.5) * W);
      sy.push((1 - (c.y / c.w * 0.5 + 0.5)) * H);
      sz.push(1 / Math.max(0.01, c.w));   // 1/distance: linear in screen space, unlike NDC z
    }
    for (let k = 1; k < kept.length - 1; k++) {
      triangle(sx[0], sy[0], sz[0], sx[k], sy[k], sz[k], sx[k + 1], sy[k + 1], sz[k + 1], col);
    }
    drawn++;
  }
}

clear();
const stats = new Map();
const before = () => drawn;
app.scene.updateMatrixWorld(true);
app.scene.traverse((node) => {
  if (node.isInstancedMesh) {
    if (!wanted(node)) return;
    for (let i = 0; i < node.count; i++) {
      node.getMatrixAt(i, instWorld);
      world.multiplyMatrices(node.matrixWorld, instWorld);
      let instanceColor = null;
      if (node.instanceColor) {
        const t = new THREE.Color();
        t.fromBufferAttribute(node.instanceColor, i);
        instanceColor = t;
      }
      const start = before();
      emitMesh(node, world, instanceColor);
      const key = `${node.name || node.type}${node.geometry && node.geometry.type ? `[${node.geometry.type}]` : ''}`;
      stats.set(key, (stats.get(key) || 0) + (drawn - start));
    }
  } else if (node.isMesh) {
    if (!wanted(node)) return;
    const start = before();
    emitMesh(node, node.matrixWorld);
    const key = `${node.name || node.type}${node.geometry && node.geometry.type ? `[${node.geometry.type}]` : ''}`;
    stats.set(key, (stats.get(key) || 0) + (drawn - start));
  }
});

writePng(out, W, H, rgb);
console.log(`${out} — ${W}x${H}, ${tris} triangles tested, ${drawn} drawn, mode=${mode}, yaw=${yaw}`);
if (argv.includes('--stats')) {
  const top = [...stats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  for (const [name, n] of top) console.log(`   ${String(n).padStart(7)} tris  ${name}`);
}
stub.clearTimers();
