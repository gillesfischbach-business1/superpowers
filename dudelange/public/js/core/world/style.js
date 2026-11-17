/**
 * What Dudelange looks like, as data.
 *
 * Every table here answers one question the generators ask: how wide is this
 * class of street, how far is the front wall from the kerb in this quarter,
 * what colours does this quarter build in, where is house-building forbidden.
 * Keeping them in one module means the street generator, the house placer and
 * the QA gates all read the same numbers.
 */
import { project } from '../geo.js';

export const ROAD_WIDTH = { motorway: 20, primary: 12, secondary: 9.5, residential: 7, foot: 3.2 };
export const SIDEWALK = { motorway: 0, primary: 2.4, secondary: 2.2, residential: 1.8, foot: 0 };
export const SETBACK = { motorway: 12, primary: 6, secondary: 4, residential: 3, foot: 2 };

/**
 * Distance from the kerb to the front wall, per quarter.
 *
 * Dudelange's centre is built hard on the pavement; only the outskirts have
 * front gardens. One global setback made every street look suburban.
 */
export const FRONT_GARDEN = {
  centre: [0.6, 2.2], italien: [0.6, 2.2], burange: [2.5, 6],
  budersberg: [3, 7], neischmelz: [2.5, 5], usines: [1.5, 4], outskirts: [5, 11]
};

export const STYLE_SETS = {
  // Rue de la Gare: pale plaster town houses, 3-4 storeys, slate roofs, shops
  // at street level (photo references in docs/reference/).
  centre: {
    wall: ['#e6d8bf', '#dcc9a8', '#e9ddc9', '#e8d3c4', '#efe6d6', '#dfc7b4', '#cfd8d2'],
    roof: ['#4a4f57', '#3f444b', '#565b62', '#4d4a45'],
    floors: [3, 4], pitch: 0.62, shopChance: 0.55
  },
  // Cité Italienne: narrow lanes of 2-storey terraced cottages painted in
  // saturated pastels — turquoise, coral, ochre, lilac — never brick.
  italien: {
    wall: ['#6fb8a8', '#d9644a', '#e89a86', '#b09cc0', '#e0b761', '#a8ccb0', '#efe3d0', '#d9a68f'],
    roof: ['#7a5040', '#6b4738', '#8a5f4a'],
    floors: [2, 2], pitch: 0.5, shopChance: 0.12
  },
  burange: {
    wall: ['#f0ece4', '#e6e0d5', '#dcd6c8', '#efe9de', '#e2d9c9'],
    roof: ['#7a4b3a', '#6b4433', '#5d3d30', '#84614a'],
    floors: [2, 2], pitch: 0.72, shopChance: 0.08
  },
  budersberg: {
    wall: ['#e8e2d2', '#d9d0bb', '#cfc4ab', '#efe8d8'],
    roof: ['#5d4636', '#4f3c2f', '#6a5240'],
    floors: [2, 2], pitch: 0.85, shopChance: 0.05
  },
  neischmelz: {
    wall: ['#dcdcd8', '#c9c9c2', '#b9a58c', '#8fa3a8', '#e5e2dc'],
    roof: ['#585f60', '#4a5152'],
    floors: [3, 5], pitch: 0.05, shopChance: 0.12
  },
  usines: {
    wall: ['#9aa0a1', '#8b8f8d', '#a8a29a', '#7f8785'],
    roof: ['#5c6363', '#4b5252'],
    floors: [1, 2], pitch: 0.12, shopChance: 0.05
  },
  outskirts: {
    wall: ['#efe9dc', '#e3dbc9', '#d8cfba', '#f2ece0'],
    roof: ['#6d4b38', '#5b3f2f', '#7c5a44'],
    floors: [2, 3], pitch: 0.7, shopChance: 0.04
  }
};

export const GENERATED_NAMES = [
  'Rue Alexander Fleming', 'Rue Louis Pasteur', 'Rue de la Fontaine', 'Rue des Romains',
  'Rue du Moulin', 'Rue de l’Usine', 'Rue des Martyrs', 'Rue du Parc', 'Rue des Champs',
  'Rue de l’École', 'Rue de la Chapelle', 'Rue des Prés', 'Rue du Stade',
  'Rue de l’Industrie', 'Rue des Acacias', 'Rue des Tilleuls', 'Rue des Cerisiers',
  'Rue du Cimetière', 'Rue des Roseaux', 'Rue de la Gare', 'Rue des Vergers',
  'Rue du Lavoir', 'Rue des Houblonnières', 'Rue de la Bruyère', 'Rue des Aulnes',
  'Rue du Château d’Eau', 'Rue des Ciments', 'Rue de la Minette', 'Rue du Verger',
  'Rue des Sources', 'Rue de la Frontière', 'Rue des Pins', 'Rue des Peupliers'
];

