# Travel Maps (prototype)

Map-first travel planner, design "V2": category icons along the top, place cards over a live map.

## What works
- Live, zoomable map (MapLibre GL + free OpenStreetMap tiles from OpenFreeMap, no key needed).
- Search places worldwide and add them; the category is guessed and can be changed.
- 11 categories: Eat, Coffee, Drinks, Sights, Views, Nature, Beaches, Museums, Shopping, Do, Stay. Must-see flag and notes.
- Import from a reel (first version): paste the reel link and caption; the app finds place names in the caption and matches them on the map.
- Plan trip: nights, max driving per day and pace → places grouped into days, ordered, with colored routes per day.
- Places are saved in the browser (localStorage). Sample Lisbon places load on first open.

## Run it
```
npm install
npm run dev
```
Open http://localhost:5173.

## Known limits / next steps
- Drive times are estimates (straight-line × 1.3 at 50 km/h). Next: Google Routes API.
- Search uses Photon (free OSM geocoder). Next: Google Places API (New). Google's terms require Google place data to be shown on a Google map, so the switch is map + search together: replace `src/MapView.tsx` and `src/geocode.ts`, key in `VITE_GOOGLE_MAPS_API_KEY`.
- Reel import reads the caption only. Next: a small server that transcribes the voiceover and reads video frames with AI.
- No accounts yet; data lives in one browser.
