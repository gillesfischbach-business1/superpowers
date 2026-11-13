import fs from 'node:fs';
import path from 'node:path';
import { loadWorld, writeReport, readReport, Gate, estimateWindows } from './_lib.mjs';
import { circleHitsBox, closestOnPolyline, terrainHeight } from '../public/js/core/geo.js';
import { ground, heightField } from '../public/js/core/heightfield.js';
import { INTERIORS } from '../public/js/core/interiors.js';
import { QUESTS } from '../public/js/core/quests.js';
import { parseHours, isOpenAt, describeStatus } from '../public/js/core/hours.js';
import { auditModuleGraph } from './_module-graph.mjs';

console.log('QA — the gatekeeper. Reachability, geometry, budgets, content.');
const gate = new Gate('qa');
const world = loadWorld();

const upstream = ['cartographer', 'geologist', 'urbanist', 'architect', 'rail', 'retail', 'systems'];
const reports = upstream.map((name) => ({ name, report: readReport(`${name}.json`) }));
const missing = reports.filter((r) => !r.report);
const failed = reports.filter((r) => r.report && r.report.passed === false);

// POIs must not sit inside an ordinary building
const blockedPois = world.pois.filter((poi) =>
  world.colliders.some((c) => circleHitsBox(poi.x, poi.z, 0.5, c))
);
// doors must be within 45 m of a street
const unreachableDoors = world.doors.filter((it) => world.functions.nearRoad(it.x, it.z, 80) > 45);
// spawn on solid ground, not in a wall
const spawnBlocked = world.colliders.some((c) => circleHitsBox(world.spawn.x, world.spawn.z, 0.8, c));
// geometry sanity
let nan = 0;
for (const b of world.buildings) if (![b.x, b.z, b.h, b.baseY].every(Number.isFinite)) nan++;
for (const t of world.trees) if (![t.x, t.z, t.y].every(Number.isFinite)) nan++;
const heights = world.landmarks.map((l) => terrainHeight(l.x, l.z));
const windows = estimateWindows(world.buildings);
const instanceBudget = windows + world.trees.length + world.props.length + world.buildings.length * 3;

// content
const interiorIds = new Set(Object.keys(INTERIORS));
const badInteriorRefs = world.landmarks.filter((l) => l.interior && !interiorIds.has(l.interior));
const questProblems = QUESTS.filter((q) => !q.title || !q.desc || !(q.money >= 0) || !(q.xp > 0));

// the browser bundle: a missing export is a blank page, not a warning
const graph = auditModuleGraph();
const html = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8');
const entryInHtml = /<script[^>]*type="module"[^>]*src="\/js\/game\/main\.js"/.test(html);

// a day in the life: the town has to work at noon and at midnight
const venues = Object.entries(INTERIORS);
const badHours = venues.filter(([, spec]) => !spec.hours || !parseHours(spec.hours).ok);
const openNoon = venues.filter(([, spec]) => isOpenAt(parseHours(spec.hours), 2, 12 * 60));
const openLate = venues.filter(([, spec]) => isOpenAt(parseHours(spec.hours), 5, 23 * 60));
const sampleClosed = venues.find(([, spec]) => /off/.test(spec.hours) || !isOpenAt(parseHours(spec.hours), 1, 4 * 60));

// station sanity
const badStations = world.rail.stations.filter((s) => !(s.platformY > s.elevation));
const chainages = world.rail.stations.map((s) => s.railDist);
const orderedChainages = chainages.every((c, i) => i === 0 || c > chainages[i - 1]);
const chainageSpread = Math.max(...chainages) - Math.min(...chainages);

// the ground the town is built on: streets cannot climb over hills, and houses
// must not hang in the air. Both were true before the height field existed.
// the baked lattice the renderer draws: it must exist, be finite, and cover the
// ground the player can walk on
const field = heightField();
let fieldBad = 0;
if (field) for (const h of field.heights) if (!Number.isFinite(h)) fieldBad++;

// streets climb, but nothing in this town is a ski jump
let steepest = 0;
let steepestRoad = '';
for (const r of world.roads) {
  for (let i = 1; i < r.samples.length; i++) {
    const a = r.samples[i - 1], b = r.samples[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.5) continue;
    const grade = Math.abs(ground(b.x, b.z) - ground(a.x, a.z)) / len;
    if (grade > steepest) { steepest = grade; steepestRoad = r.name; }
  }
}

const floatingHouses = [];
const buriedHouses = [];
for (const b of world.buildings) {
  const cos = Math.cos(b.rot), sin = Math.sin(b.rot);
  let lo = Infinity;
  for (const [lx, lz] of [[-b.w / 2, -b.d / 2], [b.w / 2, -b.d / 2], [-b.w / 2, b.d / 2], [b.w / 2, b.d / 2]]) {
    lo = Math.min(lo, ground(b.x + lx * cos + lz * sin, b.z - lx * sin + lz * cos));
  }
  if (b.baseY > lo + 0.02) floatingHouses.push(b.id);
  if (lo - b.baseY > 2.5) buriedHouses.push(b.id);
}

console.log(`  upstream reports ${reports.length - missing.length}/${reports.length} · failed ${failed.length}`);
console.log(`  ${world.pois.length} POIs · ${world.doors.length} doors · ${Object.keys(INTERIORS).length} interiors`);
console.log(`  ${world.cars.length} cars · ${(world.forestPaths || []).length} trails · ${world.clearings.length} glades`);
console.log(`  client bundle: ${graph.modules.length} modules · ${graph.problems.length} broken imports · ${graph.cycles.length} cycles · entry ${entryInHtml ? 'wired' : 'MISSING'}`);
console.log(`  hours: ${openNoon.length}/${venues.length} open Tue noon · ${openLate.length} open Fri 23:00 · ${badHours.length} unparseable`);
console.log(`  instances: ${windows} windows, ${world.trees.length} trees, ${world.props.length} props → budget ${instanceBudget}`);

