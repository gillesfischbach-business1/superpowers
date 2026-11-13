# Diddeleng — an open world of Dudelange

A single-player, browser-based 3D recreation of **Dudelange / Diddeleng** (canton Esch-sur-Alzette,
Luxembourg): the real rail line with its four stations, the real street skeleton traced from
OpenStreetMap, the Diddelengerbach valley with the Mont Saint-Jean and Kalebierg ridges, the
Neischmelz / former ARBED steelworks site, and a walk-in Cactus supermarket.

Everything is generated deterministically from seed `20261112` — no downloaded assets, no CDN, no
network access at runtime. Three.js is vendored in `public/vendor/`.

```
npm install
npm run serve        # supervisor: restarts the server if it ever stops
npm start            # http://localhost:5173        the game
                     # http://localhost:5173/agents the build dashboard
                     # http://localhost:5173/diag   self-check: WebGL, assets, boot
```

## Playing

| input | action |
|---|---|
| `W A S D` | walk |
| `Shift` | sprint |
| `E` | interact — doors, tills, taps, train doors, NPCs, and hot-wiring a parked car |
| `M` | town map · `J` journal/quests · `P` build agents · `Esc` pause |
| `F` | get out of the car you are driving |
| `T` (hold) | wait — the clock runs 55× faster until you let go |
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

**Pubs** — nine real cafés (Opa Café, Duke’s Bar, Bar’Rio, Café Italia, Yuppy Café, Red & Black,
Café Medya, Café Benfica, Why Not). Order at the bar, play darts, and watch the meter climb: the
walk weaves, the camera rolls, speech slurs, the car gets harder to steer — and at 1.25 you wake up
on a bench by the town hall a little poorer.

**Opening hours** — every shop, pub, restaurant, station hall and hotel runs on a real schedule.
Monday at 07:00 the bakery counters are lit; Sunday at 15:00 the supermarkets are dark. A closed
door refuses to open and tells you when to come back; Hold `T` and the clock fast-forwards until it does.
The day chip in the HUD shows the weekday and a ⏩ while you wait.

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

**Pubs.** Nine cafés are walkable: **Opa Café** (31 Place de l’Hôtel de Ville), **Duke’s Bar**
(Rue de la Libération), **Bar’Rio** (Avenue Grande-Duchesse Charlotte, opposite the station),
**Café Italia** (Rue Grand-Duc Adolphe), **Yuppy Café**, **Red & Black**, **Café Medya**,
**Café Benfica** and **Why Not** (81 Avenue Grande-Duchesse Charlotte). Order at the bar: Bofferding,
Diekirch, Battin fruité, Viez, Crémant, Quetsch, Kaffi mat Schnaps, or something soft. Every alcoholic drink fills the
drunkenness meter: the camera rolls, your walk weaves, speech slurs, darts get worse, driving gets
sloppier and the HUD blurs. Drink too much and you black out — you wake on a bench by the town hall,
lighter by €15–40, and the meter resets to tipsy. Sober up by waiting or by drinking water.

**Opening hours.** All 28 visitable interiors publish an OSM-style `opening_hours` string, parsed by
`public/js/core/hours.js` — a small, dependency-free subset: day ranges (`Mo-Fr`), multiple services
(`08:00-12:00,13:30-18:00`), overnight closing (`Tu-Sa 17:00-01:00` spills into the next morning),
`off`, and `24/7`.

| where | when |
|---|---|
| shops | Delhaize 07:30–20:00, Cactus shoppi 05:00–23:00, Sunday morning only — the petrol-station shop trades on into the evening |
| restaurants | lunch + dinner, closed one weekday |
| pubs | 17:00 → 01:00 midweek, 02:00–03:00 at the weekend |
| station halls & the hotel | 05:00/24 h — the 60a runs late |

Walk into a closed door and the prompt reads *“closed — opens Tu 17:00”*; `E` gives you a quiet
blip instead of an interior. Hold `T` to wait: time runs 55× faster, the day chip turns to `Tue ⏩`,
and the world rolls over to the next day at midnight. Each schedule carries `hoursSrc`: **`web` for
16 of the 28 venues**, whose published hours were looked up and are recorded with their source
(`hoursRef`) — every pub except Opa Café, Red & Black, Café Medya and Café Italia; all nine
restaurants; Delhaize and the Cactus shoppi. The remaining **12 are `typical`** — the town hall, the
church, the school, the station and hotel, plus the four cafés with no confirmable listing —
plausible Luxembourg rhythms rather than invented precision. Overnight specs, `24/7` and weekly
totals are checked by `tests/hours.test.mjs` and the retail/systems/qa gates, including that every
sourced schedule names where it came from.

