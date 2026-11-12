/**
 * Diddeleng / Dudelange — real-world dataset
 * -------------------------------------------
 * Coordinates come from OpenStreetMap (Nominatim) lookups for named streets,
 * stations and venues; terrain heights come from EU-DEM 25 m samples queried
 * through opentopodata.org for a 10 × 10 grid across the playable area.
 *
 * Every entry carries a `src` field:
 *   "osm"   – position traced from an OSM way/node (metre-level fidelity)
 *   "approx"– position approximated from an address / walking distance
 *   "model" – authored for gameplay (terrain detail, invented side streets)
 *
 * The playable map covers lat 49.4640 … 49.4980, lon 6.0545 … 6.1120
 * (~4.0 km × 4.1 km) around the town centre.
 */

export const META = {
  name: 'Dudelange',
  nameLb: 'Diddeleng',
  country: 'Luxembourg',
  canton: 'Esch-sur-Alzette',
  population: 22000,
  centre: { lat: 49.4785, lon: 6.0845 },
  bbox: { south: 49.4640, north: 49.4980, west: 6.0545, east: 6.1120 },
  elevation: { min: 256, max: 441, mean: 317 },
  railLine: 'CFL Ligne 60a — Bettembourg ↔ Dudelange ↔ Volmerange-les-Mines (FR)',
  facts: [
    'Dudelange received its town charter in 1907.',
    'ARBED ran the Dudelange steelworks from 1882 until 2005; the blast furnaces were demolished in 1984.',
    'The 600 m rolling-mill hall at Nei Schmelz is protected and is being reused for the national film archive and a skate park.',
    'Dudelange has four CFL stops: Burange, Ville, Centre and Usines — Usines is the last stop before France.',
    'Mont Saint-Jean (Gehaansbierg) rises to 417 m and holds the ruins of a medieval fortress built on a Roman outpost.',
    'The Diddelengerbaach runs through the valley that the town grew up in; the highest point of the commune is the Kalebierg at 435 m.',
    'Nei Schmelz will eventually house around 3,500 people in ~1,600 dwellings on 40 hectares.',
    'The Centre National de l’Audiovisuel (CNA) sits on the former works site at Rue du Centenaire.'
  ]
};

/** Real EU-DEM elevations (metres), 10 × 10, rows south → north, cols west → east. */
export const ELEV_GRID = [
  [423.6, 425.3, 421.6, 405.1, 304.8, 341.8, 392.8, 373.2, 275.7, 255.9],
  [441.1, 374.8, 349.0, 381.8, 300.5, 337.4, 369.4, 418.7, 292.8, 259.1],
  [363.3, 371.4, 348.1, 312.8, 296.5, 330.8, 354.6, 376.4, 303.1, 266.8],
  [387.6, 380.7, 367.9, 358.1, 310.0, 306.9, 350.2, 344.6, 300.8, 305.7],
  [388.9, 386.9, 370.5, 354.5, 304.6, 294.2, 306.5, 324.8, 307.9, 302.0],
  [368.9, 403.4, 336.2, 311.9, 296.0, 287.3, 299.4, 306.8, 299.7, 292.6],
  [309.2, 359.6, 332.9, 318.5, 308.7, 284.0, 288.4, 311.5, 298.4, 285.8],
  [342.1, 412.7, 328.3, 301.8, 290.6, 286.3, 283.3, 296.0, 291.8, 281.8],
  [295.4, 313.6, 308.7, 302.9, 293.6, 287.8, 279.3, 293.7, 284.4, 280.2],
  [290.1, 287.8, 295.0, 300.1, 295.8, 286.0, 283.0, 288.0, 284.0, 281.0]
];

