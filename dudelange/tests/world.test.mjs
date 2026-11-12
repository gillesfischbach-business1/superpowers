/** World invariants that must hold for every seed we ship. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildWorld } from '../public/js/core/world.js';
import { INTERIORS } from '../public/js/core/interiors.js';
import { QUESTS } from '../public/js/core/quests.js';

const w = buildWorld({ seed: 20261112 });

test('world builds with the canonical content volume', () => {
  assert.ok(w.buildings.length > 500, 'needs a dense town');
  assert.equal(w.rail.stations.length, 4);
  assert.equal(w.districts.length, 6);
});

test('every visitable landmark has an interior and a reachable door', () => {
  const interiors = Object.keys(INTERIORS);
  for (const l of w.landmarks) if (l.interior) assert.ok(interiors.includes(l.interior), l.id);
  for (const s of w.rail.stations) assert.ok(interiors.includes('station'));
  assert.equal(w.doors.length, w.landmarks.filter((l) => l.interior).length + 4);
  for (const door of w.doors) assert.ok(door.distanceToRoad < 60, `${door.id} is ${door.distanceToRoad}m from a street`);
});

test('geometry is finite and spawn is clear', () => {
  for (const b of w.buildings) assert.ok(Number.isFinite(b.x) && Number.isFinite(b.z));
  assert.ok(!w.buildings.some((b) => Math.hypot(b.x - w.spawn.x, b.z - w.spawn.z) < 2));
});

test('quests reference real content', () => {
  assert.ok(QUESTS.length >= 8, 'at least the original eight quests');
  for (const q of QUESTS) {
    assert.ok(q.id && q.title, 'quest needs an id and a title');
    assert.ok(q.desc || q.steps?.length, `${q.id} needs an objective`);
    assert.ok(typeof q.money === 'number' && typeof q.xp === 'number', `${q.id} needs rewards`);
  }
  assert.equal(new Set(QUESTS.map((q) => q.id)).size, QUESTS.length, 'quest ids are unique');
});

test('station order is geographic north → south', () => {
  assert.deepEqual(w.rail.stations.map((s) => s.id), ['burange', 'ville', 'centre', 'usines']);
});