## Download it as one file

```bash
npm run pack        # → diddeleng-<version>-<sha>.zip  (commit-exact, via git archive)
npm run pack -- --out ~/Downloads/diddeleng.zip
```

The archive is the committed tree — 92 files, ~2.7 MB unpacked, no `node_modules`, no save files —
and it runs on its own: unzip, `npm install` (one dependency: three), `npm start`. While the preview
is up it is also served at `/download/diddeleng.zip` (linked from `/diag`).

**No server at all:** `npm run build:standalone` bundles the whole game — three.js, every module,
the stylesheet — into one `diddeleng-standalone.html` (~740 kB). Open it from a `file://` URL or any
static host and it plays; only the save slot and the agent feed need the Node server, and the game
already tolerates their absence. It is served at `/standalone` too.

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
npm test                  # 33 invariants (world, cars, trains, forests, pubs, hours, module graph, boot,
                          #   failed-boot diagnostics, 400 frames of play, live traffic + train + ground
                          #   contact, single-file boot + play, shell, importer)
npm run preview -- --out docs/preview/street.png --x 33 --z 28 --yaw 1.8   # off-screen render, no GPU
npm run import:places -- dataset.json   # ingest a Google Maps dataset export
```

The server binds `0.0.0.0:5173`, answers `/health` (and `/healthz`, `/ping`) in under a millisecond
without touching the world, allows CORS preflight, and sends `no-cache` for every asset so a fixed
build can never be served stale. `npm run serve` wraps it in `scripts/serve-forever.mjs`, a
single-instance supervisor: a pid lock stops duplicates, it stands down if another server already
answers, and it restarts the child within a second of it stopping.

If the page stays empty, open `/diag`: it checks the WebGL 2 context, fetches every file the page
needs (status + MIME), then boots the game in a frame and reports the loader state. A blank build is
usually a missing export or a blocked GPU context, and both are now named on screen instead of
frozen behind a loading bar.

When a boot fails, the page says so in its own words: the error box carries the message, the boot
phase it died in, and a live probe of the frame (`WebGL 2: yes/no`, `storage`, `embedded`), plus a
link to the single-file build. The same payload is beaconed to `POST /api/errors`, so
`GET /api/errors` replays the last 25 client failures with their diagnostics — no console access,
no guessing.

## The ground is the authority

`scripts/preview-render.mjs` draws the live scene with a CPU rasteriser (there is no headless WebGL
here), which is how the geometry gets checked visually: `docs/preview/` holds a street, a station and
an aerial view. It found the bug that made the town look wrong — the terrain mesh could only sample
`terrainHeight()` every 40 m, so between vertices the drawn ground was up to 1.5 m away from the
height every road, house and kerb was placed at. Grass swallowed the streets and houses hung in the
air.

The fix is `public/js/core/heightfield.js`: one baked lattice, the renderer builds its triangles from
those nodes, and `ground(x, z)` interpolates the same triangles. Everything placed in the world asks
`ground`, so nothing can disagree with what is on screen. The QA pipeline now refuses to release a
build where a house floats, is buried, or a street climbs steeper than 30%.

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
  Mille 9 Sens, Opa Café, Duke's Bar, Bar'Rio, Café Italia, Yuppy Café, Red & Black, Café Medya,
  Café Benfica, Why Not).
- **Opening hours** — every interior carries `hours` + `hoursSrc` (+ `hoursRef` when sourced). 16 of
  28 venues run on their published schedule, read from the venue's own site or a directory
  (cactus.lu, delhaize.lu, changman.lu, restaurant-parcleh.lu, steakhousedudelang.wixsite.com,
  yellow.lu, restaurantguru, infobel); the other 12 are `typical` Luxembourg rhythms. See
  `docs/dudelange-sources.md` for the per-venue table. The Google importer carries real
  `openingHours` through when you feed it a dataset.

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
public/js/core/    town-data (real data), geo, world (generation), interiors, quests, train, hours
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