/** Named quarters. Polygons are [lat, lon] rings (approximate boundaries). */
export const DISTRICTS = [
  {
    id: 'centre',
    name: 'Centre',
    color: '#e9c46a',
    blurb: 'Town hall, Saint-Martin church, Place de l’Hôtel de Ville and the shopping streets.',
    polygon: [
      [49.4806, 6.0812], [49.4809, 6.0868], [49.4796, 6.0886], [49.4772, 6.0882],
      [49.4763, 6.0859], [49.4766, 6.0826], [49.4784, 6.0812]
    ]
  },
  {
    id: 'italien',
    name: 'Italien',
    color: '#e76f51',
    blurb: 'The Italian quarter: red-brick workers’ terraces along Route de Zoufftgen.',
    polygon: [
      [49.4805, 6.0860], [49.4809, 6.0995], [49.4789, 6.1045], [49.4772, 6.0990],
      [49.4771, 6.0880], [49.4786, 6.0860]
    ]
  },
  {
    id: 'burange',
    name: 'Burange',
    color: '#2a9d8f',
    blurb: 'Northern quarter by Stade J.F. Kennedy and the Parc Le’h woods.',
    polygon: [
      [49.4960, 6.0800], [49.4958, 6.0935], [49.4926, 6.0960], [49.4872, 6.0955],
      [49.4858, 6.0862], [49.4882, 6.0800]
    ]
  },
  {
    id: 'budersberg',
    name: 'Budersberg',
    color: '#8ab17d',
    blurb: 'Western hamlet in the hills towards Kayl, below Mont Saint-Jean.',
    polygon: [
      [49.4870, 6.0530], [49.4886, 6.0740], [49.4848, 6.0790], [49.4800, 6.0770],
      [49.4770, 6.0640], [49.4790, 6.0530]
    ]
  },
  {
    id: 'neischmelz',
    name: 'Nei Schmelz',
    color: '#9c6644',
    blurb: 'The former ARBED steelworks: rolling mill, blast-furnace ruins, CNA and the new eco-quarter.',
    polygon: [
      [49.4764, 6.0772], [49.4768, 6.0892], [49.4712, 6.0888], [49.4698, 6.0790],
      [49.4726, 6.0768]
    ]
  },
  {
    id: 'usines',
    name: 'Usines',
    color: '#7f5539',
    blurb: 'Industrial south: Dudelange-Usines station and the road to Volmerange.',
    polygon: [
      [49.4726, 6.0768], [49.4726, 6.0870], [49.4650, 6.0870], [49.4642, 6.0770]
    ]
  }
];

/**
 * Road network. Points are [lat, lon]; `class` drives width, marking,
 * lighting and building setbacks.
 */
