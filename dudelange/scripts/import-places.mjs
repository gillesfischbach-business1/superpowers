/**
 * Ingest a Google Maps dataset export into the game's content pipeline.
 *
 * The game itself is built from OpenStreetMap anchors and hand-checked data, but
 * richer venue facts (rating, price bracket, opening hours, address) can come from
 * a Google Maps Scraper (Apify `compass/crawler-google-places`) dataset export.
 *
 *   npm run import:places -- ~/Downloads/dataset_google-maps.json
 *   npm run import:places -- places.json --json
 *
 * The importer never edits town-data.js by itself. It writes:
 *   data/imported/places.json            normalised, in-bbox places
 *   data/imported/pending-landmarks.json ready-to-paste landmark entries
 * and prints what it found, what already exists in the world, and what is new.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorld } from '../public/js/core/world.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'imported');

/** Commune of Dudelange, generously padded. */
const BBOX = { south: 49.4529, north: 49.5070, west: 6.0475, east: 6.1280 };
/** The frame the world generator actually builds; anything outside needs a bbox change. */
const PLAY = { south: 49.4640, north: 49.4980, west: 6.0545, east: 6.1120 };

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const input = args.find((a) => !a.startsWith('--'));

if (!input) {
  console.error('usage: npm run import:places -- <dataset.json> [--json]');
  process.exit(2);
}

const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
const items = Array.isArray(raw) ? raw : raw.items || raw.data || [];
if (!items.length) {
  console.error('no places found — expected an array, or { items: [...] }');
  process.exit(1);
}

/** Google categories → the kinds the world generator understands. */
function classify(place)  {
  const cats = [place.categoryName, ...(place.categories || [])].filter(Boolean).join(' ').toLowerCase();
  const title = String(place.title || '').toLowerCase();
  if (/\b(pub|bar|bier|brewery|beer garden)\b/.test(cats) || /\bcaf[eé]\b|\bpub\b/.test(cats)) return 'pub';
  if (/supermarket|grocery|convenience store|hypermarket/.test(cats)) return 'shop';
  if (/restaurant|pizzeria|steak|sushi|kebab|brasserie|bistro|diner|cafeteria/.test(cats)) return 'restaurant';
  if (/bakery|patisserie|ice cream/.test(cats)) return 'shop';
  if (/school|lycée|college/.test(cats)) return 'school';
  if (/hotel/.test(cats)) return 'hotel';
  if (/park|playground|garden/.test(cats)) return 'park';
  if (/\bcaf[eé]\b/.test(title)) return 'pub';
  return null;
}

const normalised = [];
for (const p of items) {
  const lat = p.location?.lat ?? p.lat;
  const lon = p.location?.lng ?? p.location?.lon ?? p.lon ?? p.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  if (lat < BBOX.south || lat > BBOX.north || lon < BBOX.west || lon > BBOX.east) continue;
  const kind = classify(p);
  if (!kind) continue;
  normalised.push({
    id: (p.title || 'place').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40),
    name: p.title,
    kind,
    category: p.categoryName || null,
    categories: p.categories || [],
    address: p.address || null,
    lat, lon,
    rating: Number.isFinite(p.totalScore) ? p.totalScore : null,
    reviews: Number.isFinite(p.reviewsCount) ? p.reviewsCount : null,
    price: p.price || null,
    phone: p.phone || null,
    website: p.website || null,
    openingHours: p.openingHours || null,
    permanentlyClosed: !!p.permanentlyClosed,
    temporarilyClosed: !!p.temporarilyClosed,
    placeId: p.placeId || null
  });
}

const world = buildWorld({ seed: 20261112 });
const known = world.landmarks.map((l) => ({ id: l.id, name: l.name.toLowerCase(), x: l.x, z: l.z }));

const { project } = await import('../public/js/core/geo.js');
const fresh = [];
const duplicates = [];
for (const place of normalised) {
  const { x, z } = project(place.lat, place.lon);
  const nameHit = known.find((k) => k.name.includes(place.name.toLowerCase().slice(0, 12)));
  const nearHit = nameHit || known.find((k) => Math.hypot(k.x - x, k.z - z) < 45);
  if (nameHit || nearHit) {
    duplicates.push({ ...place, existing: nearHit?.id || known.find((k) => Math.hypot(k.x - x, k.z - z) < 45)?.id || null });
    continue;
  }
  fresh.push({
    ...place,
    inGameplay: place.lat >= PLAY.south && place.lat <= PLAY.north && place.lon >= PLAY.west && place.lon <= PLAY.east,
    x: Math.round(x * 10) / 10,
    z: Math.round(z * 10) / 10,
    // suggested geometry for a first pass; review before committing
    size: place.kind === 'shop' ? { w: 30, d: 22, h: 6 }
      : place.kind === 'restaurant' ? { w: 18, d: 14, h: 8 }
        : { w: 15, d: 12, h: 9 },
    src: 'google'
  });
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'places.json'), JSON.stringify(normalised, null, 2));
const pending = fresh.map((p) => ({
  id: p.id, name: p.name, kind: p.kind, lat: p.lat, lon: p.lon,
  rotation: 0, size: p.size, src: p.src,
  blurb: [p.category, p.rating ? `${p.rating}★ (${p.reviews} reviews)` : null, p.address]
    .filter(Boolean).join(' · ')
}));
fs.writeFileSync(path.join(OUT, 'pending-landmarks.json'), JSON.stringify(pending, null, 2));

if (asJson) {
  console.log(JSON.stringify({ read: items.length, inBbox: normalised.length, known: duplicates.length, fresh: fresh.length, pending }, null, 2));
} else {
  console.log(`Google Maps import — ${items.length} places read, ${normalised.length} inside Dudelange`);
  console.log(`  ${duplicates.length} already in the world · ${fresh.length} new\n`);
  for (const p of fresh) {
    const meta = [p.category, p.rating ? `${p.rating}★` : null, p.price, p.address].filter(Boolean).join(' · ');
    const flag = p.inGameplay ? '' : '  ⚠ outside the gameplay bbox — widen META.bbox or skip';
    console.log(`  + ${p.kind.padEnd(10)} ${p.name}  (${meta})${flag}`);
  }
  if (duplicates.length) {
    console.log('\n  already present:');
    for (const p of duplicates) console.log(`    = ${p.title ?? p.name}  → ${p.existing}`);
  }
  console.log(`\n  wrote data/imported/places.json and data/imported/pending-landmarks.json`);
}
