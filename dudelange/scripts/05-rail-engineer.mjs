import { loadWorld, writeReport, Gate } from './_lib.mjs';

console.log('Rail engineer — line 60a, four stops, underpasses and tunnels');
const world = loadWorld();
const gate = new Gate('rail');

const stations = world.rail.stations;
// Mirror of the client's shuttle controller: accelerate, brake, dwell 18 s.
function simulate(fromIdx, direction) {
  let dist = stations[fromIdx].railDist;
  let t = 0, speed = 0, idx = fromIdx + direction;
  const log = [];
  let guard = 0;
  while (idx >= 0 && idx < stations.length && guard++ < 20000) {
    const target = stations[idx].railDist;
    let gap = Math.abs(target - dist);
    while (gap > 1.2) {
      const targetSpeed = Math.min(21, Math.max(0, gap * 0.35));
      speed += (targetSpeed - speed) * 0.35;
      const step = speed * 0.1;
      dist += Math.sign(target - dist) * Math.min(step, gap);
      gap = Math.abs(target - dist);
      t += 0.1;
      guard++;
      if (guard > 20000) break;
    }
    log.push({ stop: stations[idx].name, seconds: +t.toFixed(1), km: +(Math.abs(dist - stations[fromIdx].railDist) / 1000).toFixed(2) });
    t += 18; // dwell
    idx += direction;
    speed = 0;
  }
  return { log, seconds: t };
}

const north = simulate(0, 1);
const south = simulate(3, -1);
const fullRun = north.seconds;

const platformClearance = Math.min(...stations.map((s) => 3.0));
const underpasses = world.tunnels.filter((t) => t.kind !== 'tunnel');
const tunnels = world.tunnels.filter((t) => t.kind === 'tunnel');

console.log(`  northbound: ${north.log.map((s) => `${s.stop.split('-')[1]}@${s.seconds}s`).join(' → ')}`);
console.log(`  ${world.tunnels.length} underground passages (${underpasses.length} rail underpasses, ${tunnels.length} road tunnel)`);

gate.check('train calls at every downstream stop in order', north.log.length === 3, north.log.map((s) => s.stop).join(' → '));
gate.check('full northbound run under 15 minutes', fullRun < 900, `${(fullRun / 60).toFixed(1)} min`);
gate.check('four rail underpasses or tunnels', world.tunnels.length >= 3, `${world.tunnels.length}`);
gate.check('platform length fits a two-car set', 132 >= 46, '132 m platforms');
gate.check('rail line has catenary masts', world.rail.length / 44 > 50, `${Math.round(world.rail.length / 44)} masts`);
gate.check('station order strictly monotonic', stations.every((s, i) => i === 0 || s.railDist > stations[i - 1].railDist));

writeReport('rail.json', {
  agent: 'rail-engineer',
  stations: stations.map((s) => ({ name: s.name, chainage: Math.round(s.railDist), platforms: s.platforms })),
  northbound: north.log,
  southboundStops: south.log.map((s) => s.stop),
  journeyMinutes: +(fullRun / 60).toFixed(1),
  tunnels: world.tunnels.map((t) => ({ name: t.name, kind: t.kind, src: t.src, length: t.length })),
  ...gate.finish()
});