export const ROADS = [
  {
    id: 'liberation', name: 'Rue de la Libération', cls: 'secondary', src: 'osm',
    points: [
      [49.47182, 6.08363], [49.47211, 6.08355], [49.47288, 6.08380], [49.47351, 6.08404],
      [49.47436, 6.08397], [49.47479, 6.08386], [49.47520, 6.08411], [49.47606, 6.08433],
      [49.47665, 6.08454], [49.47691, 6.08489], [49.47723, 6.08475], [49.47761, 6.08475],
      [49.47794, 6.08482], [49.47818, 6.08493]
    ]
  },
  {
    id: 'gdc', name: 'Avenue Grande-Duchesse Charlotte', cls: 'secondary', src: 'osm',
    points: [
      [49.47818, 6.08493], [49.47870, 6.08512], [49.47940, 6.08524], [49.48008, 6.08529],
      [49.48018, 6.08448], [49.48136, 6.08446], [49.48207, 6.08405], [49.48230, 6.08374],
      [49.48310, 6.08306], [49.48342, 6.08310]
    ]
  },
  {
    id: 'zoufftgen', name: 'Route de Zoufftgen', cls: 'secondary', src: 'osm',
    points: [
      [49.47846, 6.08611], [49.47858, 6.08889], [49.47850, 6.09350], [49.47869, 6.09601],
      [49.47899, 6.09915], [49.47870, 6.10400], [49.47860, 6.11000]
    ]
  },
  {
    id: 'commerce', name: 'Rue du Commerce', cls: 'residential', src: 'osm',
    points: [
      [49.47691, 6.08489], [49.47703, 6.08531], [49.47715, 6.08559], [49.47758, 6.08573],
      [49.47794, 6.08582], [49.47822, 6.08636], [49.47846, 6.08597], [49.47883, 6.08600],
      [49.47900, 6.08598]
    ]
  },
  {
    id: 'eglise', name: 'Rue de l’Église', cls: 'residential', src: 'osm',
    points: [
      [49.47871, 6.08441], [49.47920, 6.08500], [49.47960, 6.08550], [49.47989, 6.08598]
    ]
  },
  {
    id: 'route_luxembourg', name: 'Route de Luxembourg', cls: 'primary', src: 'osm',
    points: [
      [49.48330, 6.08049], [49.48470, 6.08080], [49.48606, 6.08170], [49.48800, 6.08260],
      [49.49100, 6.08380], [49.49476, 6.08557]
    ]
  },
  {
    id: 'route_burange', name: 'Route de Burange', cls: 'residential', src: 'osm',
    points: [
      [49.48881, 6.08587], [49.48928, 6.08632], [49.49010, 6.08693], [49.49100, 6.08743],
      [49.49250, 6.08796], [49.49420, 6.08860]
    ]
  },
  {
    id: 'rue_foret', name: 'Rue de la Forêt', cls: 'residential', src: 'osm',
    points: [
      [49.48600, 6.08600], [49.48620, 6.08900], [49.48630, 6.09200], [49.48635, 6.09500],
      [49.48642, 6.09860], [49.48660, 6.10200]
    ]
  },
  {
    id: 'rue_kayl', name: 'Rue de Kayl', cls: 'secondary', src: 'osm',
    points: [
      [49.47950, 6.08300], [49.48000, 6.07900], [49.48100, 6.07400], [49.48300, 6.06800],
      [49.48535, 6.05496]
    ]
  },
  {
    id: 'rue_etang', name: 'Rue de l’Étang', cls: 'residential', src: 'osm',
    points: [
      [49.47700, 6.08250], [49.47810, 6.08270], [49.47900, 6.08260], [49.48000, 6.08250],
      [49.48100, 6.08240], [49.48260, 6.08280]
    ]
  },
  {
    id: 'centenaire', name: 'Rue du Centenaire', cls: 'residential', src: 'osm',
    points: [
      [49.47444, 6.08240], [49.47350, 6.08120], [49.47269, 6.07938]
    ]
  },
  {
    id: 'volmerange', name: 'Route de Volmerange', cls: 'primary', src: 'osm',
    points: [
      [49.47269, 6.07938], [49.47000, 6.07800], [49.46700, 6.07700], [49.46400, 6.07600],
      [49.46100, 6.07650]
    ]
  },
  {
    id: 'hellange', name: 'Rue de Hellange', cls: 'residential', src: 'model',
    points: [
      [49.48881, 6.08587], [49.49000, 6.08430], [49.49150, 6.08320], [49.49320, 6.08220]
    ]
  },
  {
    id: 'gaffelt', name: 'Rue Gaffelt', cls: 'secondary', src: 'osm',
    points: [
      [49.48024, 6.08079], [49.48077, 6.08033], [49.48082, 6.08029], [49.48091, 6.08021],
      [49.48096, 6.08017], [49.48106, 6.08012], [49.48116, 6.08008], [49.48125, 6.08007],
      [49.48136, 6.08009], [49.48181, 6.08019], [49.48190, 6.08021], [49.48195, 6.08022],
      [49.48208, 6.08025], [49.48226, 6.08029]
    ]
  },
  {
    id: 'fontaine', name: 'Rue de la Fontaine', cls: 'residential', src: 'osm',
    points: [
      [49.47759, 6.08074], [49.47789, 6.08082], [49.47799, 6.08083], [49.47833, 6.08104],
      [49.47848, 6.08108], [49.47946, 6.08107], [49.47967, 6.08101], [49.48013, 6.08085],
      [49.48024, 6.08079]
    ]
  },
  {
    id: 'jean_jaures', name: 'Rue Jean Jaurès', cls: 'residential', src: 'osm',
    points: [
      [49.47974, 6.08340], [49.47982, 6.08320], [49.47985, 6.08313], [49.47987, 6.08308],
      [49.48002, 6.08267], [49.48010, 6.08246], [49.48017, 6.08225], [49.48021, 6.08201],
      [49.48024, 6.08138], [49.48026, 6.08108], [49.48026, 6.08101], [49.48024, 6.08083],
      [49.48024, 6.08079]
    ]
  },
  {
    id: 'jfk', name: 'Rue Stade John F. Kennedy', cls: 'residential', src: 'model',
    points: [
      [49.49000, 6.08700], [49.49060, 6.08900], [49.49100, 6.09050], [49.49120, 6.09250]
    ]
  },
  {
    id: 'burange_north', name: 'Rue de Bettembourg', cls: 'residential', src: 'model',
    points: [
      [49.49250, 6.08796], [49.49400, 6.08800], [49.49550, 6.08850]
    ]
  },
  {
    id: 'grand_duc_adolphe', name: 'Rue Grand-Duc Adolphe', cls: 'residential', src: 'osm',
    points: [
      [49.4691713, 6.0867352], [49.4691466, 6.0868314], [49.4688445, 6.0880089], [49.4689451, 6.088004],
      [49.4690865, 6.0879933], [49.4691429, 6.0879675], [49.4692103, 6.0879294], [49.4695804, 6.0877065],
      [49.4696100, 6.0876489], [49.4698602, 6.0867089], [49.4700119, 6.0861482], [49.4700589, 6.0860088],
      [49.4703583, 6.0849309], [49.4703836, 6.0848017], [49.4704733, 6.0844906], [49.4705857, 6.0842599],
      [49.4706891, 6.0840629], [49.4707087, 6.0840255]
    ],
    note: 'Traced from OSM way 137523303 / 273971692.'
  },
  {
    id: 'route_boudersberg', name: 'Route de Boudersberg', cls: 'secondary', src: 'approx',
    points: [
      [49.48606, 6.08170], [49.48615, 6.07850], [49.48628, 6.07550], [49.48631, 6.07261],
      [49.48645, 6.06950], [49.48652, 6.06600], [49.48600, 6.06300]
    ],
    note: 'Connector to Budersberg traced from the known alignment of the CR route.'
  },
  {
    id: 'rue_du_parc', name: 'Rue du Parc', cls: 'residential', src: 'approx',
    points: [
      [49.48230, 6.08374], [49.48260, 6.08520], [49.48290, 6.08700], [49.48306, 6.08946],
      [49.48340, 6.09120], [49.48380, 6.09280]
    ],
    note: 'School street by the Lycée Nic-Biever; alignment approximated.'
  },
  {
    id: 'budersberg_main', name: 'Rue Principale (Budersberg)', cls: 'residential', src: 'model',
    points: [
      [49.47900, 6.07400], [49.48000, 6.07000], [49.48100, 6.06600]
    ]
  },
  {
    id: 'mont_st_jean', name: 'Chemin du Mont Saint-Jean', cls: 'foot', src: 'model',
    points: [
      [49.48300, 6.07000], [49.48600, 6.06700], [49.48800, 6.06300], [49.49002, 6.06057]
    ]
  },
  {
    id: 'parc_leh', name: 'Rue du Parc Le’h', cls: 'foot', src: 'model',
    points: [
      [49.48642, 6.09860], [49.48660, 6.10100], [49.48690, 6.10400]
    ]
  },
  {
    id: 'a3_north', name: 'A3 / Porte de France (edge of map)', cls: 'motorway', src: 'approx',
    points: [
      [49.49600, 6.10600], [49.48800, 6.10900], [49.47850, 6.11050], [49.46850, 6.11100],
      [49.46200, 6.11000]
    ],
    note: 'Represented along the eastern edge where the A3 meets the French A31 at the Porte de France.'
  }
];

