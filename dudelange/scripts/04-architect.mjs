import { loadWorld, writeReport, Gate, estimateWindows } from './_lib.mjs';
import { INTERIORS } from '../public/js/core/interiors.js';

console.log('Architect — facades, roofscapes and furnished interiors');
const world = loadWorld();
const gate = new Gate('architect');

const styles = {};
for (const b of world.buildings) styles[b.style] = (styles[b.style] || 0) + 1;
const roofs = {};
for (const b of world.buildings) roofs[b.roofType] = (roofs[b.roofType] || 0) + 1;
const shops = world.buildings.filter((b) => b.shop).length;
const windows = estimateWindows(world.buildings);

const interiors = Object.entries(INTERIORS);
const shopsI = interiors.filter(([, s]) => s.kind === 'shop');
const restaurants = interiors.filter(([, s]) => s.kind === 'restaurant');
const problems = [];
for (const [id, spec] of interiors) {
  if (!spec.size || !spec.palette) problems.push(`${id}: missing size/palette`);
  if (!spec.layout || !spec.layout.npcAt || !spec.layout.exitAt || !spec.layout.playerAt) problems.push(`${id}: incomplete layout`);
  if (!spec.npc || !spec.npc.name) problems.push(`${id}: missing NPC`);
  if (spec.kind === 'shop' && (!spec.shop || !spec.shop.items || spec.shop.items.length < 5)) problems.push(`${id}: under-stocked`);
  if (spec.kind === 'restaurant' && (!spec.shop || spec.shop.items.length < 3)) problems.push(`${id}: menu too short`);
}

console.log(`  ${Object.keys(styles).length} architectural styles · ${windows.toLocaleString('en')} windows · ${shops} shopfronts`);
console.log(`  interiors: ${interiors.length} (${shopsI.length} shops, ${restaurants.length} restaurants)`);
Object.entries(styles).forEach(([k, v]) => console.log(`    ${k.padEnd(12)} ${String(v).padStart(4)}`));

gate.check('at least 6 distinct building styles', Object.keys(styles).length >= 6, Object.keys(styles).join(', '));
gate.check('window grid under 60k instances', windows < 60000, `${windows}`);
gate.check('at least 15 visitable interiors', interiors.length >= 15, `${interiors.length}`);
gate.check('every interior is complete', problems.length === 0, problems.join('; '));
gate.check('at least 3 supermarkets', shopsI.length >= 3, shopsI.map(([id]) => id).join(', '));
gate.check('at least 8 restaurants', restaurants.length >= 8, `${restaurants.length}`);
gate.check('gabled roofs dominate the residential quarters', (roofs.gable || 0) > world.buildings.length * 0.5, JSON.stringify(roofs));

writeReport('architect.json', {
  agent: 'architect', styles, roofs, windows, shopfronts: shops,
  interiors: interiors.map(([id, s]) => ({ id, kind: s.kind, size: s.size, npc: s.npc.name, items: s.shop ? s.shop.items.length : 0 })),
  problems, ...gate.finish()
});
