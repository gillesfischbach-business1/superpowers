# Cartographer — Geodata

**Stage:** `cartographer` · **Script:** `scripts/01-cartographer.mjs`

## Charter

Treats OpenStreetMap anchors as canon: streets, quarters, stations, borders.

## Inputs

- `public/js/core/town-data.js` — real anchors, streets, stations, elevation grid
- upstream reports in `data/reports/` where relevant

## Deliverables

- data/reports/cartographer.json
- street & station anchors validated

## Quality gates

- 4 stations in line order
- all anchors inside bbox
- ≥ 15 named streets

The stage exits non-zero if a gate fails; the orchestrator marks it `failed`,
streams the failure to every connected client and stops the release agent.

## Handoff

metric road network + rail chainage → Urbanist, Rail engineer

## Working notes

- Deterministic: same `WORLD_SEED` → identical world hash.
- Never hand-edit generated geometry; change `town-data.js` or the generator and
  re-run the pipeline so every downstream report is refreshed.
- Source accuracy is labelled per anchor (`osm`, `approx`, `model`). Keep that
  discipline when adding content.
