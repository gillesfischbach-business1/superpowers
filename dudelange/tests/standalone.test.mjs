import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installDomStub } from './_dom-stub.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifact = path.join(root, 'diddeleng-standalone.html');

/**
 * Boot the *shipped single file*, not the module tree.
 *
 * `diddeleng-standalone.html` is what people actually open when the preview is
 * asleep. It is built by a separate esbuild pass that inlines the bundle, and
 * that pass has already broken the page twice in ways the source tree could not
 * show: a literal `</script>` inside a template string, and `$&` in a minified
 * three.js identifier being eaten by `String.replace`. Both produced exactly the
 * user-visible symptom "game failed to start", so the artifact gets its own boot
 * test: rebuild, extract every inline script, run them in page order against the
 * DOM stub, and demand the loader reaches "Dudelange is ready.".
 */
test('the single-file build boots the whole game from plain HTML', async () => {
  if (!fs.existsSync(path.join(root, 'node_modules', 'esbuild'))) {
    console.log('# esbuild not installed — skipping single-file boot (run npm install)');
    return;
  }

  execFileSync(process.execPath, ['scripts/build-standalone.mjs'], { cwd: root, stdio: 'pipe' });

  const html = fs.readFileSync(artifact, 'utf8');

  // The page must be self-contained: no external scripts, styles, imports or images.
  for (const pattern of [/\bsrc\s*=\s*["'][^"']*\.js/, /\bhref\s*=\s["'][^"']*\.css/, /type\s*=\s*["']importmap["']/, /\bimport\s+.*from\s+["']http/]) {
    assert.ok(!pattern.test(html), `single file still points at an external asset: ${pattern}`);
  }

  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 2, `expected boot guard + bundle, found ${scripts.length} inline scripts`);
  assert.ok(scripts.some((code) => code.length > 100_000), 'the game bundle is not inlined');

  const { byId, pumpFrames, clearTimers } = installDomStub();
  const errors = [];
  const realError = console.error;
  console.error = (...args) => { errors.push(args.map(String).join(' ')); };

  try {
    // Page order matters: the guard installs the error reporter the bundle uses.
    for (const code of scripts) vm.runInThisContext(code, { filename: 'diddeleng-standalone.inline.js' });
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline && String(byId('loadtext').textContent) !== 'Dudelange is ready.') {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    // And it has to be playable, not just bootable: press Enter Dudelange and
    // run real frames, exactly like the player who reported "ride is not defined".
    const start = byId('startBtn');
    assert.equal(typeof start.onclick, 'function', 'the single file has no start handler');
    await start.onclick({ target: start });
    const played = pumpFrames(240, 16);
    assert.ok(played >= 200, `the single-file build stopped after ${played} frames`);
  } finally {
    console.error = realError;
    clearTimers();
  }

  const report = errors.join('\n');
  assert.equal(report, '', `single-file build logged errors while booting:\n${report}`);
  assert.equal(String(byId('errors').textContent), '', `error box: ${byId('errors').textContent}`);
  assert.equal(String(byId('loadtext').textContent), 'Dudelange is ready.', `loader stuck at: ${byId('loadtext').textContent}`);
});
