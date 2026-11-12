/**
 * Interior specifications. The renderer turns these declarative rooms into
 * three.js geometry, so every visitable building is data, not hand-modelled
 * scenes. Used by worldgen validation and by the architect agent.
 */

const GROCERY = [
  { id: 'milk', name: 'Lait frais (1 l)', price: 1.35, cat: 'Frais', desc: 'Luxlait whole milk from Mersch.' },
  { id: 'bread', name: 'Baguette', price: 1.20, cat: 'Boulangerie', desc: 'Baked on site every morning.' },
  { id: 'eggs', name: 'Œufs (6)', price: 2.10, cat: 'Frais', desc: 'Free-range eggs from the Minett.' },
  { id: 'bofferding', name: 'Bofferding (6 × 33 cl)', price: 5.40, cat: 'Boissons', desc: 'The national pilsner, brewed in Bascharage.' },
  { id: 'diekirch', name: 'Diekirch (6 × 33 cl)', price: 5.20, cat: 'Boissons', desc: 'Amber lager, a Dudelange terrace classic.' },
  { id: 'gromperekichelcher', name: 'Gromperekichelcher', price: 3.20, cat: 'Traiteur', desc: 'Potato fritters with parsley — the national snack.' },
  { id: 'kachkeis', name: 'Kachkéis', price: 2.60, cat: 'Crémerie', desc: 'Soft cooked cheese, best on dark bread with mustard.' },
  { id: 'bouneschlupp', name: 'Bouneschlupp (soup)', price: 3.80, cat: 'Traiteur', desc: 'Green-bean soup with bacon and potato.' },
  { id: 'judd', name: 'Judd mat Gaardebounen', price: 8.90, cat: 'Traiteur', desc: 'Smoked pork collar with broad beans.' },
  { id: 'rieslingspascht', name: 'Rieslingspaschtéit', price: 4.50, cat: 'Boulangerie', desc: 'Pork-and-riesling pie, a Moselle speciality.' },
  { id: 'mettwurst', name: 'Mettwurst', price: 3.10, cat: 'Charcuterie', desc: 'Smoked sausage from the butcher counter.' },
  { id: 'viez', name: 'Viez (1 l)', price: 3.40, cat: 'Boissons', desc: 'Cloudy apple cider from the Gutland orchards.' },
  { id: 'moselle', name: 'Moselle Riesling', price: 9.80, cat: 'Boissons', desc: 'Dry white from the Luxembourg Moselle.' },
  { id: 'kugelhopf', name: 'Kugelhopf', price: 4.90, cat: 'Boulangerie', desc: 'Rum-soaked brioche with almonds.' },
  { id: 'bretzel', name: 'Bretzel', price: 1.10, cat: 'Boulangerie', desc: 'Salted, still warm.' },
  { id: 'chocolate', name: 'Chocolat de Diddeleng', price: 3.60, cat: 'Épicerie', desc: 'Dark chocolate stamped with the rolling mill.' }
];

const shopTemplate = (opts) => ({
  kind: 'shop',
  size: { w: 34, d: 24, h: 5 },
  palette: { floor: '#cfc9ba', wall: '#f4f1ea', accent: '#2a6f97', shelf: '#dcd6c8' },
  layout: {
    shelves: [
      { x: -9, z: -5, w: 1.6, d: 7, axis: 'z' }, { x: -5.4, z: -5, w: 1.6, d: 7, axis: 'z' },
      { x: -1.8, z: -5, w: 1.6, d: 7, axis: 'z' }, { x: 1.8, z: -5, w: 1.6, d: 7, axis: 'z' },
      { x: 5.4, z: -5, w: 1.6, d: 7, axis: 'z' }, { x: 9, z: -5, w: 1.6, d: 7, axis: 'z' },
      { x: -8, z: 4, w: 1.6, d: 6, axis: 'z' }, { x: -4.4, z: 4, w: 1.6, d: 6, axis: 'z' },
      { x: -0.8, z: 4, w: 1.6, d: 6, axis: 'z' }
    ],
    counters: [{ x: 10.5, z: 6.5, w: 6, d: 1.4, label: 'Caisse' }],
    fridges: [{ x: -13, z: 6.5, w: 6, d: 1.2 }],
    crates: [{ x: 13, z: -6, w: 2, d: 2 }, { x: -13.5, z: -6, w: 2, d: 2 }],
    plants: [{ x: -15, z: -9 }, { x: 14.5, z: 9 }],
    npcAt: { x: 10.5, z: 8.6, rot: Math.PI },
    exitAt: { x: 0, z: 10.4, rot: 0 },
    playerAt: { x: 0, z: 8.6, rot: Math.PI }
  },
  shop: { title: opts.name, items: opts.items || GROCERY },
  npc: { name: opts.npc, role: 'Caissière', line: opts.line, look: { shirt: '#2a6f97', hair: '#3b2f2a', skin: '#e8bfa0' } },
  blurb: opts.blurb
});

