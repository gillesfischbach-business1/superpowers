/** Milestone 5 invariants: cars, trains, forests, pubs. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildWorld, resolveCollisions } from '../public/js/core/world.js';
import { INTERIORS } from '../public/js/core/interiors.js';
import { simulate } from '../public/js/core/train.js';

const w = buildWorld({ seed: 20261112 });

test('parked cars: enough of them, one is yours, none in a wall', () => {
  assert.ok(w.cars.length >= 20, `only ${w.cars.length} cars`);
  assert.equal(w.cars.filter((c) => c.owned).length, 1, 'exactly one owned car');
  for (const c of w.cars) {
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.z));
    assert.ok(c.color && c.district, 'cars need a colour and a quarter');
    assert.ok(c.collider, 'every parked car is solid');
  }
  const inside = w.cars.filter((c) => w.buildings.some((b) => {
    const cos = Math.cos(b.rot), sin = Math.sin(b.rot);
    const dx = c.x - b.x, dz = c.z - b.z;
    const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
    return Math.abs(lx) < b.d / 2 && Math.abs(lz) < b.w / 2;
  }));
  assert.deepEqual(inside.map((c) => c.id), [], 'cars must not spawn inside buildings');
});

test('a car is solid: standing in one pushes you out', () => {
  const car = w.cars[0];
  const solved = resolveCollisions(w, car.x, car.z, 1.0);
  assert.ok(Math.hypot(solved.x - car.x, solved.z - car.z) > 0.5);
});

test('the train serves every stop, in order, and reverses at the end', () => {
  const stations = w.rail.stations
    .map((s) => ({ id: s.id, chainage: s.railDist }))
    .sort((a, b) => a.chainage - b.chainage);
  const run = simulate(stations, { total: w.rail.length, seconds: 1200, dt: 0.25 });
  assert.deepEqual(run.visits.slice(0, 4), ['burange', 'ville', 'centre', 'usines']);
  assert.ok(run.reversals >= 1, 'reverses at the terminus');
  assert.equal(run.repeatedDwell, false, 'never dwells twice at the same platform');
  assert.ok(run.travelled > 2000, 'actually covers ground');
});

test('forest trails are long, walkable and surrounded by trees', () => {
  const forestTrails = w.forestPaths.filter((t) => t.kind !== 'park');
  assert.ok(forestTrails.length >= 3, `only ${forestTrails.length} forest trails`);
  for (const trail of forestTrails) {
    assert.ok(trail.length > 140, `${trail.id} is only ${trail.length} m`);
    const trees = w.trees.filter((tr) => tr.kind === 'deciduous'
      && trail.samples.some((p) => Math.hypot(tr.x - p.x, tr.z - p.z) < 30));
    assert.ok(trees.length > 12, `${trail.id} has only ${trees.length} trees nearby`);
  }
  assert.ok(w.clearings.length >= 3, 'glades to rest in');
  assert.ok(w.colliders.filter((c) => c.type === 'tree').length > 1000, 'trunks are solid');
});

test('pubs pour real drinks, with and without alcohol', () => {
  const pubs = Object.entries(INTERIORS).filter(([, s]) => s.kind === 'pub');
  assert.ok(pubs.length >= 3, `only ${pubs.length} pubs`);
  for (const [id, pub] of pubs) {
    const items = pub.shop?.items || [];
    assert.ok(items.some((i) => i.booze > 0), `${id} has no alcohol`);
    assert.ok(items.some((i) => !(i.booze > 0)), `${id} has no soft option`);
    assert.ok(items.every((i) => i.booze >= 0 && i.booze <= 0.45), `${id} has an absurd ABV`);
    assert.ok(pub.layout.dartboard && pub.layout.stools, `${id} lacks pub furniture`);
  }
  const pubLandmarks = w.landmarks.filter((l) => l.kind === 'pub');
  assert.equal(pubLandmarks.length, pubs.length, 'every pub is a building you can walk into');
});
