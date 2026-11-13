import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStub } from './_dom-stub.mjs';

/**
 * The town has to be *inhabited*, and everything in it has to touch the ground.
 *
 * Two complaints came from the browser: "the height of objects doesn't fit" and
 * "no traffic nor trains". Both were invisible to the existing suite: it booted
 * the game and stopped. This one plays it, then inspects the live scene: is
 * there traffic near the player, is it on the tarmac, is the train somewhere you
 * could actually reach it, and does anything float above the surface?
 */
test('the streets are alive and everything stands on the ground', async () => {
  const { byId, pumpFrames, clearTimers } = installDomStub();
  const problems = [];
  const realError = console.error;
  console.error = (...args) => { problems.push(args.map(String).join(' ')); };

  try {
    await import('../public/js/game/main.js');
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && String(byId('loadtext').textContent) !== 'Dudelange is ready.') {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await byId('startBtn').onclick({ target: byId('startBtn') });
    pumpFrames(120, 16);

    const { app, ground } = globalThis.__diddeleng;
    const p = app.player;

    /* ------------------------------------------------------------- traffic */
    assert.ok(app.traffic.length >= 25, `only ${app.traffic.length} cars in traffic`);
    const distances = app.traffic.map((c) => Math.hypot(c.group.position.x - p.x, c.group.position.z - p.z));
    const nearest = Math.min(...distances);
    assert.ok(nearest < 200, `nearest traffic is ${nearest.toFixed(0)} m away — the streets look empty`);

    // every car sits on the tarmac, on the ground, and not in a wall
    for (const car of app.traffic) {
      const { x, y, z } = car.group.position;
      const dy = Math.abs(y - ground(x, z));
      assert.ok(dy < 0.3, `a traffic car floats ${dy.toFixed(2)} m above the road`);
      let best = Infinity;
      for (const road of app.world.roads) {
        const half = road.width / 2;
        for (const s of road.samples) {
          const d = Math.hypot(s.x - x, s.z - z) - half;
          if (d < best) best = d;
        }
      }
      assert.ok(best < 1.5, `a traffic car is ${best.toFixed(1)} m off the carriageway`);
    }

    /* --------------------------------------------------------------- train */
    const t = app.train;
    assert.ok(t, 'no train');
    assert.ok(t.cars.length >= 3, `the train has ${t.cars.length} carriages`);
    const trainDistance = Math.hypot(t.cars[0].position.x - p.x, t.cars[0].position.z - p.z);
    assert.ok(trainDistance < 400, `the train starts ${trainDistance.toFixed(0)} m away — you never see it`);

    // station chainages must be metres along the line, in order and spread out
    const chainages = t.stations.map((s) => s.chainage);
    assert.ok(chainages.every((c, i) => i === 0 || c > chainages[i - 1]), `chainages are not ordered: ${chainages.join(', ')}`);
    assert.ok(chainages[chainages.length - 1] > 1000, `the stations span only ${chainages[chainages.length - 1].toFixed(0)} m of a ${t.total.toFixed(0)} m line`);

    // it leaves the platform and runs
    const startDist = t.dist;
    pumpFrames(900, 16);      // ~14 s
    assert.notEqual(t.state, 'dwell', 'the train never departs');
    assert.ok(Math.abs(t.dist - startDist) > 20, `the train moved ${Math.abs(t.dist - startDist).toFixed(1)} m`);

    /* ------------------------------------------------- nothing is floating */
    const floating = [];
    for (const b of app.world.buildings.slice(0, 400)) {
      const cos = Math.cos(b.rot), sin = Math.sin(b.rot);
      let lowest = Infinity;
      for (const [lx, lz] of [[-b.w / 2, -b.d / 2], [b.w / 2, -b.d / 2], [-b.w / 2, b.d / 2], [b.w / 2, b.d / 2]]) {
        lowest = Math.min(lowest, ground(b.x + lx * cos + lz * sin, b.z - lx * sin + lz * cos));
      }
      if (b.baseY > lowest + 0.02) floating.push(`${b.id} +${(b.baseY - lowest).toFixed(2)} m`);
    }
    assert.deepEqual(floating, [], `buildings hang above the ground: ${floating.slice(0, 5).join(', ')}`);

    const props = [];
    for (const prop of app.world.props.slice(0, 400)) {
      const dy = Math.abs((prop.y ?? 0) - ground(prop.x, prop.z));
      if (dy > 1.2) props.push(`${prop.type} ${dy.toFixed(2)} m`);
    }
    assert.deepEqual(props, [], `props float: ${props.slice(0, 5).join(', ')}`);

    assert.deepEqual(problems, [], `the game logged errors: ${problems.join('\n')}`);
  } finally {
    console.error = realError;
    clearTimers();
  }
});
