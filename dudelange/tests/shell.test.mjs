/** Static contract between the HTML shell and the ES modules that boot it. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('public/index.html');
const files = ['main', 'ui', 'world-render', 'textures', 'audio'].map((n) => `public/js/game/${n}.js`);

test('html exposes an import map for three', () => {
  assert.match(html, /"three":\s*"\/vendor\/three\.module\.js"/);
  assert.ok(fs.existsSync(path.join(root, 'public/vendor/three.module.js')));
  assert.ok(fs.existsSync(path.join(root, 'public/vendor/three.core.js')));
});

test('every dom id the modules ask for is either in the shell or injected by a panel', () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const wanted = new Set();
  for (const f of files) {
    const src = read(f);
    // ids rendered into panel bodies at runtime count as existing
    for (const m of src.matchAll(/id="([a-zA-Z][\w-]*)"/g)) ids.add(m[1]);
    for (const m of src.matchAll(/(?:getElementById|\$|el)\(\s*'([a-zA-Z][\w-]*)'\s*\)/g)) wanted.add(m[1]);
  }
  const missing = [...wanted].filter((id) => !ids.has(id));
  assert.deepEqual(missing, [], `missing ids: ${missing.join(', ')}`);
});

test('the loading screen always offers a way out of a hostile frame', () => {
  // A preview iframe can refuse WebGL and still show a perfect loading bar. The
  // screen must therefore name the alternatives without waiting for a failure.
  assert.match(html, /id="escapeHatch"/, 'no escape hatch on the loading screen');
  assert.match(html, /href="\/standalone"[^>]*target="_blank"/, 'no link to the single-file build');
  assert.match(html, /href="\/download\/standalone\.html"/, 'no download link');
});

test('every relative import resolves to a file', () => {
  for (const f of files.concat(['public/js/core/world.js', 'public/js/core/quests.js'])) {
    const src = read(f);
    for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
      const target = path.resolve(path.dirname(path.join(root, f)), m[1]);
      assert.ok(fs.existsSync(target), `${f} imports missing ${m[1]}`);
    }
  }
});

test('no module reaches the network at startup', () => {
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /fetch\('https?:\/\//, `${f} hardcodes a remote URL`);
    assert.doesNotMatch(src, /cdn\.|unpkg|jsdelivr/, `${f} references a CDN`);
  }
});
