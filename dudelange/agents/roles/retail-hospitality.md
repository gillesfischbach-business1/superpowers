# Retail & hospitality — Shops & kitchens

**Stage:** `retail-hospitality` · **Script:** `scripts/06-retail-hospitality.mjs`

## Charter

Stocks the supermarkets with Luxembourgish products and writes the restaurant menus.

## Inputs

- `public/js/core/town-data.js` — real anchors, streets, stations, elevation grid
- upstream reports in `data/reports/` where relevant

## Deliverables

- data/reports/retail.json
- price list + menu audit

## Quality gates

- 3 supermarkets
- ≥ 8 restaurants
- quest items purchasable

The stage exits non-zero if a gate fails; the orchestrator marks it `failed`,
streams the failure to every connected client and stops the release agent.

## Handoff

shop & menu catalogues → Systems

## Working notes

- Deterministic: same `WORLD_SEED` → identical world hash.
- Never hand-edit generated geometry; change `town-data.js` or the generator and
  re-run the pipeline so every downstream report is refreshed.
- Source accuracy is labelled per anchor (`osm`, `approx`, `model`). Keep that
  discipline when adding content.
