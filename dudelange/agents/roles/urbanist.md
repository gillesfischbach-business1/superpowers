# Urbanist — Zoning & lots

**Stage:** `urbanist` · **Script:** `scripts/03-urbanist.mjs`

## Charter

Cuts building lots along real streets, keeps the rail corridor and parks clear, balances density per quarter.

## Inputs

- `public/js/core/town-data.js` — real anchors, streets, stations, elevation grid
- upstream reports in `data/reports/` where relevant

## Deliverables

- data/reports/urbanist.json
- district density table

## Quality gates

- 400–1600 buildings
- no lot on the rail corridor
- no lot inside parks or works core

The stage exits non-zero if a gate fails; the orchestrator marks it `failed`,
streams the failure to every connected client and stops the release agent.

## Handoff

lot schedule → Architect

## Working notes

- Deterministic: same `WORLD_SEED` → identical world hash.
- Never hand-edit generated geometry; change `town-data.js` or the generator and
  re-run the pipeline so every downstream report is refreshed.
- Source accuracy is labelled per anchor (`osm`, `approx`, `model`). Keep that
  discipline when adding content.
