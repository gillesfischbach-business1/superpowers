import { writeReport, Gate } from './_lib.mjs';
import { INTERIORS } from '../public/js/core/interiors.js';
import { parseHours, isOpenAt, weeklyHours } from '../public/js/core/hours.js';

console.log('Retail & hospitality — stocking shops and writing menus');
const gate = new Gate('retail');

const shops = Object.entries(INTERIORS).filter(([, s]) => s.kind === 'shop');
const menus = Object.entries(INTERIORS).filter(([, s]) => s.kind === 'restaurant');
const pubs = Object.entries(INTERIORS).filter(([, s]) => s.kind === 'pub');
const drinks = [];
for (const [id, spec] of pubs) for (const item of spec.shop?.items || []) drinks.push({ ...item, vendor: id });
const alcoholic = drinks.filter((d) => d.booze > 0);
const soft = drinks.filter((d) => !(d.booze > 0));
const badBooze = drinks.filter((d) => !Number.isFinite(d.booze) || d.booze < 0 || d.booze > 0.45);
const pubBadPrices = drinks.filter((d) => !(d.price > 0) || !d.name);

// opening hours: every venue, parsed with the same engine the game runs
const venues = Object.entries(INTERIORS).map(([id, spec]) => ({
  id, kind: spec.kind, hours: spec.hours, src: spec.hoursSrc, parsed: parseHours(spec.hours)
}));
const missingHours = venues.filter((v) => !v.hours || !v.parsed.ok);
const implausible = venues.filter((v) => v.parsed.ok && (weeklyHours(v.parsed) < 20 || weeklyHours(v.parsed) > 168));
const unprovenanced = venues.filter((v) => !['web', 'typical'].includes(v.src));
const latePubs = pubs.filter(([id]) => isOpenAt(parseHours(INTERIORS[id].hours), 5, 23 * 60));
const afterTwo = pubs.filter(([id]) => isOpenAt(parseHours(INTERIORS[id].hours), 6, 2 * 60 + 30));
const shopsSunday = shops.filter(([id]) => isOpenAt(parseHours(INTERIORS[id].hours), 0, 15 * 60));
const allItems = [];
for (const [id, spec] of [...shops, ...menus]) {
  for (const item of spec.shop?.items || []) allItems.push({ ...item, vendor: id });
}
const badPrices = allItems.filter((i) => !(i.price > 0) || !i.name);
const lux = ['gromperekichelcher', 'kachkeis', 'bouneschlupp', 'judd', 'viez', 'bofferding', 'diekirch', 'rieslingspascht', 'kugelhopf', 'mettwurst'];
const foundLux = allItems.filter((i) => lux.includes(i.id));
const prices = allItems.map((i) => i.price);
const avg = prices.reduce((s, p) => s + p, 0) / prices.length;

console.log(`  ${shops.length} supermarkets · ${menus.length} restaurants · ${pubs.length} pubs · ${allItems.length} purchasable lines`);
console.log(`  ${alcoholic.length} alcoholic drinks · ${soft.length} soft options · strongest ${Math.max(...drinks.map((d) => d.booze)).toFixed(2)}`);
console.log(`  hours: ${venues.length - missingHours.length}/${venues.length} venues parse · ${latePubs.length} pubs open Friday 23:00 · ${afterTwo.length} after 02:30`);
console.log(`  ${shopsSunday.length} of ${shops.length} shops open Sunday afternoon (Luxembourg keeps Sunday trading short)`);
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
gate.check('three or more visitable pubs', pubs.length >= 3, pubs.map(([id]) => id).join(', '));
gate.check('every pub pours something alcoholic and something soft', pubs.every(([id]) => drinks.some((d) => d.vendor === id && d.booze > 0) && drinks.some((d) => d.vendor === id && !(d.booze > 0))), `${alcoholic.length} alcoholic / ${soft.length} soft`);
gate.check('drink strength is on a sane 0–0.45 scale', badBooze.length === 0, badBooze.length ? badBooze.map((d) => d.id).join(', ') : 'all within range');
gate.check('pub prices are plausible (€1–€15)', pubBadPrices.length === 0 && drinks.every((d) => d.price <= 15), `max €${Math.max(...drinks.map((d) => d.price)).toFixed(2)}`);
gate.check('every venue publishes parseable opening hours', missingHours.length === 0, missingHours.length ? missingHours.map((v) => `${v.id}: ${v.parsed.errors[0]}`).join(', ') : `${venues.length} venues`);
gate.check('opening hours are plausible (20–168 h per week)', implausible.length === 0, implausible.map((v) => `${v.id} ${weeklyHours(v.parsed).toFixed(0)}h`).join(', ') || `between ${Math.min(...venues.map((v) => weeklyHours(v.parsed))).toFixed(0)} and 168 h`);
gate.check('the source of every schedule is declared', unprovenanced.length === 0, unprovenanced.map((v) => v.id).join(', ') || 'web / typical');
gate.check('the town has nightlife', latePubs.length >= 5, `${latePubs.length} pubs open Friday 23:00`);
gate.check('late licences run past 02:30 at the weekend', afterTwo.length >= 2, afterTwo.map(([id]) => id).join(', '));
gate.check('shops respect Luxembourg Sunday trading', shopsSunday.length === 0, `${shopsSunday.length} open Sunday 15:00`);

writeReport('retail.json', {
  agent: 'retail-hospitality', supermarkets: shops.length, restaurants: menus.length,
  items: allItems.length, averagePrice: +avg.toFixed(2), luxembourgish: foundLux.map((i) => i.name),
  pubs: pubs.map(([id, spec]) => ({
    id, name: spec.shop.title,
    alcoholic: (spec.shop.items || []).filter((d) => d.booze > 0).length,
    soft: (spec.shop.items || []).filter((d) => !(d.booze > 0)).length
  })), strongestDrink: +Math.max(...drinks.map((d) => d.booze)).toFixed(2),
  catalogue: allItems, ...gate.finish()
});
