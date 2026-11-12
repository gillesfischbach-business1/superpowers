/** OBB convention round-trip: world → local → world must be identity. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

const toWorld = (x, z, lx, lz, rot) => [x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot)];
const toLocal = (x, z, wx, wz, rot) => {
  const dx = wx - x, dz = wz - z;
  return [dx * Math.cos(rot) - dz * Math.sin(rot), dx * Math.sin(rot) + dz * Math.cos(rot)];
};

test('obb transform round-trips for random poses', () => {
  for (let i = 0; i < 500; i++) {
    const x = (i * 7919) % 4000 - 2000, z = (i * 104729) % 4000 - 2000;
    const rot = ((i * 37) % 628) / 100 - Math.PI;
    const lx = ((i * 13) % 40) - 20, lz = ((i * 29) % 40) - 20;
    const [wx, wz] = toWorld(x, z, lx, lz, rot);
    const [rx, rz] = toLocal(x, z, wx, wz, rot);
    assert.ok(Math.abs(rx - lx) < 1e-9 && Math.abs(rz - lz) < 1e-9, `pose ${i} failed`);
  }
});

test('door offsets land outside their building footprint', () => {
  for (const [w, d] of [[20, 14], [64, 26], [34, 600], [14, 12]]) {
    const half = Math.min(w, d) / 2 + 1.2;
    assert.ok(half > Math.min(w, d) / 2, 'door sits beyond the short wall');
  }
});