/** Zones where the generator must not put ordinary houses. */
export const PROTECTED = [
  { id: 'parc_leh', polygon: [[49.4838, 6.0955], [49.4876, 6.0955], [49.4880, 6.1045], [49.4840, 6.1050]] },
  { id: 'mont_st_jean', polygon: [[49.4855, 6.0540], [49.4945, 6.0540], [49.4945, 6.0680], [49.4855, 6.0680]] },
  { id: 'kalebierg', polygon: [[49.4630, 6.0500], [49.4710, 6.0500], [49.4710, 6.0680], [49.4630, 6.0680]] },
  { id: 'works_core', polygon: [[49.4710, 6.0782], [49.4750, 6.0782], [49.4752, 6.0842], [49.4712, 6.0852]] },
  { id: 'stade', polygon: [[49.4888, 6.0876], [49.4920, 6.0876], [49.4920, 6.0920], [49.4888, 6.0920]] },
  { id: 'pond', polygon: [[49.4796, 6.0810], [49.4810, 6.0810], [49.4810, 6.0829], [49.4796, 6.0829]] },
  { id: 'cemetery', polygon: [[49.4808, 6.0796], [49.4820, 6.0796], [49.4820, 6.0810], [49.4808, 6.0810]] }
];

export function pickStyle(district, x, z, road, rng, commercialStreets) {
  if (district === 'neischmelz') return 'neischmelz';
  if (district === 'usines') return 'usines';
  if (district === 'budersberg') return 'budersberg';
  if (district === 'burange') return rng() < 0.12 ? 'centre' : 'burange';
  if (district === 'italien') return rng() < 0.82 ? 'italien' : 'centre';
  if (district === 'centre') return rng() < 0.86 ? 'centre' : 'italien';
  if (commercialStreets.has(road.id)) return rng() < 0.5 ? 'centre' : 'italien';
  return 'outskirts';
}


/** Commercial high streets: wider mix of shops, so they build like the centre. */
export const COMMERCIAL_STREETS = new Set(['zoufftgen', 'liberation', 'gdc', 'commerce']);

/** Share of lots that actually get a house, per quarter. */
export const DENSITY = { centre: 1.0, italien: 0.92, burange: 0.5, budersberg: 0.12, neischmelz: 0.35, usines: 0.25, outskirts: 0.03 };

/** The town hall corner: the "how far out am I?" origin used by the placer. */
export const TOWN_CENTRE = project(49.4787, 6.0846);

export const FORESTS = [
  { id: 'mont_st_jean', centre: project(49.4898, 6.0615), rx: 620, rz: 520, count: 1350 },
  { id: 'kalebierg', centre: project(49.4670, 6.0570), rx: 560, rz: 460, count: 900 },
  { id: 'parc_leh', centre: project(49.4862, 6.0995), rx: 250, rz: 200, count: 620 },
  { id: 'north_woods', centre: project(49.4960, 6.0700), rx: 560, rz: 340, count: 760 },
  { id: 'east_ridge', centre: project(49.4700, 6.1000), rx: 380, rz: 460, count: 620 },
  { id: 'valley_belt', centre: project(49.4680, 6.0700), rx: 320, rz: 280, count: 420 }
];

export const TRAIL_ANCHORS = [
  { id: 'trail_st_jean', name: 'Sentier du Mont Saint-Jean', landmark: 'mont_st_jean', forest: 'mont_st_jean', dist: 430 },
  { id: 'trail_kalebierg', name: 'Sentier du Kalebierg', landmark: 'kalebierg', forest: 'kalebierg', dist: 390 },
  { id: 'trail_parc', name: 'Sentier du Parc Le’h', landmark: 'parc_leh_rest', forest: 'parc_leh', dist: 280 },
  { id: 'trail_etang', name: 'Sentier de l’Étang', landmark: 'etang', forest: 'valley_belt', dist: 250, kind: 'park' },
  { id: 'trail_north', name: 'Sentier de la vallée', landmark: null, forest: 'north_woods', start: [49.4948, 6.0742], dist: 560 }
];
