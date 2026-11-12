import { writeReport, Gate } from './_lib.mjs';
import { INTERIORS } from '../public/js/core/interiors.js';

console.log('Retail & hospitality — stocking shops and writing menus');
const gate = new Gate('retail');

const shops = Object.entries(INTERIORS).filter(([, s]) => s.kind === 'shop');
const menus = Object.entries(INTERIORS).filter(([, s]) => s.kind === 'restaurant');
const allItems = [];
for (const [id, spec] of [...shops, ...menus]) {
  for (const item of spec.shop?.items || []) allItems.push({ ...item, vendor: id });
}
const badPrices = allItems.filter((i) => !(i.price > 0) || !i.name);
const lux = ['gromperekichelcher', 'kachkeis', 'bouneschlupp', 'judd', 'viez', 'bofferding', 'diekirch', 'rieslingspascht', 'kugelhopf', 'mettwurst'];
const foundLux = allItems.filter((i) => lux.includes(i.id));
const prices = allItems.map((i) => i.price);
const avg = prices.reduce((s, p) => s + p, 0) / prices.length;

console.log(`  ${shops.length} supermarkets · ${menus.length} restaurants · ${allItems.length} purchasable lines`);
console.log(`  Luxembourgish specialities on shelves: ${foundLux.map((i) => i.name).join(', ')}`);

const delhaize = INTERIORS.delhaize;
const questIds = ['bread', 'milk', 'kachkeis'];
gate.check('three visitable supermarkets', shops.length >= 3, shops.map(([id]) => id).join(', '));
gate.check('eight or more restaurants', menus.length >= 8, menus.map(([id]) => id).join(', '));
gate.check('every item has a name and a positive price', badPrices.length === 0, `${badPrices.length} bad`);
gate.check('Delhaize stocks every quest item', questIds.every((id) => delhaize.shop.items.some((i) => i.id === id)), questIds.join(', '));
gate.check('at least six Luxembourgish products', foundLux.length >= 6, `${foundLux.length}`);
gate.check('menu prices are plausible (€1–€40)', prices.every((p) => p >= 1 && p <= 40), `avg €${avg.toFixed(2)}`);
gate.check('no duplicate item ids across vendors', new Set(allItems.map((i) => i.vendor + i.id)).size === allItems.length);

writeReport('retail.json', {
  agent: 'retail-hospitality', supermarkets: shops.length, restaurants: menus.length,
  items: allItems.length, averagePrice: +avg.toFixed(2), luxembourgish: foundLux.map((i) => i.name),
  catalogue: allItems, ...gate.finish()
});
