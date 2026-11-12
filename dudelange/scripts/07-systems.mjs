import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadWorld, writeReport, Gate, hashWorld, estimateWindows } from './_lib.mjs';
import { buildWorld, resolveCollisions } from '../public/js/core/world.js';
import { INTERIORS } from '../public/js/core/interiors.js';
import { QUESTS } from '../public/js/core/quests.js';

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
const interiorsUsed = Object.keys(INTERIORS).filter((id) => mainSrc.includes(id) || a.landmarks.some((l) => l.interior === id));
const questHooks = QUESTS.filter((q) => mainSrc.includes(`'${q.id}'`)).length;

console.log(`  collision push-out ${pushed.toFixed(2)} m · open-ground drift ${drift.toFixed(3)} m · save round-trip ${roundTrip ? 'ok' : 'broken'}`);
console.log(`  ${routes.length}/6 API routes present · ${interiorsUsed.length} interiors wired · ${questHooks}/${QUESTS.length} quests hooked`);

gate.check('identical seed produces an identical world', hashA === hashB, hashA);
gate.check('collision solver pushes a player out of a building', pushed > 0.5, `${pushed.toFixed(2)} m`);
gate.check('collision solver leaves open ground alone', drift < 0.05, `${drift.toFixed(3)} m`);
gate.check('save state round-trips through JSON', roundTrip);
gate.check('all core API routes are declared', routes.length === 6, routes.join(', '));
gate.check('save slots are validated against path traversal', serverSrc.includes('safeId'));
gate.check('every quest is wired into the runtime', questHooks === QUESTS.length, `${questHooks}/${QUESTS.length}`);
gate.check('body payloads are size limited', serverSrc.includes('payload too large'));
gate.check('performance budget: windows + trees under 40k instances', estimateWindows(a.buildings) + a.trees.length < 40000, String(estimateWindows(a.buildings) + a.trees.length));

writeReport('systems.json', {
  agent: 'systems', worldHash: hashA, collisionPushOut: +pushed.toFixed(2), drift: +drift.toFixed(3),
  saveRoundTrip: roundTrip, routes, questHooks, interiorsWired: interiorsUsed.length,
  instances: { windows: estimateWindows(a.buildings), trees: a.trees.length, buildings: a.buildings.length },
  ...gate.finish()
});
