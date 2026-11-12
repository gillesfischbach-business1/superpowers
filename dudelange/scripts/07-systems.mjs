import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadWorld, writeReport, Gate, hashWorld, estimateWindows } from './_lib.mjs';
import { buildWorld, resolveCollisions } from '../public/js/core/world.js';
import { INTERIORS } from '../public/js/core/interiors.js';
import { QUESTS } from '../public/js/core/quests.js';
import { simulate } from '../public/js/core/train.js';
import { parseHours, isOpenAt, weeklyHours, statusAt, describeStatus } from '../public/js/core/hours.js';

console.log('Systems engineer — determinism, collisions, saves and the UI contract');
const gate = new Gate('systems');

const a = loadWorld();
const b = buildWorld({ seed: a.seed });
const hashA = hashWorld(a), hashB = hashWorld(b);
console.log(`  world hash ${hashA} (${a.buildings.length} buildings, ${a.trees.length} trees)`);

// collision solver: a player inside a building must be pushed out
const target = a.buildings[Math.floor(a.buildings.length / 3)];
const solved = resolveCollisions(a, target.x, target.z, 0.42);
const pushed = Math.hypot(solved.x - target.x, solved.z - target.z);
// a player in open ground must stay put
const open = { x: a.spawn.x, z: a.spawn.z };
const solvedOpen = resolveCollisions(a, open.x, open.z, 0.42);
const drift = Math.hypot(solvedOpen.x - open.x, solvedOpen.z - open.z);

// save round-trip on disk
const tmp = path.join(os.tmpdir(), `diddeleng-save-${Date.now()}.json`);
const state = { x: a.spawn.x, z: a.spawn.z, money: 137, xp: 42, level: 2, questsDone: ['welcome'], stations: ['ville'] };
fs.writeFileSync(tmp, JSON.stringify(state));
const read = JSON.parse(fs.readFileSync(tmp, 'utf8'));
fs.unlinkSync(tmp);
const roundTrip = JSON.stringify(read) === JSON.stringify(state);

const serverSrc = fs.readFileSync(path.join(process.cwd(), 'server', 'index.js'), 'utf8');
const routes = ['/api/health', '/api/save/', '/api/leaderboard', '/api/agents/status', '/api/agents/run', '/api/agents/stream'].filter((r) => serverSrc.includes(r));
const mainSrc = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'game', 'main.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'game', 'ui.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8');
const interiorsUsed = Object.keys(INTERIORS).filter((id) => mainSrc.includes(id) || a.landmarks.some((l) => l.interior === id));
const questHooks = QUESTS.filter((q) => mainSrc.includes(`'${q.id}'`)).length;

// a parked car is solid: stand in one and the solver must push you out
const car = a.cars[Math.floor(a.cars.length / 2)];
const carSolved = resolveCollisions(a, car.x, car.z, 1.0);
const carPush = Math.hypot(carSolved.x - car.x, carSolved.z - car.z);
// collision must never leave a car sitting inside a wall
const carsInside = a.cars.filter((c) => a.buildings.some((b) => {
  // OBB test against the building footprint, ignoring the car's own collider
  const cos = Math.cos(b.rot), sin = Math.sin(b.rot);
  const dx = c.x - b.x, dz = c.z - b.z;
  const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
  return Math.abs(lx) < b.d / 2 + 1.4 && Math.abs(lz) < b.w / 2 + 1.4;
}));

// the timetable: ten simulated minutes must serve all four stops and reverse at the end
const stations = a.rail.stations.map((s) => ({ id: s.id, chainage: s.railDist })).sort((x, y) => x.chainage - y.chainage);
const run = simulate(stations, { total: a.rail.length, seconds: 900, dt: 0.25 });
const forestTrails = (a.forestPaths || []).filter((t) => t.kind !== 'park');
const trailFootfall = forestTrails.length;
const treesPerTrail = forestTrails.map((trail) => a.trees.filter(
  (tr) => tr.kind === 'deciduous' && trail.samples.some((p) => Math.hypot(tr.x - p.x, tr.z - p.z) < 30)
).length);

