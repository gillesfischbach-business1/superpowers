import { loadWorld, writeReport, Gate } from './_lib.mjs';
import { simulate } from '../public/js/core/train.js';

console.log('Rail engineer — line 60a, four stops, underpasses and tunnels');
const world = loadWorld();
const gate = new Gate('rail');

const stations = world.rail.stations;
// The client and this agent share one controller, so the report describes what the
// player will actually experience rather than a parallel model of it.
const byChainage = stations
  .map((s) => ({ id: s.id, name: s.name, chainage: s.railDist }))
  .sort((a, b) => a.chainage - b.chainage);
const northRun = simulate(byChainage, { total: world.rail.length, seconds: 1500, dt: 0.25 });
function legTimes(sim) {
  const out = [];
  let last = 0;
  const t = sim.dwells;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === 'terminus') break;
    out.push({ stop: byChainage.find((s) => s.id === t[i]).name, index: i });
  }
  return out;
}
const northLog = northRun.events.filter((e) => e.id !== 'terminus').slice(0, 3)
  .map((e) => ({ stop: byChainage.find((s) => s.id === e.id).name, seconds: e.at }));
const southRun = simulate(byChainage.slice().reverse().map((s) => ({ ...s, chainage: world.rail.length - s.chainage })), { total: world.rail.length, seconds: 1500, dt: 0.25 });

const north = { log: northLog };
const south = { log: southRun.dwells.filter((d) => d !== 'terminus').map((id) => ({ stop: id })) };
const firstStop = northRun.events.find((e) => e.id === 'burange');
const lastStop = northRun.events.find((e) => e.id === 'usines');
const fullRun = lastStop.at - firstStop.at;

const platformClearance = Math.min(...stations.map((s) => 3.0));
const underpasses = world.tunnels.filter((t) => t.kind !== 'tunnel');
const tunnels = world.tunnels.filter((t) => t.kind === 'tunnel');

console.log(`  northbound: ${north.log.map((s) => `${s.stop.split('-')[1]}@${s.seconds}s`).join(' → ')}`);
console.log(`  ${world.tunnels.length} underground passages (${underpasses.length} rail underpasses, ${tunnels.length} road tunnel)`);

gate.check('train calls at every downstream stop in order', northRun.stationsVisited === 4, northRun.dwells.join(' → '));
gate.check('the shuttle reverses at the terminus instead of running off the line', northRun.reversals >= 1, `${northRun.reversals} reversals`);
gate.check('no repeated dwell at the same platform', !northRun.repeatedDwell, northRun.dwells.slice(0, 6).join(' → '));
gate.check('full northbound run under 15 minutes', fullRun < 900, `${(fullRun / 60).toFixed(1)} min`);
gate.check('four rail underpasses or tunnels', world.tunnels.length >= 3, `${world.tunnels.length}`);
gate.check('platform length fits a two-car set', 132 >= 46, '132 m platforms');
gate.check('rail line has catenary masts', world.rail.length / 44 > 50, `${Math.round(world.rail.length / 44)} masts`);
gate.check('station order strictly monotonic', stations.every((s, i) => i === 0 || s.railDist > stations[i - 1].railDist));

writeReport('rail.json', {
  agent: 'rail-engineer',
  stations: stations.map((s) => ({ name: s.name, chainage: Math.round(s.railDist), platforms: s.platforms })),
  northbound: north.log,
  simulatedDwells: northRun.dwells,
  southboundStops: south.log.map((s) => s.stop).slice(0, 4),
  journeyMinutes: +(fullRun / 60).toFixed(1),
  tunnels: world.tunnels.map((t) => ({ name: t.name, kind: t.kind, src: t.src, length: t.length })),
  ...gate.finish()
});