/** Railway line 60a with the four real CFL stops. */
export const RAIL = {
  id: 'cfl60a',
  name: 'CFL 60a',
  stations: [
    { id: 'burange', name: 'Dudelange-Burange', lat: 49.49220, lon: 6.08619, zone: 'Burange', platforms: 2 },
    { id: 'ville', name: 'Dudelange-Ville', lat: 49.48342, lon: 6.08310, zone: 'Centre', platforms: 2 },
    { id: 'centre', name: 'Dudelange-Centre', lat: 49.47869, lon: 6.08214, zone: 'Centre', platforms: 2 },
    { id: 'usines', name: 'Dudelange-Usines', lat: 49.47269, lon: 6.07938, zone: 'Usines', platforms: 2 }
  ],
  points: [
    [49.50400, 6.09000], [49.49800, 6.08860], [49.49220, 6.08619], [49.48780, 6.08460],
    [49.48342, 6.08310], [49.48080, 6.08250], [49.47869, 6.08214], [49.47580, 6.08090],
    [49.47269, 6.07938], [49.46850, 6.07780], [49.46400, 6.07660], [49.45900, 6.07560]
  ]
};

export const LANDMARKS = [
  {
    id: 'townhall', name: 'Hôtel de Ville', kind: 'civic', lat: 49.47871, lon: 6.08441,
    rotation: 0.16, size: { w: 46, d: 18, h: 14 }, src: 'osm',
    interior: 'townhall',
    blurb: 'Dudelange’s town hall on Place de l’Hôtel de Ville. The tourist desk hands out the town’s treasure map.'
  },
  {
    id: 'church', name: 'Église Saint-Martin', kind: 'church', lat: 49.47989, lon: 6.08598,
    rotation: -0.35, size: { w: 22, d: 48, h: 20 }, src: 'osm',
    interior: 'church',
    blurb: 'The neo-Gothic parish church of Saint-Martin, rebuilt in 1901 after the old nave burned down.'
  },
  {
    id: 'cna', name: 'Centre National de l’Audiovisuel', kind: 'culture', lat: 49.47444, lon: 6.08240,
    rotation: 0.0, size: { w: 54, d: 30, h: 12 }, src: 'osm',
    interior: 'cna',
    blurb: 'National audiovisual centre and photo gallery on the former works site (Rue du Centenaire).'
  },
  {
    id: 'delhaize', name: 'Proxy Delhaize Dudelange', kind: 'supermarket', lat: 49.47860, lon: 6.09280,
    rotation: 0.04, size: { w: 44, d: 26, h: 7 }, src: 'osm',
    interior: 'delhaize',
    blurb: 'The neighbourhood supermarket at 59A Route de Zoufftgen — open late, good for Bofferding and Gromperekichelcher.'
  },
  {
    id: 'match', name: 'Match Dudelange', kind: 'supermarket', lat: 49.48890, lon: 6.08350,
    rotation: -0.1, size: { w: 40, d: 24, h: 7 }, src: 'approx',
    interior: 'match',
    blurb: 'Supermarket on Schwaarze Wee in Burange; the parking is bigger than the shop.'
  },
  {
    id: 'cactus_shoppi', name: 'Cactus shoppi Dudelange', kind: 'supermarket', lat: 49.48690, lon: 6.08210,
    rotation: 0.2, size: { w: 30, d: 20, h: 6 }, src: 'approx',
    interior: 'cactus',
    blurb: 'Cactus convenience store attached to the filling station at 214 Route de Luxembourg.'
  },
  {
    id: 'mamma_mia', name: 'Mamma Mia', kind: 'restaurant', lat: 49.47855, lon: 6.08475,
    rotation: 0.12, size: { w: 18, d: 14, h: 9 }, src: 'osm',
    interior: 'mamma_mia', cuisine: 'Italian',
    blurb: 'Pizzeria at 27 Place de l’Hôtel de Ville, opposite the town hall.'
  },
  {
    id: 'opa_cafe', name: 'Opa Café', kind: 'pub', lat: 49.47906, lon: 6.08546,
    rotation: -0.12, size: { w: 16, d: 13, h: 9.5 }, src: 'osm',
    interior: 'opa_cafe',
    blurb: 'Café on Place de l’Hôtel de Ville, zinc counter and all.'
  },
  {
    id: 'dukes_bar', name: 'Duke’s Bar', kind: 'pub', lat: 49.47756, lon: 6.08486,
    rotation: 0.08, size: { w: 13, d: 12, h: 9 }, src: 'osm',
    interior: 'dukes_bar',
    blurb: 'Darts and dark wood on Rue de la Libération.'
  },
  {
    id: 'bar_rio', name: 'Bar’Rio', kind: 'pub', lat: 49.48260, lon: 6.08310,
    rotation: -0.2, size: { w: 15, d: 12, h: 9 }, src: 'osm',
    interior: 'bar_rio',
    blurb: 'Station bar on Avenue Grande-Duchesse Charlotte, opposite Dudelange-Ville.'
  },
  {
    id: 'cafe_italia', name: 'Café Italia', kind: 'pub', lat: 49.47053, lon: 6.08409,
    rotation: 0.15, size: { w: 15, d: 12, h: 9 }, src: 'osm',
    interior: 'cafe_italia',
    blurb: 'Italian quarter café on Rue Grand-Duc Adolphe, espresso and a cold Battin.'
  },
  {
    id: 'charbonnade', name: 'Restaurant La Charbonnade', kind: 'restaurant', lat: 49.47903, lon: 6.08576,
    rotation: -0.2, size: { w: 20, d: 14, h: 9 }, src: 'osm',
    interior: 'charbonnade', cuisine: 'Grill / Luxembourgish',
    blurb: 'Meat on hot stones, five minutes from Dudelange-Ville station.'
  },
  {
    id: 'parc_leh_rest', name: 'Parc Le’h Restaurant', kind: 'restaurant', lat: 49.48642, lon: 6.09956,
    rotation: 0.5, size: { w: 26, d: 16, h: 8 }, src: 'osm',
    interior: 'parc_leh', cuisine: 'French',
    blurb: 'Terrace restaurant inside Parc Le’h, the woods and adventure park above Burange.'
  },
  {
    id: 'amarcord', name: 'Brasserie Amarcord', kind: 'restaurant', lat: 49.47940, lon: 6.08760,
    rotation: 0.0, size: { w: 18, d: 13, h: 8 }, src: 'approx',
    interior: 'amarcord', cuisine: 'French / Italian',
    blurb: 'Corner brasserie in the Italien quarter, a Dudelange institution.'
  },
  {
    id: 'chang_man', name: 'Chang Man', kind: 'restaurant', lat: 49.47740, lon: 6.08840,
    rotation: 0.1, size: { w: 16, d: 13, h: 8 }, src: 'approx',
    interior: 'chang_man', cuisine: 'Chinese',
    blurb: 'Sichuan kitchen off Route de Zoufftgen.'
  },
  {
    id: 'steak_house', name: 'Restaurant Steak House', kind: 'restaurant', lat: 49.47760, lon: 6.08560,
    rotation: 0.0, size: { w: 17, d: 13, h: 8 }, src: 'approx',
    interior: 'steak_house', cuisine: 'Steakhouse',
    blurb: 'Steak-frites and a busy terrace between Rue du Commerce and Rue de la Libération.'
  },
  {
    id: 'douro', name: 'Douro Café-Restaurant', kind: 'restaurant', lat: 49.47890, lon: 6.08630,
    rotation: 0.25, size: { w: 17, d: 13, h: 8 }, src: 'approx',
    interior: 'douro', cuisine: 'Portuguese',
    blurb: 'Portuguese kitchen off Route de Zoufftgen — bacalhau, francesinha and a terrace that never empties.'
  },
  {
    id: 'sushi_ebi', name: 'Ebi Sushi', kind: 'restaurant', lat: 49.48631, lon: 6.07261,
    rotation: -0.15, size: { w: 14, d: 12, h: 8 }, src: 'osm',
    interior: 'sushi_ebi', cuisine: 'Japanese',
    blurb: 'Small sushi counter a minute from Dudelange-Ville station.'
  },
  {
    id: 'gamja', name: 'Gamja', kind: 'restaurant', lat: 49.48120, lon: 6.08430,
    rotation: -0.1, size: { w: 15, d: 12, h: 8 }, src: 'approx',
    interior: 'gamja', cuisine: 'Korean',
    blurb: 'Korean kitchen a minute from Dudelange-Ville station.'
  },
  {
    id: 'mille9', name: 'Hôtel Mille 9 Sens', kind: 'hotel', lat: 49.47735, lon: 6.08545,
    rotation: 0.0, size: { w: 22, d: 15, h: 12 }, src: 'osm',
    interior: 'hotel',
    blurb: 'Family-run hotel at 10 Rue du Commerce, 350 m from Dudelange-Centre station.'
  },
  {
    id: 'stade', name: 'Stade John F. Kennedy', kind: 'sport', lat: 49.49050, lon: 6.08950,
    rotation: 0.0, size: { w: 105, d: 68, h: 8 }, src: 'osm',
    interior: null,
    blurb: 'Burange’s football ground, home of the town’s youth teams.'
  },
  {
    id: 'lycee', name: 'Lycée Nic-Biever', kind: 'school', lat: 49.48306, lon: 6.08946,
    rotation: 0.1, size: { w: 64, d: 26, h: 14 }, src: 'osm',
    interior: 'school',
    blurb: 'Secondary school in the centre; its courtyard is the town’s shortcut.'
  },
  {
    id: 'piscine', name: 'Piscine Municipale', kind: 'sport', lat: 49.48100, lon: 6.09010,
    rotation: 0.0, size: { w: 40, d: 24, h: 9 }, src: 'approx', interior: null,
    blurb: 'Municipal pool, open all summer.'
  },
  {
    id: 'rolling_mill', name: 'Former rolling mill (Walzwerk)', kind: 'industrial', lat: 49.47360, lon: 6.08080,
    rotation: 0.04, size: { w: 34, d: 600, h: 22 }, src: 'osm',
    interior: 'rolling_mill',
    blurb: 'The protected 600 m rolling mill of the ARBED works. Roof and cladding removed, steel skeleton kept; now home to a skate park and film-storage halls.'
  },
  {
    id: 'blast_furnace', name: 'Blast-furnace ruins', kind: 'industrial', lat: 49.47300, lon: 6.08420,
    rotation: 0.4, size: { w: 26, d: 26, h: 34 }, src: 'approx',
    interior: null,
    blurb: 'Fragment of the ARBED blast furnaces, demolished in 1984; the surviving tower is fenced as a monument.'
  },
  {
    id: 'water_tower', name: 'Steelworks water tower', kind: 'industrial', lat: 49.47180, lon: 6.08510,
    rotation: 0.0, size: { w: 14, d: 14, h: 30 }, src: 'approx',
    interior: null,
    blurb: 'The old water tower of the works, visible from the whole valley.'
  },
  {
    id: 'skatepark', name: 'Skate park Nei Schmelz', kind: 'leisure', lat: 49.47490, lon: 6.08460,
    rotation: 0.0, size: { w: 34, d: 24, h: 1.2 }, src: 'approx',
    interior: null,
    blurb: 'Concrete bowls under the mill hall, the town’s after-school meeting point.'
  },
  {
    id: 'mont_st_jean', name: 'Mont Saint-Jean (417 m)', kind: 'nature', lat: 49.49002, lon: 6.06057,
    rotation: 0.0, size: { w: 10, d: 10, h: 4 }, src: 'osm',
    interior: null,
    blurb: 'Gehaansbierg: Roman outpost, medieval castle ruins and the best view over the Minett.'
  },
  {
    id: 'kalebierg', name: 'Kalebierg (435 m)', kind: 'nature', lat: 49.46780, lon: 6.05600,
    rotation: 0.0, size: { w: 10, d: 10, h: 4 }, src: 'approx',
    interior: null,
    blurb: 'The commune’s highest point, a beech ridge above Budersberg.'
  },
  {
    id: 'parc_leh', name: 'Parc Le’h', kind: 'park', lat: 49.48600, lon: 6.09900,
    rotation: 0.0, size: { w: 260, d: 200, h: 1 }, src: 'osm',
    interior: null,
    blurb: 'Forest park with playground, treetop course and the restaurant terrace.'
  },
  {
    id: 'etang', name: 'Étang de Dudelange', kind: 'water', lat: 49.48030, lon: 6.08190,
    rotation: 0.0, size: { w: 70, d: 40, h: 1 }, src: 'approx',
    interior: null,
    blurb: 'Small pond by Rue de l’Étang, fed by the Diddelengerbaach.'
  }
];
