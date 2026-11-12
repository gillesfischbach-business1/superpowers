# Where the Dudelange data comes from

Every fact in the world is either traced from a public source or explicitly marked as an
approximation. `public/js/core/town-data.js` carries a `src` field on each entry:

| `src` | meaning |
|---|---|
| `osm` | coordinates traced from OpenStreetMap (Nominatim `polygon_geojson=1`) |
| `approx` | placed from a known address or a written description, not surveyed |
| `google` | imported from a Google Maps Scraper dataset export (see below) |
| `model` | invented geometry for something that no longer exists (e.g. the 1882 furnaces) |

## Sources used

- **OpenStreetMap / Nominatim** — streets, four CFL stations, landmarks, pubs, restaurants.
  Free-text queries only (`"<Street>, Dudelange"` with `format=jsonv2&polygon_geojson=1`);
  structured `street=`/`city=` queries return nothing.
- **opentopodata, EU-DEM 25 m** — the 10 × 10 elevation lattice, 256 m at the French border
  to 441 m on the west ridge.
- **dudelange.lu, CFL** — line 60a: Luxembourg – Bettembourg – Dudelange – Volmerange-les-Mines,
  stops Burange, Ville, Centre, Usines.
- **Wikipedia / Wikimonde** — canton Esch-sur-Alzette, town since 1907, 21.38 km², the
  Diddelengerbach valley, the Minett iron basin, Mont Saint-Jean 405–417 m with castle ruins.
- **RTL Today (Oct 2024)** — Neischmelz/ARBED: 1882–2005, furnaces demolished and rolling mill
  closed 1984, 40 ha site, 11 heritage buildings, the 600 m rolling mill reused by the CNA.

## Pubs and cafés (all traced from OSM)

| Venue | Address | Quarter |
|---|---|---|
| Opa Café | 31 Place de l’Hôtel de Ville | centre |
| Duke’s Bar | Rue de la Libération | Italien |
| Bar’Rio | Avenue Grande-Duchesse Charlotte | by Ville station |
| Café Italia | Rue Grand-Duc Adolphe | Italien |
| Yuppy Café | Avenue Grande-Duchesse Charlotte | Italien |
| Red & Black | Route de Zoufftgen | Italien |
| Café Medya | Rue Louis Pasteur | Burange |
| Café Benfica | Rue de la Libération | Italien |
| Why Not | 81 Avenue Grande-Duchesse Charlotte | centre |

Why Not comes from Nominatim free-text search on `81 Avenue Grande-Duchesse Charlotte`
(node 12097342638, 49.48014 / 6.08540); the 81 address number is the one published in its own
opening-hours listing.

Rue Grand-Duc Adolphe was added as a real OSM polyline (ways 137523303 / 273971692) so that
Café Italia has a street in front of it instead of sitting in a field.

## Opening hours

Every visitable interior (`public/js/core/interiors.js`, `HOURS` table) carries three fields:

| field | meaning |
|---|---|
| `hours` | an OSM `opening_hours` substring: day ranges, several services, overnight closes, `off`, `24/7` |
| `hoursSrc` | `web` = published by the venue / a directory and looked up · `typical` = a plausible Luxembourg rhythm |
| `hoursRef` | present on every `web` row: where the schedule came from |

16 of the 28 venues are `web`:

| venue | schedule | source |
|---|---|---|
| Cactus shoppi (214 Route de Luxembourg) | Mo–Sa 05:00–23:00 · Su 09:00–21:00 | cactus.lu, shop page for Dudelange Esso |
| Proxy Delhaize (59A Route de Zoufftgen) | Mo–Sa 07:30–20:00 · Su 07:30–13:00 | delhaize.lu listing mirrored by directory data |
| Mamma Mia (27 Pl. de l’Hôtel de Ville) | Tu–Su 11:30–14:00, 18:30–22:30 · Mo closed | restaurantguru + gastronomie.lu |
| La Charbonnade (10 Rue du Commerce) | Tu–Sa 11:00–14:00, 18:00–22:00 · Su, Mo closed | restaurantguru (also “closed Sundays & Mondays” in reviews) |
| Parc Le’h (1 Rue de la Forêt) | Tu–Su 12:00–14:00, 19:00–22:00 · Mo closed | restaurant-parcleh.lu |
| Amarcord (1a Rue du Centenaire) | daily 10:00–23:00 | tripadvisor + restaurantguru |
| Chang Man (99 Rue de la Libération) | daily 11:30–14:30, 18:00–22:00 · Tu closed | changman.lu (own site) |
| Steak House (13 Rue du Commerce) | Th–Su 12:00–14:00, 18:30–22:00 · We dinner only · Mo, Tu closed | steakhousedudelang.wixsite.com |
| Douro (229 Rue de la Libération) | Tu–Su 11:45–13:45, 18:30–21:15 · Mo closed | restaurantguru + miammiam.lu |
| Sushi Ebi (near Ville station) | Tu–Fr 11:00–14:00, 17:30–22:00 · Sa dinner only · Su from 11:30 · Mo closed | restaurantguru |
| Gamja (11 Pl. de l’Hôtel de Ville) | Mo 18:00–22:00 · Tu–Sa 12:00–14:00, 18:00–22:00 · Su 12:00–14:00 | restaurantguru + tripadvisor |
| Duke’s Bar (15 Rue de la Libération) | Mo–Th 10:00–01:00 · Fr, Sa 10:00–03:00 · Su 10:00–01:00 | restaurantguru |
| Bar’Rio (6 Av. Grande-Duchesse Charlotte) | Mo–Sa 06:00–01:00 · Su 07:00–01:00 | restaurantguru + polomap |
| Yuppy Café (32 Av. Grande-Duchesse Charlotte) | Mo–Th 08:00–21:00 · Fr 08:00–23:00 · Sa 09:00–20:00 · Su 09:00–19:00 | yellow.lu + restaurantguru |
| Café Benfica (179 Rue de la Libération) | Mo, Su 09:00–18:00 · Tu, Fr, Sa 09:00–01:00 · We, Th 09:00–23:00 | infobel + waze business data |
| Why Not (81 Av. Grande-Duchesse Charlotte) | Mo–Fr 10:00–01:00 · Sa 10:00–03:00 · Su 14:00–03:00 | the venue’s own listing |

The other 12 are `typical`: Match (approximated building, no published schedule), Opa Café,
Red & Black, Café Medya and Café Italia (no confirmable listing — Café Medya’s aggregator entries
even disagree on whether it still trades, so no hours are claimed), the town hall, the church, the
CNA, the rolling-mill shed, the station halls, the hotel and the school.

Two rules the data follows: shops keep Luxembourg Sunday trading (morning only — the
petrol-station shoppi is the licensed exception and stays open until 21:00), and no schedule
invents a closed day for a venue whose listing shows seven-day opening.

The engine (`public/js/core/hours.js`) is a dependency-free subset of the OSM spec, shared by the
game, `npm test` and three pipeline gates (retail, systems, qa).

## Importing richer venue facts (Google Maps Scraper)

The game's own data is OSM-based, so ratings and price brackets are missing, and most opening
hours are the `typical` kind described above.
`scripts/import-places.mjs` ingests a **Google Maps Scraper** dataset
(`compass/crawler-google-places` on Apify) and normalises it into the project:

```bash
# 1. run the actor once for the commune (paid: from $1.50 per 1,000 places)
apify call compass/crawler-google-places --silent --output-dataset > places.json
#    input: searchStringsArray ["pub","café","restaurant","supermarket"],
#           locationQuery "Dudelange, Luxembourg", language "en",
#           maxCrawledPlacesPerSearch 200, skipClosedPlaces true

# 2. filter, classify and de-duplicate against the world
npm run import:places -- places.json
```

It writes `data/imported/places.json` (normalised, inside the commune bbox) and
`data/imported/pending-landmarks.json` (entries that are not in the world yet, with a suggested
footprint). Nothing is merged into the game automatically: entries are reviewed and pasted into
`town-data.js` with a `src: 'google'` marker, so the provenance stays readable.

The importer needs no API token of its own — it only reads the dataset file. Running the actor
costs money on Apify (reviews and social-profile enrichment dominate the price), so it is left
as an explicit, opt-in step rather than something the build triggers.
