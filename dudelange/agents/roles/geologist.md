# Geologist — Terrain & hydro

**Stage:** `geologist` · **Script:** `scripts/02-geologist.mjs`

## Charter

Builds the valley from EU-DEM 25 m samples, the Diddelengerbaach and the two summits.

## Inputs

- `public/js/core/town-data.js` — real anchors, streets, stations, elevation grid
- upstream reports in `data/reports/` where relevant

## Deliverables

- data/reports/geologist.json
- terrain profile north–south

## Quality gates

- Mont Saint-Jean 417 m ±18
- Thilleweier low 256 m ±14
- no NaN heights

The stage exits non-zero if a gate fails; the orchestrator marks it `failed`,
streams the failure to every connected client and stops the release agent.

## Handoff

heightfield + slopes → Urbanist, Architect

## Working notes

- Deterministic: same `WORLD_SEED` → identical world hash.
- Never hand-edit generated geometry; change `town-data.js` or the generator and
  re-run the pipeline so every downstream report is refreshed.
- Source accuracy is labelled per anchor (`osm`, `approx`, `model`). Keep that
  discipline when adding content.
