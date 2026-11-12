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

console.log(`  ${world.buildings.length} buildings · ${world.stats.roads} streets · ${world.stats.roadKm} km`);
for (const [k, v] of Object.entries(perDistrict)) console.log(`  ${k.padEnd(12)} ${String(v).padStart(4)} buildings`);

gate.check('building count within budget (400–1600)', world.buildings.length >= 400 && world.buildings.length <= 1600, String(world.buildings.length));
gate.check('no building on the rail corridor', onRail.length === 0, `${onRail.length} offenders`);
gate.check('no building inside parks or forest reserves', inParks.length === 0, `${inParks.length} offenders`);
gate.check('no duplicate lot positions', overlaps.length === 0, `${overlaps.length} pairs`);
gate.check('every main quarter is inhabited', ['centre', 'italien', 'burange', 'budersberg'].every((d) => (perDistrict[d] || 0) > 15), JSON.stringify(perDistrict));
gate.check('commercial ground floors exist', commercial > 80, `${commercial} shops`);
gate.check('street trees planted', world.trees.length > 700, `${world.trees.length} trees`);

writeReport('urbanist.json', {
  agent: 'urbanist', buildings: world.buildings.length, perDistrict, commercial,
  roadKm: world.stats.roadKm, trees: world.trees.length,
  railClearance: +Math.min(...world.buildings.map((b) => closestOnPolyline(world.rail.points, b.x, b.z).dist)).toFixed(2),
  ...gate.finish()
});
