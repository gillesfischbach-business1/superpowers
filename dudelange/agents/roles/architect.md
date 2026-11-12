# Architect — Buildings & interiors

**Stage:** `architect` · **Script:** `scripts/04-architect.mjs`

## Charter

Gives every lot a style, roof, shopfront and window grid; furnishes the 17 visitable interiors.

## Inputs

- `public/js/core/town-data.js` — real anchors, streets, stations, elevation grid
- upstream reports in `data/reports/` where relevant

## Deliverables

- data/reports/architect.json
- facade + interior inventory

## Quality gates

- ≥ 15 interiors
- every shop stocked
- every restaurant has a menu

The stage exits non-zero if a gate fails; the orchestrator marks it `failed`,
streams the failure to every connected client and stops the release agent.

## Handoff

mesh specs + room specs → Systems

## Working notes

- Deterministic: same `WORLD_SEED` → identical world hash.
- Never hand-edit generated geometry; change `town-data.js` or the generator and
  re-run the pipeline so every downstream report is refreshed.
- Source accuracy is labelled per anchor (`osm`, `approx`, `model`). Keep that
  discipline when adding content.
