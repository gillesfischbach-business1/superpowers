# QA · gatekeeper — Validation

**Stage:** `qa` · **Script:** `scripts/08-qa.mjs`

## Charter

Fails the build on unreachable POIs, bad geometry, missing interiors or a blown performance budget.

## Inputs

- `public/js/core/town-data.js` — real anchors, streets, stations, elevation grid
- upstream reports in `data/reports/` where relevant

## Deliverables

- data/reports/qa.json
- pass/fail matrix

## Quality gates

- no unreachable POI
- ≤ 1,600 buildings
- all interiors enterable
- no NaN geometry

The stage exits non-zero if a gate fails; the orchestrator marks it `failed`,
streams the failure to every connected client and stops the release agent.

## Handoff

green build → Release

## Working notes

- Deterministic: same `WORLD_SEED` → identical world hash.
- Never hand-edit generated geometry; change `town-data.js` or the generator and
  re-run the pipeline so every downstream report is refreshed.
- Source accuracy is labelled per anchor (`osm`, `approx`, `model`). Keep that
  discipline when adding content.
