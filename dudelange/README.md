# Diddeleng — an open world of Dudelange

A single-player, browser-based 3D recreation of **Dudelange / Diddeleng** (canton Esch-sur-Alzette,
Luxembourg): the real rail line with its four stations, the real street skeleton traced from
OpenStreetMap, the Diddelengerbach valley with the Mont Saint-Jean and Kalebierg ridges, the
Neischmelz / former ARBED steelworks site, and a walk-in Cactus supermarket.

Everything is generated deterministically from seed `20261112` — no downloaded assets, no CDN, no
network access at runtime. Three.js is vendored in `public/vendor/`.

```
npm install
npm start            # http://localhost:5173        the game
                     # http://localhost:5173/agents the build dashboard
```

## Playing

| input | action |
|---|---|
| `W A S D` | walk |
| `Shift` | sprint |
| `E` | interact — doors, tills, taps, train doors, NPCs, and hot-wiring a parked car |
| `M` | town map · `J` journal/quests · `P` build agents · `Esc` pause |
| `F` | get out of the car you are driving |
| `E` at a platform | board the 60a when the doors open |

Start in the centre, walk north to Dudelange-Ville or south to Dudelange-Usines, buy groceries at
Cactus (28, Avenue Grande-Duchesse Charlotte) or Proxy Delhaize, eat at any of the nine restaurants,
climb to the Mont Saint-Jean ruins, and cross the Neischmelz site.

**Cars** — 34 parked cars, one of them yours. Everything else can be hot-wired with `E`, and moving
traffic can be carjacked at the lights. Cars have their own colliders, crash sounds and a stolen
counter; two thefts complete the *Wheels of your own* quest.

**Trains** — line 60a runs Burange → Ville → Centre → Usines, brakes into every platform, dwells
18 s with the doors open, and reverses at the terminus. Board with `E` at any open door.

**Forests** — four walking trails (Mont Saint-Jean, Parc Le’h, the valley woods, the étang path),
carved through 5 278 trees with 3 950 solid trunks, 1 920 clumps of fern and bramble, and eight
glades with a fire ring and a lantern.

**Pubs** — eight real cafés from OSM (Opa Café, Duke’s Bar, Bar’Rio, Café Italia, Yuppy Café,
Red & Black, Café Medya, Café Benfica). Order at the bar, play darts, and watch the meter climb:
the walk weaves, the camera rolls, speech slurs, the car gets harder to steer — and at 1.25 you
wake up on a bench by the town hall a little poorer.

## Getting around

**Cars.** Thirty-four cars are parked along the streets; one of them, a red hatchback by the
town-hall square, is yours. Every other car can be hot-wired with `E` — they count towards the
*Wheels of your own* objective. Moving traffic can be carjacked too (you get a small XP reward and a
very annoyed driver). Cars are solid objects: they push the player out, bounce off buildings, and
sit on the terrain with a slope-following pitch.

**Trains.** Line 60a shuttles between Burange, Ville, Centre and Usines, brakes properly for each
platform (the braking curve lives in `public/js/core/train.js`, shared with the rail agent), waits
18 s with the doors open, announces the next stop, and reverses at either terminus. Stand anywhere
along a platform and press `E` when the doors open.

**Forests.** The hills are real woods now: thickets of deciduous trees with solid trunks you can
walk between, five undergrowth clumps per 10 m² of forest edge, and four waymarked trails —
Mont Saint-Jean, Parc Le’h, the valley and the ridge — cut through the trees with glades, log seats
and lanterns where you can stop.

**Pubs.** Four real Dudelange pubs are walkable: **Opa Café** (31 Place de l’Hôtel de Ville),
**Duke’s Bar** (Rue de la Libération), **Bar’Rio** (Avenue Grande-Duchesse Charlotte, opposite the
station) and **Café Italia** (Rue Grand-Duc Adolphe). Order at the bar: Bofferding, Diekirch, Battin
fruité, Viez, Crémant, Quetsch, Kaffi mat Schnaps, or something soft. Every alcoholic drink fills the
drunkenness meter: the camera rolls, your walk weaves, speech slurs, darts get worse, driving gets
sloppier and the HUD blurs. Drink too much and you black out — you wake on a bench by the town hall,
lighter by €15–40, and the meter resets to tipsy. Sober up by waiting or by drinking water.

## The multi-agent pipeline

