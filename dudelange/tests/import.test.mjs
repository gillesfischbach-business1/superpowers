/** The Google Maps dataset importer: filtering, classification, de-duplication. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(root, 'tests', 'fixtures', 'google-places-sample.json');

test('imports only Dudelange venues, splits known from new', () => {
  const out = execFileSync(process.execPath, [path.join(root, 'scripts', 'import-places.mjs'), fixture, '--json'], { encoding: 'utf8' });
  const report = JSON.parse(out.slice(out.indexOf('{')));
  assert.equal(report.read, 5, 'reads every row');
  assert.equal(report.inBbox, 4, 'drops the Esch venue');
  assert.equal(report.known, 2, 'Opa Café and Ebi Sushi already exist');
  assert.equal(report.fresh, 2, 'the panthères café and the kiosk are new');
  const kinds = report.pending.map((p) => p.kind).sort();
  assert.deepEqual(kinds, ['pub', 'shop']);
  const saved = JSON.parse(fs.readFileSync(path.join(root, 'data', 'imported', 'places.json'), 'utf8'));
  assert.ok(saved.every((p) => p.lat > 49.45 && p.lon < 6.13));
  const opa = saved.find((p) => p.name === 'Opa Café');
  assert.equal(opa.rating, 4.6);
  assert.ok(opa.openingHours?.length, 'keeps opening hours');
});
