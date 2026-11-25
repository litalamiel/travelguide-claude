# Travel Maps (prototype)

Map-first travel planner, design "V2": category icons along the top, place cards over a live map.

## What works
- Live, zoomable map (MapLibre GL + free OpenStreetMap tiles from OpenFreeMap, no key needed).
- Search places worldwide and add them; the category is guessed and can be changed.
- 11 categories: Eat, Coffee, Drinks, Sights, Views, Nature, Beaches, Museums, Shopping, Do, Stay. Must-see flag and notes.
- Import from a reel: paste the reel link; the server function `api/reel.js` reads the caption from Instagram's public embed page by itself, then the app finds place names and matches them on the map. If a reel can't be read (private, removed), the user can paste the caption instead.
- Plan trip: nights, max driving per day and pace → places grouped into days, ordered, with colored routes per day.
- Multiple maps: create, rename, switch and delete maps, one per trip. Each map keeps its own places.
- Creators can put a map up for sale: creator name, description, price, currency and how many places are free to preview. A buyer-page preview shows the free places and locks the rest. Checkout is not connected yet (next: accounts + database + Stripe Connect).
- Maps are saved in the browser (localStorage). A sample Lisbon map loads on first open.

## Hosting
- Vercel (recommended): import the repo; Vercel runs `api/reel.js` as a serverless function. Automatic caption reading needs this.
- GitHub Pages: static only, so `/api/reel` doesn't exist there and the import falls back to pasting the caption. Set `VITE_API_BASE` to the Vercel address to use its API from Pages.

## Run it
```
npm install
npm run dev
```
Open http://localhost:5173.

## Known limits / next steps
- Drive times are estimates (straight-line × 1.3 at 50 km/h). Next: Google Routes API.
- Search uses Photon (free OSM geocoder). Next: Google Places API (New). Google's terms require Google place data to be shown on a Google map, so the switch is map + search together: replace `src/MapView.tsx` and `src/geocode.ts`, key in `VITE_GOOGLE_MAPS_API_KEY`.
- Reel caption reading uses Instagram's public embed page, which Instagram can change or block at any time. For production, use Meta's official oEmbed API (a Meta app with oEmbed Read approval).
- Reel import reads the caption only. Next: a small server that transcribes the voiceover and reads video frames with AI.
- No accounts yet; data lives in one browser.
- Reel place detection learns from every confirm and fix (shared memory + Claude with past lessons as examples). Setup and how to teach it: [LEARNING.md](LEARNING.md).
