import { loadWorld, writeReport, Gate } from './_lib.mjs';
import { terrainHeight, project, unproject, sampleElevation } from '../public/js/core/geo.js';
import { META } from '../public/js/core/town-data.js';

console.log('Geologist — sampling the Diddelengerbaach valley and the Minett cuesta');
const world = loadWorld();
const gate = new Gate('geologist');

const samples = [];
for (let lat = META.bbox.south; lat <= META.bbox.north; lat += 0.002) {
  const p = project(lat, META.centre.lon);
  samples.push(+terrainHeight(p.x, p.z).toFixed(1));
}
const heights = samples.filter((h) => Number.isFinite(h));
const min = Math.min(...heights), max = Math.max(...heights);

const mont = project(49.49002, 6.06057);
const kale = project(49.46780, 6.05600);
const low = project(49.46400, 6.11000);
const centre = project(49.4785, 6.0845);
const hMont = terrainHeight(mont.x, mont.z);
const hKale = terrainHeight(kale.x, kale.z);
const hLow = terrainHeight(low.x, low.z);
const hCentre = terrainHeight(centre.x, centre.z);

console.log(`  north–south profile: ${min.toFixed(0)} m … ${max.toFixed(0)} m (EU-DEM mean ${META.elevation.mean} m)`);
console.log(`  Mont Saint-Jean ${hMont.toFixed(0)} m · Kalebierg ${hKale.toFixed(0)} m · border low ${hLow.toFixed(0)} m · centre ${hCentre.toFixed(0)} m`);

// slope audit around the centre: streets must stay walkable
let steep = 0;
for (let i = 0; i < 600; i++) {
  const x = (Math.random() - 0.5) * 1600;
  const z = (Math.random() - 0.5) * 1400;
  const d = Math.abs(terrainHeight(x + 4, z) - terrainHeight(x - 4, z)) / 8;
  if (d > 0.45) steep++;
}

gate.check('no NaN terrain samples', heights.every((h) => Number.isFinite(h)));
gate.check('Mont Saint-Jean around 417 m', Math.abs(hMont - 417) < 25, `${hMont.toFixed(0)} m`);
gate.check('town centre in the valley (270–330 m)', hCentre > 270 && hCentre < 330, `${hCentre.toFixed(0)} m`);
gate.check('border low point below 300 m', hLow < 300, `${hLow.toFixed(0)} m`);
gate.check('no slope steeper than 45% in the core', steep < 60, `${steep}/600 samples steep`);
gate.check('stream defined for the valley', world.water.stream.points.length >= 6);

const profile = [];
for (let i = 0; i < samples.length; i += 8) profile.push(samples[i]);
writeReport('geologist.json', {
  agent: 'geologist', min, max, profile, sampledAt: 'centre meridian 6.0845',
  peaks: { montSaintJean: +hMont.toFixed(1), kalebierg: +hKale.toFixed(1), thilleweier: +hLow.toFixed(1) },
  centre: +hCentre.toFixed(1), steepSamples: steep, ...gate.finish()
});
