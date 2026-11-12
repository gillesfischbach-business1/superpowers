/**
 * Pure train logic, shared by the game loop and the systems agent.
 *
 * The train runs on chainage (metres along the rail polyline). It stops at every
 * station, sits for `stopTime` seconds, then continues; at either end it reverses
 * instead of running off the map.
 */

/**
 * Index of the next station ahead of `dist` in direction `dir`, or -1 at the end of the line.
 * `eps` must stay well below the arrival threshold, otherwise a train that is already
 * braking loses sight of its station and sails past it.
 */
export function nextStopIndex(stations, dist, dir, eps = 0.5) {
  const ahead = stations.filter((s) => (dir > 0 ? s.chainage > dist + eps : s.chainage < dist - eps));
  if (!ahead.length) return -1;
  return stations.indexOf(dir > 0 ? ahead[0] : ahead[ahead.length - 1]);
}

/**
 * Highest speed that still lets the train stop in `gap` metres.
 * Without this the train sails past its own stations at 21 m/s.
 */
export function brakingSpeed(gap, max = 21, decel = 1.15) {
  return Math.min(max, Math.sqrt(Math.max(0, 2 * decel * Math.max(0, gap))));
}

/**
 * Simulate a run along the line. Returns the station order visited, plus counters
 * used by the systems agent to prove the timetable actually advances.
 */
export function simulate(stations, opts = {}) {
  const total = opts.total ?? 5090;
  const stopTime = opts.stopTime ?? 18;
  const dt = opts.dt ?? 0.25;
  const seconds = opts.seconds ?? 900;

  const t = {
    dist: opts.startDist ?? 300,
    dir: 1,
    speed: 0,
    state: 'dwell',
    dwell: opts.startDwell ?? 4,
    atTerminus: false,
    nextStop: 0,
    travelled: 0
  };
  const visits = [];
  const dwells = [];
  const events = [];
  let reversals = 0;
  let stalled = 0;

  for (let step = 0; step < seconds / dt; step++) {
    if (t.state === 'dwell') {
      t.dwell -= dt;
      if (t.dwell <= 0) {
        if (t.atTerminus) { t.dir *= -1; t.atTerminus = false; reversals++; }
        t.state = 'run';
        t.nextStop = nextStopIndex(stations, t.dist, t.dir);
      }
      continue;
    }
    const stopIdx = nextStopIndex(stations, t.dist, t.dir);
    const target = stopIdx >= 0 ? stations[stopIdx].chainage : (t.dir > 0 ? total - 30 : 10);
    const gap = Math.abs(target - t.dist);
    if (gap < 2.2) {
      t.state = 'dwell';
      t.dwell = stopTime;
      t.speed = 0;
      t.dist = target;
      t.atTerminus = stopIdx < 0;
      dwells.push(stopIdx >= 0 ? stations[stopIdx].id : 'terminus');
      events.push({ id: stopIdx >= 0 ? stations[stopIdx].id : 'terminus', at: +((step + 1) * dt).toFixed(1) });
      if (stopIdx >= 0) visits.push(stations[stopIdx].id);
      continue;
    }
    const targetSpeed = brakingSpeed(gap);
    t.speed += (targetSpeed - t.speed) * Math.min(1, dt * 1.6);
    const advance = Math.min(gap, t.speed * dt);
    if (advance < 1e-6) stalled++;
    t.dist += advance * t.dir;
    t.travelled += advance;
  }

  const repeated = dwells.some((id, i) => i > 0 && id === dwells[i - 1]);
  return {
    visits, dwells, events, reversals, travelled: +t.travelled.toFixed(0), stalled,
    repeatedDwell: repeated,
    stationsVisited: new Set(visits).size
  };
}