const restaurantTemplate = (opts) => ({
  kind: 'restaurant',
  size: { w: 22, d: 17, h: 4.4 },
  palette: { floor: '#8d6b4b', wall: opts.wall || '#f0e4cf', accent: opts.accent || '#9b2226', shelf: '#6b4a33' },
  layout: {
    tables: [
      { x: -7, z: -4 }, { x: -3.2, z: -4 }, { x: 0.6, z: -4 }, { x: 4.4, z: -4 },
      { x: -7, z: 1 }, { x: -3.2, z: 1 }, { x: 0.6, z: 1 }, { x: 4.4, z: 1 },
      { x: -5, z: 5.6 }, { x: 1, z: 5.6 }
    ],
    bar: { x: 8.5, z: -2, w: 2, d: 8 },
    kitchen: { x: -9, z: -6.4, w: 6, d: 2 },
    plants: [{ x: 9, z: 6 }, { x: -9.5, z: 6.5 }],
    paintings: [{ x: -6, z: -8.2 }, { x: 2, z: -8.2 }],
    npcAt: { x: 8.5, z: 2.5, rot: -Math.PI / 2 },
    exitAt: { x: 0, z: 7.6, rot: 0 },
    playerAt: { x: 0, z: 6.0, rot: Math.PI }
  },
  shop: { title: opts.name, items: opts.menu, kind: 'menu' },
  npc: { name: opts.npc, role: 'Serveur', line: opts.line, look: { shirt: opts.accent || '#9b2226', hair: '#241a16', skin: '#d9a982' } },
  blurb: opts.blurb
});