gate.check('every upstream report exists', missing.length === 0, missing.map((m) => m.name).join(', '));
gate.check('every upstream stage passed', failed.length === 0, failed.map((f) => f.name).join(', '));
gate.check('no POI is buried inside a building', blockedPois.length === 0, blockedPois.map((p) => p.name).join(', '));
gate.check('every entrance is reachable from a street', unreachableDoors.length === 0, `${unreachableDoors.length} isolated`);
gate.check('spawn point is clear', !spawnBlocked);
gate.check('no NaN geometry', nan === 0, `${nan} bad values`);
gate.check('landmark heights are sane (240–460 m)', heights.every((h) => h > 240 && h < 460), `${Math.min(...heights).toFixed(0)}–${Math.max(...heights).toFixed(0)} m`);
gate.check('instance budget under 90k', instanceBudget < 90000, String(instanceBudget));
gate.check('all landmark interiors exist', badInteriorRefs.length === 0, badInteriorRefs.map((l) => l.id).join(', '));
const pubsInWorld = world.landmarks.filter((l) => l.kind === 'pub');
const pubDoors = world.doors.filter((d) => pubsInWorld.some((l) => l.id === d.id));
const railDanger = world.cars.filter((c) => closestOnPolyline(world.rail.points, c.x, c.z).dist < 12);
const badCars = world.cars.filter((c) => !c.color || !c.district || !Number.isFinite(c.x) || !Number.isFinite(c.z));
const trailsOffMap = (world.forestPaths || []).filter((t) => t.samples.some((p) => Math.abs(p.x) > 3200 || Math.abs(p.z) > 3200));

gate.check('stations are spread along the line, not stacked at zero', orderedChainages && chainageSpread > 1000, `${chainageSpread.toFixed(0)} m of ${world.rail.length.toFixed(0)} m`);
gate.check('the height field covers the whole map', !!field && fieldBad === 0 && field.width > 8000,
  field ? `${(field.width / 1000).toFixed(1)} × ${(field.depth / 1000).toFixed(1)} km, ${fieldBad} bad` : 'missing');
gate.check('no street climbs steeper than 30%', steepest < 0.30, `steepest ${(steepest * 100).toFixed(0)}% (${steepestRoad})`);
gate.check('no house hangs above the ground', floatingHouses.length === 0, `${floatingHouses.length} floating`);
gate.check('no house is buried in a hillside', buriedHouses.length === 0, `${buriedHouses.length} buried`);
gate.check('quest content is complete', questProblems.length === 0, `${QUESTS.length} quests`);
gate.check('every pub has a door on the street', pubsInWorld.length >= 3 && pubDoors.length === pubsInWorld.length, `${pubDoors.length}/${pubsInWorld.length} pubs`);
gate.check('no car is parked on the rail line', railDanger.length === 0, `${railDanger.length} on the tracks`);
gate.check('every car has a colour, a quarter and finite coordinates', badCars.length === 0, `${world.cars.length} cars`);
gate.check('forest trails stay inside the world bounds', trailsOffMap.length === 0, `${(world.forestPaths || []).length} trails`);
gate.check('station platforms sit above the rail bed', badStations.length === 0);
gate.check('every client import resolves to a real export', graph.problems.length === 0, graph.problems.join(' · ') || `${graph.modules.length} modules`);
gate.check('the page loads the whole client bundle', entryInHtml && graph.modules.length >= 12, `${graph.modules.length} modules reachable`);
gate.check('the client bundle has no import cycles', graph.cycles.length === 0, graph.cycles.join(' · ') || 'none');
gate.check('every visitable interior runs on a real schedule', badHours.length === 0, badHours.map(([id, spec]) => `${id}: ${spec.hours}`).join(', ') || `${venues.length} venues`);
gate.check('the town is open at lunchtime', openNoon.length >= 10, `${openNoon.length} open Tue 12:00`);
gate.check('the town is alive after dark', openLate.length >= 5, `${openLate.length} open Fri 23:00`);
gate.check('every notice is human readable', sampleClosed ? /open|closed/.test(describeStatus(parseHours(sampleClosed[1].hours), 1, 4 * 60)) : true, sampleClosed ? `${sampleClosed[0]}: ${describeStatus(parseHours(sampleClosed[1].hours), 1, 4 * 60)}` : '—');
gate.check('enough content for a session (buildings > 500, trees > 800)', world.buildings.length > 500 && world.trees.length > 800);

const result = writeReport('qa.json', {
  agent: 'qa', clientModules: graph.modules.length, hours: { openNoon: openNoon.length, openLate: openLate.length, venues: venues.length }, upstream: reports.map((r) => ({ name: r.name, passed: r.report?.passed ?? false })),
  blockedPois: blockedPois.map((p) => p.name), unreachableDoors: unreachableDoors.length,
  nan, instanceBudget, spawnBlocked, quests: QUESTS.length,
  cars: world.cars.length, pubs: pubsInWorld.length, trails: (world.forestPaths || []).length,
  interiors: Object.keys(INTERIORS).length, ...gate.finish()
});
console.log(`  QA wrote ${path.basename(result)}`);
