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

Every visitable interior (`public/js/core/interiors.js`, `HOURS` table) carries two fields:

| field | meaning |
|---|---|
| `hours` | an OSM `opening_hours` substring: day ranges, several services, overnight closes, `off`, `24/7` |
| `hoursSrc` | `web` = published by the venue and looked up · `typical` = a plausible Luxembourg rhythm |

Only **Why Not** is `web`: its listing gives Mon–Thu 10:00–01:00, Fri 10:00–01:00, Sat 10:00–03:00,
Sun 14:00–03:00. Every other schedule is `typical` — legal Sunday closing for shops (08:00–13:00),
restaurants with one rest day, pubs from late afternoon to 01:00/02:00/03:00 at the weekend, station
halls open before the first 60a and 24/7 for the hotel. Nothing pretends to be a specific
landlord's timetable. Feed a Google dataset through `npm run import:places` and its `openingHours`
field is carried through so that a `web`-grade schedule can replace the typical one per venue.

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