export const INTERIORS = {
  delhaize: shopTemplate({
    name: 'Proxy Delhaize — 59A Route de Zoufftgen',
    npc: 'Mme Schmit',
    line: 'Moien! The Gromperekichelcher are still warm. Everything on the shelves is for sale — press E at the till.',
    blurb: 'A small neighbourhood supermarket: narrow aisles, a bakery corner, and a fridge full of Luxembourgish beer.'
  }),
  match: shopTemplate({
    name: 'Match Dudelange — Schwaarze Wee',
    npc: 'Mr. Wagner',
    line: 'Big shop, small town. Take your time — the parking is free for two hours.',
    items: GROCERY.slice(0, 9),
    blurb: 'The bigger weekly shop on the edge of Burange.'
  }),
  cactus: shopTemplate({
    name: 'Cactus shoppi — 214 Route de Luxembourg',
    npc: 'Sandra',
    line: 'Just the essentials here. The Cactus hypermarket is a fifteen-minute drive.',
    items: GROCERY.slice(4, 12),
    blurb: 'Convenience store by the filling station on the road to Bettembourg.'
  }),
  mamma_mia: restaurantTemplate({
    name: 'Mamma Mia — 27 Place de l’Hôtel de Ville',
    npc: 'Giulia',
    line: 'Benvenuti! The oven is at 450 degrees. Sit anywhere you like.',
    accent: '#2a9d8f',
    menu: [
      { id: 'pizza_margherita', name: 'Pizza Margherita', price: 11.50, cat: 'Pizza', desc: 'San Marzano, fior di latte, basil.' },
      { id: 'pizza_diavola', name: 'Pizza Diavola', price: 13.50, cat: 'Pizza', desc: 'Spicy salami, chilli honey.' },
      { id: 'lasagne', name: 'Lasagne della casa', price: 14.00, cat: 'Pasta', desc: 'Twelve layers, ragù cooked since morning.' },
      { id: 'carbonara', name: 'Spaghetti Carbonara', price: 13.00, cat: 'Pasta', desc: 'Guanciale, pecorino, egg yolk.' },
      { id: 'tiramisu', name: 'Tiramisù', price: 6.50, cat: 'Dessert', desc: 'Mascarpone and espresso.' },
      { id: 'bofferding', name: 'Bofferding 33 cl', price: 3.20, cat: 'Boissons', desc: 'Cold, on the terrace.' }
    ],
    blurb: 'Pizzeria on the town-hall square, terrace chairs spilling onto the pavement.'
  }),
  charbonnade: restaurantTemplate({
    name: 'Restaurant La Charbonnade',
    npc: 'Marco',
    line: 'The stone is hot — put the meat on for thirty seconds a side. Trust me.',
    accent: '#6a4c93', wall: '#e8dcc6',
    menu: [
      { id: 'stone_beef', name: 'Bœuf sur pierre (250 g)', price: 26.00, cat: 'Spécialité', desc: 'Limousin beef, hot stone, three sauces.' },
      { id: 'stone_mixed', name: 'Assiette mixte sur pierre', price: 29.50, cat: 'Spécialité', desc: 'Beef, pork, chicken and gambas.' },
      { id: 'steak_frites', name: 'Steak-frites', price: 21.00, cat: 'Classique', desc: 'Maître d’hôtel butter, endless fries.' },
      { id: 'bouneschlupp', name: 'Bouneschlupp', price: 8.00, cat: 'Entrée', desc: 'The Luxembourgish classic.' },
      { id: 'moselle', name: 'Moselle Riesling (glass)', price: 5.50, cat: 'Boissons', desc: 'From the Schlechter estate.' }
    ],
    blurb: 'Meat cooked on hot stones, five minutes from Dudelange-Ville station.'
  }),
  parc_leh: restaurantTemplate({
    name: 'Parc Le’h Restaurant',
    npc: 'Claude',
    line: 'Sit on the terrace — the deer come out around dusk. The menu follows the seasons.',
    accent: '#386641', wall: '#efe6d2',
    menu: [
      { id: 'plat_terroir', name: 'Plat du terroir', price: 24.00, cat: 'Menu', desc: 'Whatever the market and the forest give today.' },
      { id: 'truite', name: 'Truite de la Sûre', price: 22.50, cat: 'Poisson', desc: 'Trout, brown butter, almonds.' },
      { id: 'judd', name: 'Judd mat Gaardebounen', price: 19.50, cat: 'Classique', desc: 'Smoked pork neck, broad beans, gromperekichelcher.' },
      { id: 'kniddelen', name: 'Kniddelen', price: 16.00, cat: 'Classique', desc: 'Flour dumplings with bacon cream.' },
      { id: 'kugelhopf', name: 'Kugelhopf', price: 6.00, cat: 'Dessert', desc: 'Warm, with crème anglaise.' }
    ],
    blurb: 'The restaurant inside Parc Le’h — forest on three sides, playground on the fourth.'
  }),
  amarcord: restaurantTemplate({
    name: 'Brasserie Amarcord',
    npc: 'Elena',
    line: 'A brasserie should be loud, no? Sit by the window and watch the Italien quarter.',
    accent: '#bc4749', wall: '#f1e9d8',
    menu: [
      { id: 'croque', name: 'Croque Amarcord', price: 12.50, cat: 'Brasserie', desc: 'Ham, Gruyère, béchamel, salad.' },
      { id: 'moules', name: 'Moules-frites', price: 19.00, cat: 'Brasserie', desc: 'Moselle white wine, celery, cream.' },
      { id: 'escalope', name: 'Escalope à la milanaise', price: 18.50, cat: 'Brasserie', desc: 'Spätzle and lemon.' },
      { id: 'cafe', name: 'Café complet', price: 7.50, cat: 'Café', desc: 'Coffee, croissant, juice.' }
    ],
    blurb: 'A corner brasserie in the Italian quarter, mirrors and red banquettes.'
  }),
  chang_man: restaurantTemplate({
    name: 'Chang Man',
    npc: 'Li Wei',
    line: 'Sichuan cooking — I can make it mild if you insist. The mapo tofu is the real thing.',
    accent: '#9d0208', wall: '#efe1cf',
    menu: [
      { id: 'mapo', name: 'Mapo tofu', price: 14.50, cat: 'Sichuan', desc: 'Sichuan pepper, chilli bean paste, minced pork.' },
      { id: 'dumplings', name: 'Dumplings (8)', price: 9.50, cat: 'Entrée', desc: 'Pork and cabbage, black vinegar.' },
      { id: 'noodles', name: 'Dan dan noodles', price: 13.00, cat: 'Nouilles', desc: 'Sesame, chilli oil, peanut.' },
      { id: 'tea', name: 'Jasmine tea', price: 3.00, cat: 'Boissons', desc: 'Bottomless pot.' }
    ],
    blurb: 'Sichuan kitchen off Route de Zoufftgen, red lanterns in the window.'
  }),
  steak_house: restaurantTemplate({
    name: 'Restaurant Steak House',
    npc: 'Steve',
    line: 'All our beef is Luxembourgish. And yes, the pepper sauce is a secret.',
    accent: '#5a3e2b', wall: '#e3d5c1',
    menu: [
      { id: 'entrecote', name: 'Entrecôte (300 g)', price: 27.50, cat: 'Steak', desc: 'Grilled over beech wood.' },
      { id: 'burger', name: 'Diddeleng Burger', price: 17.00, cat: 'Steak', desc: 'Beef, Kachkéis, caramelised onion.' },
      { id: 'salad', name: 'Salade de chèvre chaud', price: 14.00, cat: 'Entrée', desc: 'Warm goat cheese, honey, walnuts.' }
    ],
    blurb: 'Steak-frites and a busy terrace between Rue du Commerce and Rue de la Libération.'
  }),
  douro: restaurantTemplate({
    name: 'Douro Café-Restaurant',
    npc: 'Sr. Almeida',
    line: 'Bem-vindo! The bacalhau is from Lisbon, the wine is from the Douro, the football is from Benfica.',
    accent: '#1d3557', wall: '#f2e8d5',
    menu: [
      { id: 'bacalhau', name: 'Bacalhau à Brás', price: 18.50, cat: 'Portugais', desc: 'Salt cod, straw potatoes, onion, egg.' },
      { id: 'francesinha', name: 'Francesinha', price: 17.00, cat: 'Portugais', desc: 'The Porto sandwich, beer sauce, chips.' },
      { id: 'caldo', name: 'Caldo verde', price: 6.50, cat: 'Entrée', desc: 'Kale soup with chouriço.' },
      { id: 'vinho', name: 'Vinho do Douro (glass)', price: 5.00, cat: 'Boissons', desc: 'Red, robust, from the Douro valley.' }
    ],
    blurb: 'Portuguese café-restaurant in the Italien quarter — the community that followed the Italians into the works.'
  }),
  sushi_ebi: restaurantTemplate({
    name: 'Ebi Sushi',
    npc: 'Kenji',
    line: 'Twelve seats, one knife, fish delivered from Metz every morning. Omakase if you trust me.',
    accent: '#0b3d3b', wall: '#e8e4da',
    menu: [
      { id: 'omakase', name: 'Omakase (12 pieces)', price: 34.00, cat: 'Sushi', desc: 'Whatever came in this morning.' },
      { id: 'maki', name: 'Salmon maki (8)', price: 12.00, cat: 'Sushi', desc: 'Salmon, rice, nori, wasabi.' },
      { id: 'ramen', name: 'Shoyu ramen', price: 15.50, cat: 'Chaud', desc: 'Pork broth, egg, spring onion.' },
      { id: 'sake', name: 'Sake (glass)', price: 7.00, cat: 'Boissons', desc: 'Warm, junmai.' }
    ],
    blurb: 'Sushi counter near the Ville station.'
  }),
  gamja: restaurantTemplate({
    name: 'Gamja',
    npc: 'Ji-woo',
    line: 'Annyeong! Try the fried chicken with the honey glaze — and the kimchi is made here.',
    accent: '#e76f51', wall: '#f4ece2',
    menu: [
      { id: 'fried_chicken', name: 'Korean fried chicken', price: 16.00, cat: 'Coréen', desc: 'Double-fried, honey-soy glaze.' },
      { id: 'bibimbap', name: 'Bibimbap', price: 15.50, cat: 'Coréen', desc: 'Stone bowl, beef, seasonal namul.' },
      { id: 'kimchi', name: 'Kimchi', price: 5.00, cat: 'Entrée', desc: 'House-fermented napa cabbage.' },
      { id: 'soju_id', name: 'Soju (glass)', price: 5.50, cat: 'Boissons', desc: 'Cold, with cucumber.' }
    ],
    blurb: 'Korean kitchen a minute from Dudelange-Ville station.'
  }),
  townhall: {
    kind: 'civic',
    size: { w: 38, d: 19, h: 6 },
    palette: { floor: '#cfc6b4', wall: '#efe7d6', accent: '#7f5539', shelf: '#7a5c43' },
    layout: {
      desk: { x: 0, z: -6.5, w: 6, d: 1.2 },
      benches: [{ x: -6, z: 2 }, { x: -2, z: 2 }, { x: 2, z: 2 }],
      plants: [{ x: -15, z: 7 }, { x: 15, z: 7 }],
      paintings: [{ x: -8, z: -8.4 }, { x: 8, z: -8.4 }],
      npcAt: { x: 0, z: -8.2, rot: 0 },
      exitAt: { x: 0, z: 8.2, rot: 0 },
      playerAt: { x: 0, z: 6.4, rot: Math.PI }
    },
    npc: { name: 'Mme Kremer', role: 'Tourist office', line: 'Wëllkomm zu Diddeleng! Ask me for the town trail, the stations challenge or the steel heritage walk.', look: { shirt: '#7f5539', hair: '#6b5447', skin: '#e9c4a5' } },
    dialogue: 'townhall',
    blurb: 'Town-hall lobby: marble floor, a portrait of the 1907 council, and the tourist desk.'
  },
  church: {
    kind: 'church',
    size: { w: 19, d: 42, h: 14 },
    palette: { floor: '#b9b2a4', wall: '#eae4d6', accent: '#8d6e4f', shelf: '#6d4c33' },
    layout: {
      pews: Array.from({ length: 9 }, (_, i) => ({ x: 0, z: -8 + i * 3.4, w: 11, d: 0.9 })),
      altar: { x: 0, z: -16, w: 5, d: 2.4 },
      paintings: [{ x: -7, z: -4 }, { x: 7, z: -4 }, { x: -7, z: 6 }, { x: 7, z: 6 }],
      plants: [{ x: -8, z: 15 }, { x: 8, z: 15 }],
      npcAt: { x: -5, z: 12, rot: 0.6 },
      exitAt: { x: 0, z: 19, rot: 0 },
      playerAt: { x: 0, z: 17.4, rot: Math.PI }
    },
    npc: { name: 'Père Alphonse', role: 'Curé', line: 'Saint-Martin has stood here since 1901 — the same year the works hired a thousand men. Sit, the cool stone helps in July.', look: { shirt: '#1d1d1d', hair: '#cfc9bd', skin: '#e6c3a5' } },
    blurb: 'Neo-Gothic nave, stained glass donated by the steelworkers’ union.'
  },
  cna: {
    kind: 'gallery',
    size: { w: 46, d: 26, h: 7 },
    palette: { floor: '#d8d5cd', wall: '#f7f5f0', accent: '#1d3557', shelf: '#3d405b' },
    layout: {
      paintings: [
        { x: -14, z: -9.8, art: 'steel' }, { x: -6, z: -9.8, art: 'town' }, { x: 2, z: -9.8, art: 'portrait' },
        { x: 10, z: -9.8, art: 'landscape' }, { x: -14, z: 9.8, art: 'photo' }, { x: 8, z: 9.8, art: 'photo' }
      ],
      benches: [{ x: 0, z: 0 }, { x: -10, z: 4 }],
      plants: [{ x: -20, z: 10 }, { x: 20, z: 10 }],
      npcAt: { x: 18, z: 8, rot: -2.2 },
      exitAt: { x: 0, z: 10.8, rot: 0 },
      playerAt: { x: 0, z: 8.4, rot: Math.PI }
    },
    npc: { name: 'Curator Ana', role: 'CNA', line: 'This floor holds the photographic memory of the Minett. The mill photographs are from 1962 — the year the last furnace was still lit.', look: { shirt: '#1d3557', hair: '#2b2118', skin: '#cf9d7b' } },
    blurb: 'The national audiovisual centre’s gallery: steel photography and film archives.'
  },
  rolling_mill: {
    kind: 'industrial',
    size: { w: 32, d: 120, h: 20 },
    palette: { floor: '#8d8b83', wall: '#9aa0a1', accent: '#8b5e34', shelf: '#5c5c58' },
    layout: {
      gantries: Array.from({ length: 6 }, (_, i) => ({ x: 0, z: -45 + i * 18 })),
      crates: [{ x: -11, z: -20 }, { x: 11, z: 10 }, { x: -11, z: 30 }, { x: 11, z: -40 }],
      benches: [{ x: 5, z: 42 }],
      plants: [{ x: -13, z: 50 }, { x: 13, z: 50 }],
      npcAt: { x: -6, z: -30, rot: 1.2 },
      exitAt: { x: 0, z: 58, rot: 0 },
      playerAt: { x: 0, z: 55.4, rot: Math.PI },
      skate: { x: 4, z: 34 }
    },
    npc: { name: 'Hervé', role: 'Minett Trail guide', line: 'Six hundred metres of rolling mill. They took the roof off to save the steel. In 1984 they blew the furnaces — you can still find slag in the path.', look: { shirt: '#8b5e34', hair: '#4b3b2f', skin: '#dcb08f' } },
    blurb: 'The protected 600 m rolling mill, roof removed, steel skeleton intact — now a covered public space.'
  },
  station: {
    kind: 'station',
    size: { w: 24, d: 14, h: 5.4 },
    palette: { floor: '#c9c4b8', wall: '#e9e4d8', accent: '#004a99', shelf: '#5b6770' },
    layout: {
      benches: [{ x: -6, z: -2 }, { x: 0, z: -2 }, { x: 6, z: -2 }],
      desk: { x: 8, z: -5.4, w: 5, d: 1.2 },
      plants: [{ x: -10, z: 5 }, { x: 10, z: 5 }],
      ticketMachine: { x: -9, z: 5.2 },
      npcAt: { x: 7, z: -6.6, rot: 0 },
      exitAt: { x: 0, z: 6.4, rot: 0 },
      playerAt: { x: 0, z: 4.8, rot: Math.PI }
    },
    npc: { name: 'M. Hoffmann', role: 'CFL', line: 'Line 60a: Bettembourg, then Burange, Ville, Centre, Usines, and Volmerange over the border. Trains every twenty minutes on weekdays.', look: { shirt: '#004a99', hair: '#3a3a3a', skin: '#e2bfa1' } },
    dialogue: 'station',
    blurb: 'Station hall with a working departure board and a CFL ticket machine.'
  },
  hotel: {
    kind: 'hotel',
    size: { w: 20, d: 14, h: 4.6 },
    palette: { floor: '#7c5c3e', wall: '#efe3cf', accent: '#a47148', shelf: '#5f4130' },
    layout: {
      desk: { x: 0, z: -5.6, w: 5, d: 1.2 },
      sofas: [{ x: -6, z: 2 }, { x: 6, z: 2 }],
      plants: [{ x: -8, z: 6 }, { x: 8, z: 6 }],
      npcAt: { x: 0, z: -7, rot: 0 },
      exitAt: { x: 0, z: 6.6, rot: 0 },
      playerAt: { x: 0, z: 5 }
    },
    npc: { name: 'Mme Faber', role: 'Réception', line: 'Ten rooms, four languages, one coffee machine. The CNA is a ten-minute walk.', look: { shirt: '#a47148', hair: '#8b6b4a', skin: '#e8c8a8' } },
    blurb: 'Hôtel Mille 9 Sens on Rue du Commerce.'
  },
  school: {
    kind: 'school',
    size: { w: 50, d: 22, h: 6.6 },
    palette: { floor: '#c9c2ae', wall: '#f0ebdf', accent: '#2a9d8f', shelf: '#7d8b76' },
    layout: {
      benches: [{ x: -6, z: 0 }, { x: 0, z: 0 }, { x: 6, z: 0 }],
      desk: { x: 0, z: -8, w: 6, d: 1.2 },
      plants: [{ x: -18, z: 8 }, { x: 18, z: 8 }],
      npcAt: { x: 0, z: -9.4, rot: 0 },
      exitAt: { x: 0, z: 10.4, rot: 0 },
      playerAt: { x: 0, z: 8.8, rot: Math.PI }
    },
    npc: { name: 'M. Bernard', role: 'Concierge', line: 'The lycée is quiet after four. If you are looking for the stations challenge, the map is in the lobby.', look: { shirt: '#2a9d8f', hair: '#4b4b4b', skin: '#dcb492' } },
    blurb: 'Lycée Nic-Biever — the courtyard shortcut between centre and Italien.'
  }
};

/** Items the player can be asked to fetch, for quests. */
export const QUEST_ITEMS = {
  groceries: ['bread', 'milk', 'kachkeis'],
  dinner: ['plat_terroir']
};
