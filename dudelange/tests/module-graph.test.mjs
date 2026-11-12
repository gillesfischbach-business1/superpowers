import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { auditModuleGraph, exportsOf } from '../scripts/_module-graph.mjs';

const indexHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8');

test('every import in the browser bundle resolves to a real export', () => {
  const graph = auditModuleGraph();
  assert.equal(graph.problems.length, 0, graph.problems.join('\n'));
  assert.ok(graph.modules.length >= 12, `only ${graph.modules.length} modules reachable from main.js`);
});

test('the page loads exactly the entry module the audit walks', () => {
  const scripts = [...indexHtml.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['/js/game/main.js']);
  const graph = auditModuleGraph();
  assert.ok(graph.modules.includes(path.join('public', 'js', 'game', 'main.js')));
});

test('the import map covers every bare specifier the client uses', () => {
  const map = indexHtml.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(map, 'index.html needs an import map');
  const { imports } = JSON.parse(map[1]);
  assert.equal(imports.three, '/vendor/three.module.js');
  for (const [spec, target] of Object.entries(imports)) {
    const file = path.join(process.cwd(), 'public', target);
    assert.ok(fs.existsSync(file), `${spec} → ${target} is missing`);
    assert.ok(fs.statSync(file).size > 100000, `${spec} → ${target} looks truncated`);
  }

  const graph = auditModuleGraph();
  const bare = new Set();
  for (const mod of graph.modules) {
    const src = fs.readFileSync(path.join(process.cwd(), mod), 'utf8');
    for (const m of src.matchAll(/from\s+['"]([^'"./][^'"]*)['"]/g)) bare.add(m[1]);
  }
  for (const spec of bare) assert.ok(imports[spec], `bare import "${spec}" has no import-map entry`);
});

test('the client bundle has no import cycles', () => {
  const graph = auditModuleGraph();
  assert.equal(graph.cycles.length, 0, graph.cycles.join('\n'));
});

test('modules that ship with the page export what they promise', () => {
  // a named import is only half the contract: the export has to be non-empty too
  for (const mod of ['public/js/core/geo.js', 'public/js/core/world.js', 'public/js/core/hours.js', 'public/js/game/ui.js']) {
    const src = fs.readFileSync(path.join(process.cwd(), mod), 'utf8');
    const names = exportsOf(src);
    assert.ok(names.size > 0, `${mod} exports nothing`);
    assert.ok(!/export\s*\{\s*\}/.test(src), `${mod} has an empty export list`);
  }
});
