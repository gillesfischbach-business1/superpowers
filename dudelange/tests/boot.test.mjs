import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStub } from './_dom-stub.mjs';

/**
 * Boot smoke test for the real browser entry point.
 *
 * The game is one ES module tree loaded straight into the page. Nothing in the
 * pipeline used to execute it, so a missing export or a `class` used before its
 * declaration shipped as a blank screen. This imports the actual file the
 * browser imports and runs it until the GPU is needed.
 */
test('the game boots through world build and reaches the renderer', async () => {
  const { byId } = installDomStub();
  const errors = [];
  const realError = console.error;
  console.error = (...args) => { errors.push(args.map(String).join(' ')); };

  try {
    await import('../public/js/game/main.js');
    // let the async init() chain settle
    await new Promise((resolve) => setTimeout(resolve, 1500));
  } finally {
    console.error = realError;
  }

  const report = errors.join('\n');
  const box = byId('errors');

  // Node has no WebGL. Reaching that point proves the module graph loaded, the
  // classes were initialised in the right order, and the world was generated.
  assert.match(report, /WebGL/i, `boot never reached the renderer:\n${report}`);

  for (const fatal of ['is not defined', 'Cannot access', 'before initialization', 'does not provide an export', 'is not a function', 'Cannot read properties of undefined']) {
    assert.ok(!report.includes(fatal), `boot crashed before the GPU: ${fatal}\n${report}`);
    assert.ok(!String(box.textContent).includes(fatal), `error box shows ${fatal}`);
  }

  // the loader reported real progress out of the generated world before failing
  const progress = byId('loadtext').textContent;
  assert.ok(String(progress).length > 0, 'loading screen never updated');
});
