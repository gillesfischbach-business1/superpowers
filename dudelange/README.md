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
| `E` | interact — doors, tills, train doors, NPCs |
| `M` | town map · `J` journal/quests · `P` build agents · `Esc` pause |
| `F` | enter/leave the car · `R` board the train at a platform |

Start in the centre, walk north to Dudelange-Ville or south to Dudelange-Usines, buy groceries at
Cactus (28, Avenue Grande-Duchesse Charlotte) or Proxy Delhaize, eat at any of the nine restaurants,
climb to the Mont Saint-Jean ruins, and cross the Neischmelz site.

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
| 06 | retail-hospitality | `scripts/06-retail-hospitality.mjs` | shops, menus, prices |
| 07 | systems | `scripts/07-systems.mjs` | collision, saves, quests, instance budgets |
| 08 | qa | `scripts/08-qa.mjs` | reachability, geometry, budget, content gates |
| 09 | release | `scripts/09-release.mjs` | build report + release gate |

```bash
npm run pipeline          # all nine stages via the CLI
npm run pipeline:qa       # qa + release only
npm test                  # 11 invariants (transforms, doors, quests, shell contract)
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
- **Shops and restaurants** — real names and addresses (Cactus, Proxy Delhaize, Match, Mamma Mia,
  La Charbonnade, Ebi Sushi, Douro, Amarcord, Steak House, Chang Man, Gamja, Parc Le'h, Mille 9
  Sens).

## Layout

```
public/            index.html, agents.html, css, vendored three
public/js/core/    town-data (real data), geo, world (generation), interiors, quests
public/js/game/    textures, world-render, ui, audio, main
server/            zero-dependency http server + pipeline orchestrator
scripts/           the nine agent stage scripts + shared _lib
agents/            manifest.json + role briefs
data/reports/      per-agent gate reports · data/saves/ save slots
tests/             node:test invariants
```

## Coordinates

Gameplay frame: centre `49.4785, 6.0845`; `x` = east, `z` = south; 1° lat = 110 574 m,
1° lon ≈ 72.5 km. Gameplay bbox 49.4640–49.4980 N, 6.0545–6.1120 E.
