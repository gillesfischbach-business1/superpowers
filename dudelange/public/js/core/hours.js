/**
 * Opening hours — a small OSM `opening_hours` subset, pure and testable.
 *
 * Supported:
 *   24/7
 *   Mo-Fr 08:00-20:00
 *   Mo-Sa 08:00-20:00; Su 09:00-13:00
 *   Mo-Fr 11:30-14:30,18:00-22:00
 *   Tu-Sa 17:00-01:00            (wraps past midnight)
 *   Sa-Su 10:00-24:00; Mo off
 * Anything else is reported as an error instead of being guessed.
 */

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_CODES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const CODE_TO_DAY = Object.fromEntries(DAY_CODES.map((c, i) => [c, i]));

const MINUTES_PER_DAY = 1440;

export function formatMinutes(m) {
  const v = ((Math.round(m) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

function parseClock(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || min > 59) return null;
  if (h === 24 && min === 0) return MINUTES_PER_DAY;
  if (h > 23) return null;
  return h * 60 + min;
}

function parseDays(token) {
  const days = new Set();
  for (const part of token.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const range = /^([A-Z][a-z])-([A-Z][a-z])$/.exec(trimmed);
    if (range) {
      const a = CODE_TO_DAY[range[1]], b = CODE_TO_DAY[range[2]];
      if (a === undefined || b === undefined) return null;
      let d = a;
      for (let guard = 0; guard < 7; guard++) {
        days.add(d);
        if (d === b) break;
        d = (d + 1) % 7;
      }
      continue;
    }
    const single = CODE_TO_DAY[trimmed];
    if (single === undefined) return null;
    days.add(single);
  }
  return days.size ? [...days].sort((x, y) => x - y) : null;
}

/** Parse an opening-hours string. Never throws; returns `{ ok, rules, errors }`. */
export function parseHours(spec) {
  const errors = [];
  if (typeof spec !== 'string' || !spec.trim()) return { ok: false, rules: [], errors: ['empty specification'], raw: spec };
  const text = spec.trim();
  if (/^24\s*\/\s*7$/.test(text) || /^24\s*hours?$/i.test(text)) {
    return {
      ok: true, errors, raw: spec,
      rules: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, ranges: [[0, MINUTES_PER_DAY]] }))
    };
  }

  const rules = [];
  for (const chunk of text.split(';')) {
    const part = chunk.trim();
    if (!part) continue;
    const dayMatch = /^((?:(?:Su|Mo|Tu|We|Th|Fr|Sa)(?:-(?:Su|Mo|Tu|We|Th|Fr|Sa))?(?:,(?:Su|Mo|Tu|We|Th|Fr|Sa)(?:-(?:Su|Mo|Tu|We|Th|Fr|Sa))?)*))\s*(.*)$/.exec(part);
    const dayToken = dayMatch ? dayMatch[1] : null;
    const rest = (dayMatch ? dayMatch[2] : part).trim();
    const days = dayToken ? parseDays(dayToken) : [0, 1, 2, 3, 4, 5, 6];
    if (!days) { errors.push(`unknown day range "${dayToken}"`); continue; }
    if (!rest) { errors.push(`missing times for "${dayToken}"`); continue; }
    if (/^(off|closed)$/i.test(rest)) { rules.push({ days, ranges: [] }); continue; }
    const ranges = [];
    for (const r of rest.split(',')) {
      const m = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(r.trim());
      if (!m) { errors.push(`unreadable time range "${r.trim()}"`); continue; }
      const open = parseClock(m[1]), close = parseClock(m[2]);
      if (open === null || close === null || open === close) { errors.push(`invalid time range "${r.trim()}"`); continue; }
      ranges.push([open, close]);
    }
    rules.push({ days, ranges });
  }
  if (!rules.length && !errors.length) errors.push('no rules');
  const merged = mergeRules(rules);
  return { ok: errors.length === 0 && merged.length > 0, rules: merged, errors, raw: spec };
}

function mergeRules(rules) {
  const byDay = Array.from({ length: 7 }, () => []);
  for (const rule of rules) for (const d of rule.days) byDay[d].push(...rule.ranges);
  return byDay
    .map((ranges, day) => ({ day, ranges: ranges.sort((a, b) => a[0] - b[0]) }))
    .filter((r) => r.ranges.length);
}

/** Is the venue open at `minutes` (0–1439) on `day` (0 = Sunday)? */
export function isOpenAt(parsed, day, minutes) {
  if (!parsed || !parsed.ok) return false;
  const d = ((day % 7) + 7) % 7;
  const m = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  for (const rule of parsed.rules) {
    for (const [open, close] of rule.ranges) {
      if (rule.day === d) {
        if (open < close && m >= open && m < close) return true;
        if (open > close && m >= open) return true;              // evening part
      }
      if (open > close) {
        // the morning part belongs to the day after the opening day
        const nextDay = (rule.day + 1) % 7;
        if (nextDay === d && m < close) return true;
      }
    }
  }
  return false;
}

/**
 * Open/closed status with the next transition, e.g.
 * `{ open: true, until: 1200 }` or `{ open: false, opensInDay: 2, opensAt: 480 }`.
 */
export function statusAt(parsed, day, minutes) {
  const open = isOpenAt(parsed, day, minutes);
  if (!parsed || !parsed.ok) return { open, unknown: true };
  const baseDay = ((day % 7) + 7) % 7;
  const start = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  for (let ahead = 1; ahead <= 7 * MINUTES_PER_DAY; ahead++) {
    const total = start + ahead;
    const d = (((baseDay + Math.floor(total / MINUTES_PER_DAY)) % 7) + 7) % 7;
    const m = total % MINUTES_PER_DAY;
    if (isOpenAt(parsed, d, m) === open) continue;
    return open
      ? { open, until: m, untilDay: d, inMinutes: ahead }
      : { open, opensAt: m, opensDay: d, inMinutes: ahead };
  }
  return { open, unknown: true };
}

/** Total open hours per week (overnight ranges counted once). */
export function weeklyHours(parsed) {
  if (!parsed || !parsed.ok) return 0;
  let minutes = 0;
  for (const rule of parsed.rules) {
    for (const [open, close] of rule.ranges) {
      minutes += open < close ? close - open : MINUTES_PER_DAY - open + close;
    }
  }
  return minutes / 60;
}

/** Human sentence used by the HUD and the doors. */
export function describeStatus(parsed, day, minutes, opts = {}) {
  const st = statusAt(parsed, day, minutes);
  if (!parsed || !parsed.ok) return 'hours unknown';
  if (st.unknown) return st.open ? 'open' : 'closed';
  if (st.open) {
    const sameDay = st.untilDay === ((day % 7) + 7) % 7;
    return st.until >= MINUTES_PER_DAY - 1
      ? 'open all night'
      : `open until ${formatMinutes(st.until)}${sameDay ? '' : ` ${DAY_CODES[st.untilDay]}`}`;
  }
  const sameDay = st.opensDay === ((day % 7) + 7) % 7;
  return `closed — opens ${sameDay ? '' : `${DAY_CODES[st.opensDay]} `}${formatMinutes(st.opensAt)}`;
}
