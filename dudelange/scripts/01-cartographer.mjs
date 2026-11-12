import { loadWorld, writeReport, Gate, stationOrder } from './_lib.mjs';
import { META, ROADS, LANDMARKS } from '../public/js/core/town-data.js';

console.log('Cartographer — reading OpenStreetMap anchors for Dudelange');
const world = loadWorld();
const gate = new Gate('cartographer');
const { south, north, west, east } = META.bbox;
const inBox = (lat, lon) => lat >= south && lat <= north && lon >= west && lon <= east;

const anchors = [
  ...LANDMARKS.map((l) => ({ kind: 'landmark', id: l.id, lat: l.lat, lon: l.lon, src: l.src })),
  ...world.rail.stations.map((s) => ({ kind: 'station', id: s.id, lat: s.lat, lon: s.lon, src: 'osm' }))
];
const outside = anchors.filter((a) => !inBox(a.lat, a.lon));
const named = ROADS.filter((r) => r.src === 'osm').length;
const stations = world.rail.stations;

console.log(`  ${anchors.length} anchors · ${named} named streets · ${ROADS.length} road polylines overall`);
console.log(`  rail chainage: ${stationOrder(world)}`);
gate.check('all anchors inside the playable bbox', outside.length === 0, outside.map((o) => o.id).join(', '));
gate.check('at least 15 named streets traced from OSM', named >= 15, `${named} named`);
gate.check('four CFL stations', stations.length === 4, stations.map((s) => s.name).join(' / '));
gate.check('stations in line order Burange → Usines', stations.map((s) => s.id).join(',') === 'burange,ville,centre,usines', stationOrder(world));
gate.check('rail line is longer than 3 km', world.rail.length > 3000, `${Math.round(world.rail.length)} m`);
gate.check('urban road network over 20 km', world.stats.roadKm > 20, `${world.stats.roadKm} km`);
gate.check('place names kept in Luxembourg spelling', world.meta.nameLb === 'Diddeleng');

const report = {
  agent: 'cartographer',
  anchors: anchors.length,
  namedStreets: named,
  roadPolylines: ROADS.length,
  railStationOrder: stations.map((s) => ({ id: s.id, name: s.name, chainage: Math.round(s.railDist), platformY: +s.platformY.toFixed(1) })),
  bbox: META.bbox,
  sources: anchors.reduce((acc, a) => { acc[a.src] = (acc[a.src] || 0) + 1; return acc; }, {}),
  ...gate.finish()
};
writeReport('cartographer.json', report);
