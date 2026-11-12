import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { installDomStub } from './_dom-stub.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The failure path is a feature.
 *
 * The browser that reported "game failed to start" gave us nothing to work with:
 * a frozen loading screen and one sentence. Whatever goes wrong — no WebGL, a
 * sandboxed frame, a broken bundle — the page now has to say *where* it died and
 * offer a way through. This runs the real guard from index.html, boots the real
 * game with WebGL deliberately withheld, and checks the panel a player sees.
 */
test('a failed boot explains itself and offers the single-file build', async () => {
  const { byId, beacons } = installDomStub({ webgl: false });

  // Exactly the inline guard the browser runs, in page order.
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const guard = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])[0];
  assert.ok(guard && guard.includes('__diddelengFail'), 'index.html lost its failure guard');
  vm.runInThisContext(guard, { filename: 'index-guard.js' });
  assert.equal(typeof globalThis.__diddelengFail, 'function');

  // The guard arms a 12 s "still loading?" timer; keep the test process short.
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, Math.min(Number(ms) || 0, 300), ...args);

  const realError = console.error;
  console.error = () => {};
  try {
    await import('../public/js/game/main.js');
    await new Promise((resolve) => setTimeout(resolve, 400));
  } finally {
    console.error = realError;
    globalThis.setTimeout = realSetTimeout;
  }

  const panel = String(byId('errors').textContent);
  assert.match(panel, /Game failed to start/, 'no failure panel was rendered');
  assert.match(panel, /WebGL 2/, 'the panel does not say the frame refused WebGL');
  assert.match(panel, /phase:/, 'the panel does not report the boot phase');
  assert.match(panel, /single-file build/, 'the panel does not offer a way through');

  const link = byId('errors').children
    .flatMap((child) => (child.children || []))
    .find((child) => child.href === '/standalone');
  assert.ok(link, 'no link to /standalone in the failure panel');
  assert.equal(link.target, '_blank');

  assert.equal(String(byId('loadtext').textContent).includes('WebGL 2'), true,
    `loader text does not mention the real cause: ${byId('loadtext').textContent}`);

  // And the same story reaches the server, so the next report is actionable.
  assert.equal(beacons.length, 1, `expected one beacon, got ${beacons.length}`);
  assert.equal(beacons[0].url, '/api/errors');
  const payload = JSON.parse(beacons[0].body);
  assert.equal(payload.kind, 'boot');
  assert.match(payload.message, /WebGL 2/);
  assert.equal(payload.diag.webgl2, 'no');
  assert.equal(payload.diag.frame, 'top-level');
  assert.equal(payload.diag.storage, 'yes');
});
