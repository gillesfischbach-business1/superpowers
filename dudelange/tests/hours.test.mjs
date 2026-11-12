/** Opening-hours engine: parsing, overnights, weekly totals, and the shipped venue data. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHours, isOpenAt, statusAt, describeStatus, weeklyHours, formatMinutes } from '../public/js/core/hours.js';
import { INTERIORS } from '../public/js/core/interiors.js';

const MON = 1, TUE = 2, FRI = 5, SAT = 6, SUN = 0;
const at = (h, m = 0) => h * 60 + m;

test('parses weekday ranges, closed days and multiple services', () => {
  const shop = parseHours('Mo-Fr 08:00-20:00; Sa 08:00-18:00; Su off');
  assert.equal(shop.ok, true);
  assert.equal(isOpenAt(shop, MON, at(12)), true);
  assert.equal(isOpenAt(shop, MON, at(7, 59)), false);
  assert.equal(isOpenAt(shop, SAT, at(19)), false);
  assert.equal(isOpenAt(shop, SUN, at(12)), false);

  const split = parseHours('Mo-Fr 11:30-14:30,18:00-22:00');
  assert.equal(isOpenAt(split, TUE, at(13)), true);
  assert.equal(isOpenAt(split, TUE, at(16)), false);
  assert.equal(isOpenAt(split, TUE, at(19)), true);
  assert.equal(weeklyHours(split), 35);
});

test('over night ranges spill into the next morning', () => {
  const late = parseHours('Tu-Sa 17:00-01:00');
  assert.equal(isOpenAt(late, TUE, at(23)), true);
  assert.equal(isOpenAt(late, TUE, at(0, 30)), false, 'Tuesday morning belongs to Monday, which is closed');
  assert.equal(isOpenAt(late, 3, at(0, 30)), true, 'Wednesday 00:30 is still Tuesday night');
  assert.equal(isOpenAt(late, SAT, at(0, 30)), true, 'Saturday 00:30 is still Friday night');
  assert.equal(isOpenAt(late, SAT, at(2)), false, 'Friday closes at 01:00, not 02:00');
  assert.equal(isOpenAt(late, SUN, at(0, 30)), true, 'Saturday night runs into Sunday');
  assert.equal(isOpenAt(late, SUN, at(2)), false);
  assert.equal(isOpenAt(late, SUN, at(18)), false);
  assert.equal(weeklyHours(late), 40);
});

test('24/7 and closing status texts', () => {
  const always = parseHours('24/7');
  assert.equal(isOpenAt(always, SUN, at(3)), true);
  assert.equal(weeklyHours(always), 168);
  assert.equal(describeStatus(always, SUN, at(3)), 'open');

  const shop = parseHours('Mo-Fr 08:00-20:00; Sa 08:00-18:00; Su off');
  assert.equal(describeStatus(shop, MON, at(12)), 'open until 20:00');
  assert.equal(describeStatus(shop, MON, at(23)), 'closed — opens Tu 08:00');
  assert.equal(describeStatus(shop, SAT, at(12)), 'open until 18:00');
  const st = statusAt(shop, SAT, at(23));
  assert.equal(st.open, false);
  assert.equal(formatMinutes(st.opensAt), '08:00');
});

test('garbage is reported, never guessed', () => {
  for (const spec of ['', 'banana', 'Mo-Fr', 'Mo-Fr 25:00-26:00', 'Mo-Fr 08:00-08:00']) {
    const parsed = parseHours(spec);
    assert.equal(parsed.ok, false, spec);
    assert.ok(parsed.errors.length > 0, spec);
  }
});

test('every visitable venue in Dudelange has sane, parseable hours', () => {
  const venues = Object.entries(INTERIORS);
  assert.ok(venues.length >= 25);
  for (const [id, spec] of venues) {
    assert.ok(spec.hours, `${id} needs opening hours`);
    const parsed = parseHours(spec.hours);
    assert.equal(parsed.ok, true, `${id}: ${parsed.errors.join(', ')}`);
    const weekly = weeklyHours(parsed);
    assert.ok(weekly >= 20 && weekly <= 168, `${id} open ${weekly} h/week`);
    assert.ok(['web', 'typical'].includes(spec.hoursSrc), `${id} must say where its hours come from`);
  }

  const pubs = Object.entries(INTERIORS).filter(([, s]) => s.kind === 'pub');
  const openFridayLate = pubs.filter(([, s]) => isOpenAt(parseHours(s.hours), FRI, at(23)));
  assert.ok(openFridayLate.length >= 5, `nightlife: ${openFridayLate.length} pubs open Friday 23:00`);
  const openSaturdayClub = pubs.filter(([, s]) => isOpenAt(parseHours(s.hours), SAT, at(2, 30)));
  assert.ok(openSaturdayClub.length >= 2, `late licences: ${openSaturdayClub.length} pubs open Saturday 02:30`);

  const shops = Object.entries(INTERIORS).filter(([, s]) => s.kind === 'shop');
  for (const [id, spec] of shops) {
    const parsed = parseHours(spec.hours);
    assert.equal(isOpenAt(parsed, SUN, at(15)), false, `${id} should be shut on Sunday afternoon`);
    assert.equal(isOpenAt(parsed, MON, at(9)), true, `${id} should be open on Monday morning`);
  }
});