Nine specialist agents each own a stage, a script and a set of acceptance gates. The orchestrator
(`server/pipeline.js`) runs them in order, streams output over SSE, and persists state to
`data/agents-state.json`.

| # | agent | script | delivers |
|---|---|---|---|
| 01 | cartographer | `scripts/01-cartographer.mjs` | OSM anchors, streets, quarters, stations |
| 02 | geologist | `scripts/02-geologist.mjs` | elevation grid, valley, slopes |
| 03 | urbanist | `scripts/03-urbanist.mjs` | street network, lots, buildings, trees, POIs |
| 04 | architect | `scripts/04-architect.mjs` | styles, windows, shopfronts, interiors |
| 05 | rail-engineer | `scripts/05-rail-engineer.mjs` | rail geometry, platforms, timetable |
| 06 | retail-hospitality | `scripts/06-retail-hospitality.mjs` | shops, menus, pubs, drinks |
| 07 | systems | `scripts/07-systems.mjs` | collision, saves, quests, instance budgets |
| 08 | qa | `scripts/08-qa.mjs` | reachability, geometry, budget, content gates |
| 09 | release | `scripts/09-release.mjs` | build report + release gate |

```bash
npm run pipeline          # all nine stages via the CLI
npm run pipeline:qa       # qa + release only
npm test                  # 17 invariants (world, cars, trains, forests, pubs, shell, importer)
npm run import:places -- dataset.json   # ingest a Google Maps dataset export
```

Role briefs live in `agents/roles/`; the machine-readable contract is `agents/manifest.json`.
Every stage writes `data/reports/<agent>.json`, and the release agent composes
`docs/build-report.md`.

## Data provenance

- **Streets, stations, landmarks** — OpenStreetMap via Nominatim (`polygon_geojson=1`). Each entry in
  `public/js/core/town-data.js` carries `src: 'osm' | 'approx' | 'model'` so approximations are
  explicit.
- **Elevation** — EU-DEM 25 m samples (opentopodata) in a 10 × 10 lattice, 256 m at the French
  border up to 441 m on the west ridge.
- **Steelworks** — Neischmelz: ARBED/ArcelorMittal 1882–2005, furnaces demolished and rolling mill
  closed 1984; the 600 m rolling mill hall is recreated as the CNA film-studio shed with a skate
  park in front.
- **Shops, restaurants and pubs** — real names and coordinates (Cactus, Proxy Delhaize, Match,
  Mamma Mia, La Charbonnade, Ebi Sushi, Douro, Amarcord, Steak House, Chang Man, Gamja, Parc Le'h,
  Mille 9 Sens, Opa Café, Duke's Bar, Bar'Rio, Café Italia).

### Importing richer venue data (Google Maps)

The game is built from OpenStreetMap + hand-checked facts, so nothing here needs an API key. If you
want Google-level venue detail (ratings, price brackets, opening hours, phones), run the
[Google Maps Scraper](https://apify.com/compass/crawler-google-places) actor — for example with
`searchStringsArray: ["restaurant", "pub", "bar", "cafe", "supermarket"]` and
`locationQuery: "Dudelange, Luxembourg"` — export the dataset as JSON and feed it in:

```bash
npm run import:places -- ~/Downloads/dataset_google-maps.json
```

The importer filters to the commune bbox, maps Google categories onto the game's kinds
(`pub` / `restaurant` / `shop` / `school` / `hotel` / `park`), de-duplicates against landmarks that
already exist, and writes `data/imported/places.json` plus
`data/imported/pending-landmarks.json` — ready-to-paste entries using the `town-data.js` schema. It
never edits the world by itself, and it flags places that fall outside the current gameplay bbox.

## Layout

```
public/            index.html, agents.html, css, vendored three
public/js/core/    town-data (real data), geo, world (generation), interiors, quests, train
public/js/game/    textures, world-render, ui, audio, main
server/            zero-dependency http server + pipeline orchestrator
scripts/           the nine agent stage scripts, shared _lib, import-places
agents/            manifest.json + role briefs
data/reports/      per-agent gate reports · data/saves/ save slots
tests/             node:test invariants
```

## Coordinates

Gameplay frame: centre `49.4785, 6.0845`; `x` = east, `z` = south; 1° lat = 110 574 m,
1° lon ≈ 72.5 km. Gameplay bbox 49.4640–49.4980 N, 6.0545–6.1120 E.
