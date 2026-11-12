import { loadWorld, writeReport, Gate } from './_lib.mjs';
import { closestOnPolyline, pointInPolygon } from '../public/js/core/geo.js';

console.log('Urbanist — cutting lots along the real street network');
const world = loadWorld();
const gate = new Gate('urbanist');

const perDistrict = {};
for (const b of world.buildings) perDistrict[b.district] = (perDistrict[b.district] || 0) + 1;
const onRail = world.buildings.filter((b) => closestOnPolyline(world.rail.points, b.x, b.z).dist < 9);
const inParks = world.buildings.filter((b) => {
  for (const z of world.protectedZones) {
    if ((z.id === 'parc_leh' || z.id === 'mont_st_jean' || z.id === 'kalebierg') && pointInPolygon(b.x, b.z, z.poly)) return true;
  }
  return false;
});
const overlaps = [];
for (let i = 0; i < world.buildings.length; i += 7) {
  const a = world.buildings[i];
  for (const b of world.buildings) {
    if (a === b) continue;
    if (Math.abs(a.x - b.x) < 1 && Math.abs(a.z - b.z) < 1) overlaps.push([a.id, b.id]);
  }
}
const commercial = world.buildings.filter((b) => b.shop).length;
// forests must be walkable: every trail starts near a street and is long enough to matter
const trails = world.forestPaths || [];
const trailMouths = trails.map((t) => closestOnPolyline(
  world.roads.flatMap((r) => r.samples).map((p) => ({ x: p.x, z: p.z })), t.samples[0].x, t.samples[0].z
).dist);
const shortTrails = trails.filter((t) => t.length < 140);
const trailsInTrees = trails.filter((t) => t.samples.some((p) => world.trees.some((tr) => Math.hypot(tr.x - p.x, tr.z - p.z) < 1.2)));
const cars = world.cars || [];
const carsInBuildings = cars.filter((c) => world.buildings.some((b) =>
  Math.hypot(b.x - c.x, b.z - c.z) < Math.min(b.w, b.d) / 2));

console.log(`  ${world.buildings.length} buildings · ${world.stats.roads} streets · ${world.stats.roadKm} km`);
console.log(`  ${trails.length} forest trails · ${world.clearings.length} glades · ${(world.undergrowth || []).length} undergrowth clumps`);
console.log(`  ${cars.length} parked cars (${cars.filter((c) => c.owned).length} owned)`);
for (const [k, v] of Object.entries(perDistrict)) console.log(`  ${k.padEnd(12)} ${String(v).padStart(4)} buildings`);

gate.check('building count within budget (400–1600)', world.buildings.length >= 400 && world.buildings.length <= 1600, String(world.buildings.length));
gate.check('no building on the rail corridor', onRail.length === 0, `${onRail.length} offenders`);
gate.check('no building inside parks or forest reserves', inParks.length === 0, `${inParks.length} offenders`);
gate.check('no duplicate lot positions', overlaps.length === 0, `${overlaps.length} pairs`);
gate.check('every main quarter is inhabited', ['centre', 'italien', 'burange', 'budersberg'].every((d) => (perDistrict[d] || 0) > 15), JSON.stringify(perDistrict));
gate.check('commercial ground floors exist', commercial > 80, `${commercial} shops`);
gate.check('street trees planted', world.trees.length > 700, `${world.trees.length} trees`);
gate.check('forest trails reach the woods', trails.length >= 4 && trailMouths.every((d) => d < 25), `${trails.length} trails`);
gate.check('trails are proper walks, not stubs', shortTrails.length === 0, `${Math.min(...trails.map((t) => Math.round(t.length)))} m shortest`);
gate.check('trails are cleared through the trees', trailsInTrees.length === 0, `${trailsInTrees.length} blocked trails`);
gate.check('woodland has undergrowth and glades', (world.undergrowth || []).length > 400 && world.clearings.length >= 3, `${(world.undergrowth || []).length} clumps · ${world.clearings.length} glades`);
gate.check('enough parked cars to steal', cars.length >= 20, `${cars.length} cars`);
gate.check('no car parked inside a building', carsInBuildings.length === 0, `${carsInBuildings.length} offenders`);

writeReport('urbanist.json', {
  agent: 'urbanist', buildings: world.buildings.length, perDistrict, commercial,
  roadKm: world.stats.roadKm, trees: world.trees.length,
  trails: trails.map((t) => ({ id: t.id, name: t.name, length: t.length })),
  clearings: world.clearings.length, undergrowth: (world.undergrowth || []).length,
  cars: cars.length,
  railClearance: +Math.min(...world.buildings.map((b) => closestOnPolyline(world.rail.points, b.x, b.z).dist)).toFixed(2),
  ...gate.finish()
});
