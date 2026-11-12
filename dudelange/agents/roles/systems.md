# Systems engineer — Engine & API

**Stage:** `systems` · **Script:** `scripts/07-systems.mjs`

## Charter

Deterministic world build, collision solver, save slots, HUD and the day/night clock.

## Inputs

- `public/js/core/town-data.js` — real anchors, streets, stations, elevation grid
- upstream reports in `data/reports/` where relevant

## Deliverables

- data/reports/systems.json
- determinism + save round-trip

## Quality gates

- same seed → same world
- save/read round-trip
- collision solver pushes out

The stage exits non-zero if a gate fails; the orchestrator marks it `failed`,
streams the failure to every connected client and stops the release agent.

## Handoff

playable build → QA

## Working notes

- Deterministic: same `WORLD_SEED` → identical world hash.
- Never hand-edit generated geometry; change `town-data.js` or the generator and
  re-run the pipeline so every downstream report is refreshed.
- Source accuracy is labelled per anchor (`osm`, `approx`, `model`). Keep that
  discipline when adding content.
