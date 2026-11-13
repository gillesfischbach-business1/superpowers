/**
 * The ground, sampled exactly the way the GPU draws it.
 *
 * `terrainHeight()` in geo.js is a continuous analytic function. The terrain
 * mesh can only sample it at its vertices, and between them the surface is
 * linear. On a 40 m grid that difference reaches ±1.5 m — far more than the
 * few centimetres that roads, kerbs and doorsteps are lifted by. The result was
 * grass swallowing the streets, buildings half-buried on their uphill side and
 * z-fighting stripes everywhere: the "heights don't fit" look.
 *
 * So the mesh became the authority. `buildHeightField()` bakes one lattice, the
 * renderer builds its triangles from exactly those nodes, and `ground(x, z)`
 * interpolates the same triangles. Everything placed in the world — roads,
 * kerbs, houses, props, cars, the train, the player, the camera — asks `ground`,
 * so it can never disagree with what is on screen.
 */
import { terrainHeight, project } from './geo.js';

/** Cell size of the terrain lattice in metres; the renderer uses the same. */
export const HEIGHT_STEP = 40;

let FIELD = null;

/**
 * Bake the lattice over the world bounds. Returns the field so the renderer can
 * build its geometry from the very same numbers.
 */
export function buildHeightField(bounds, step = HEIGHT_STEP) {
  const nw = project(bounds.north, bounds.west);
  const se = project(bounds.south, bounds.east);
  const spanX = (se.x - nw.x) * 2.2;
  const spanZ = (se.z - nw.z) * 2.2;
  const cols = Math.max(8, Math.ceil(spanX / step));
  const rows = Math.max(8, Math.ceil(spanZ / step));
  const x0 = nw.x + (se.x - nw.x) / 2 - (cols * step) / 2;
  const z0 = nw.z + (se.z - nw.z) / 2 - (rows * step) / 2;

  const heights = new Float32Array((cols + 1) * (rows + 1));
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      heights[j * (cols + 1) + i] = terrainHeight(x0 + i * step, z0 + j * step);
    }
  }
  FIELD = { x0, z0, cols, rows, step, heights, width: cols * step, depth: rows * step };
  return FIELD;
}

/** The baked lattice, or null before the world is built. */
export function heightField() {
  return FIELD;
}

/**
 * Ground height at (x, z), interpolated across the same two triangles the
 * renderer emits for that cell. Outside the lattice it falls back to the
 * analytic function (the far ground plane, which nobody walks on).
 */
export function ground(x, z) {
  const f = FIELD;
  if (!f) return terrainHeight(x, z);
  const fx = (x - f.x0) / f.step;
  const fz = (z - f.z0) / f.step;
  if (!(fx >= 0 && fz >= 0 && fx <= f.cols && fz <= f.rows)) return terrainHeight(x, z);

  const i = Math.min(f.cols - 1, Math.floor(fx));
  const j = Math.min(f.rows - 1, Math.floor(fz));
  const tx = fx - i, tz = fz - j;
  const w = f.cols + 1;
  const h00 = f.heights[j * w + i];
  const h10 = f.heights[j * w + i + 1];
  const h01 = f.heights[(j + 1) * w + i];
  const h11 = f.heights[(j + 1) * w + i + 1];

  // Triangles: (00, 10, 01) and (10, 11, 01) — see terrainGeometry().
  if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
  return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
}

/** Surface normal of the drawn ground, for prop alignment and slope checks. */
export function groundNormal(x, z, eps = 1.5) {
  const hL = ground(x - eps, z), hR = ground(x + eps, z);
  const hD = ground(x, z - eps), hU = ground(x, z + eps);
  const nx = hL - hR, nz = hD - hU, ny = 2 * eps;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}