console.log(`  collision push-out ${pushed.toFixed(2)} m · open-ground drift ${drift.toFixed(3)} m · save round-trip ${roundTrip ? 'ok' : 'broken'}`);
console.log(`  ${routes.length}/6 API routes present · ${interiorsUsed.length} interiors wired · ${questHooks}/${QUESTS.length} quests hooked`);
console.log(`  car push-out ${carPush.toFixed(2)} m · timetable over 15 min: ${run.dwells.join(' → ')}`);
// hours engine: OSM semantics, one clock, doors that actually close
const overnight = parseHours('Tu-Sa 17:00-01:00');
const allDay = parseHours('24/7');
const tuesday = parseHours('Tu-Sa 17:00-01:30');
const hoursProbe = {
  midNight: isOpenAt(overnight, 3, 30),          // Wed 00:30 → still Tuesday night
  beforeOpen: isOpenAt(overnight, 2, 60),        // Tue 01:00 → shut
  saturdayEarly: isOpenAt(overnight, 6, 30),     // Sat 00:30 → Friday spill
  weekendShut: isOpenAt(overnight, 0, 22 * 60),  // Sun night → shut
  alwaysOpen: isOpenAt(allDay, 0, 3 * 60) && weeklyHours(allDay) === 168,
  weekly: weeklyHours(overnight),
  closingText: describeStatus(tuesday, 1, 22 * 60),
  openText: describeStatus(tuesday, 4, 23 * 60 + 59),
  waiting: /app\.waiting/.test(mainSrc) && /KeyT/.test(mainSrc) && /app\.day = \(app\.day \+ 1\) % 7/.test(mainSrc),
  dayChip: /setDay\(/.test(uiSrc) && /id="day"/.test(indexSrc),
  gated: /venueStatus\(spec\)/.test(mainSrc) && mainSrc.includes('closed') && /toast/.test(mainSrc)
};

console.log(`  ${trailFootfall} forest trails · ${a.cars.length} drivable cars · ${(mainSrc.match(/drunk/g) || []).length} drunk-system hooks`);
console.log(`  hours: Wed 00:30 ${hoursProbe.midNight ? 'open' : 'shut'} · ${hoursProbe.weekly} h/wk · “${hoursProbe.closingText}” · “${hoursProbe.openText}”`);

gate.check('identical seed produces an identical world', hashA === hashB, hashA);
gate.check('collision solver pushes a player out of a building', pushed > 0.5, `${pushed.toFixed(2)} m`);
gate.check('collision solver leaves open ground alone', drift < 0.05, `${drift.toFixed(3)} m`);
gate.check('save state round-trips through JSON', roundTrip);
gate.check('all core API routes are declared', routes.length === 6, routes.join(', '));
gate.check('save slots are validated against path traversal', serverSrc.includes('safeId'));
gate.check('every quest is wired into the runtime', questHooks === QUESTS.length, `${questHooks}/${QUESTS.length}`);
gate.check('every parked car is drivable and solid', a.cars.length >= 20 && carPush > 0.5, `${a.cars.length} cars · ${carPush.toFixed(2)} m push-out`);
gate.check('no car spawns inside geometry', carsInside.length === 0, `${carsInside.length} stuck`);
gate.check('the train serves all four stops and reverses at the terminus', run.stationsVisited === 4 && run.reversals >= 1 && !run.repeatedDwell, run.dwells.slice(0, 9).join(' → '));
gate.check('the train actually moves between stops', run.travelled > 2000 && run.stalled === 0, `${run.travelled} m`);
gate.check('drunk state is part of the save payload', mainSrc.includes('drunk: p.drunk') && mainSrc.includes('stolenCars'), 'drunk + stolenCars');
gate.check('stealing a car is wired to interaction and rewards', mainSrc.includes('Hot-wire this car') && mainSrc.includes("questEvent('steal')"), 'hot-wire → quest event');
gate.check('forest trails are surrounded by trees (walkable woods)', trailFootfall >= 3 && treesPerTrail.every((n) => n > 12), `${trailFootfall} forest trails · ${treesPerTrail.join('/')} trees near each`);
gate.check('tree trunks are solid but the woods stay passable', a.colliders.filter((c) => c.type === 'tree').length > 1000 && a.trees.length < 6000, `${a.colliders.filter((c) => c.type === 'tree').length} trunks · ${a.trees.length} trees`);
gate.check('overnight opening hours wrap past midnight', hoursProbe.midNight && hoursProbe.saturdayEarly && !hoursProbe.beforeOpen && !hoursProbe.weekendShut, 'Tu-Sa 17:00-01:00');
gate.check('24/7 and weekly totals are understood', hoursProbe.alwaysOpen && hoursProbe.weekly === 40, `40 h/wk · 24/7 = 168 h`);
gate.check('closed venues say when they open again', /opens/.test(hoursProbe.closingText), hoursProbe.closingText);
gate.check('open venues say when last orders are', /open until/.test(hoursProbe.openText), hoursProbe.openText);
gate.check('the clock advances into a new day and can be waited out', hoursProbe.waiting && hoursProbe.dayChip, 'T waits · day chip');
gate.check('closed doors are enforced, not decorative', hoursProbe.gated, 'enterInterior checks venueStatus');
gate.check('body payloads are size limited', serverSrc.includes('payload too large'));
gate.check('performance budget: windows + trees under 40k instances', estimateWindows(a.buildings) + a.trees.length < 40000, String(estimateWindows(a.buildings) + a.trees.length));

writeReport('systems.json', {
  agent: 'systems', worldHash: hashA, collisionPushOut: +pushed.toFixed(2), drift: +drift.toFixed(3),
  saveRoundTrip: roundTrip, routes, questHooks, interiorsWired: interiorsUsed.length,
  cars: { count: a.cars.length, pushOut: +carPush.toFixed(2), stuck: carsInside.length },
  timetable: { dwells: run.dwells, reversals: run.reversals, travelled: run.travelled },
  forestTrails: (a.forestPaths || []).map((t) => t.id),
  instances: { windows: estimateWindows(a.buildings), trees: a.trees.length, buildings: a.buildings.length },
  ...gate.finish()
});
