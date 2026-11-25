import { guessCategory } from './categories';
import type { CategoryId } from './types';

export interface SearchResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: CategoryId;
  /** OpenStreetMap kind, e.g. "tourism:hotel" or "highway:residential". */
  osm?: string;
  /** Two-letter country code, e.g. "AT". */
  cc?: string;
}

// Photon (by Komoot) is a free, keyless OpenStreetMap geocoder. It is fine for a
// prototype; for production we swap this for Google Places (see README).
// Photon (OpenStreetMap search) is the main search. When it's down or busy, OpenStreetMap's
// Nominatim is used instead: stricter (every word must match) and limited to one search a second.
let photonDownUntil = 0;
let nominatimQueue: Promise<unknown> = Promise.resolve();
const nominatimSlot = () => {
  const turn = nominatimQueue.then(() => new Promise((ok) => setTimeout(ok, 1100)));
  nominatimQueue = turn;
  return nominatimQueue;
};

async function searchNominatim(query: string, osmTags: string[], limit: number): Promise<SearchResult[]> {
  await nominatimSlot();
  const params = new URLSearchParams({ q: query, format: 'jsonv2', addressdetails: '1', limit: String(Math.min(limit * 2, 20)), 'accept-language': 'en' });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const rows: any[] = await res.json();
  return rows.map((r) => {
    const a = r.address ?? {};
    const osm = `${r.category}:${r.type}`;
    return {
      name: r.name || String(r.display_name ?? query).split(',')[0],
      address: [a.road, a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality, a.country].filter(Boolean).join(', '),
      lat: Number(r.lat), lng: Number(r.lon),
      category: guessCategory(r.category, r.type),
      osm, cc: a.country_code ? String(a.country_code).toUpperCase() : undefined,
    } satisfies SearchResult;
  }).filter((r) => !osmTags.length || osmTags.some((t) => r.osm === t || r.osm.startsWith(`${t}:`))).slice(0, limit);
}

export async function searchPlaces(query: string, near?: { lat: number; lng: number }, osmTags: string[] = [], limit = 6): Promise<SearchResult[]> {
  if (Date.now() < photonDownUntil) return searchNominatim(query, osmTags, limit);
  const params = new URLSearchParams({ q: query, limit: String(limit), lang: 'en' });
  osmTags.forEach((t) => params.append('osm_tag', t));
  if (near) {
    params.set('lat', String(near.lat));
    params.set('lon', String(near.lng));
  }
  let res: Response;
  try {
    res = await fetch(`https://photon.komoot.io/api/?${params}`);
  } catch {
    photonDownUntil = Date.now() + 5 * 60_000;
    return searchNominatim(query, osmTags, limit);
  }
  if (res.status === 429 || res.status >= 500) {
    photonDownUntil = Date.now() + 5 * 60_000;
    return searchNominatim(query, osmTags, limit);
  }
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = await res.json();
  return (data.features ?? []).map((f: any) => {
    const p = f.properties ?? {};
    const [lng, lat] = f.geometry.coordinates;
    const address = [p.street, p.city ?? p.town ?? p.village, p.country].filter(Boolean).join(', ');
    return {
      name: p.name ?? p.street ?? query,
      address,
      lat,
      lng,
      category: guessCategory(p.osm_key, p.osm_value),
      osm: `${p.osm_key}:${p.osm_value}`,
      cc: p.countrycode ? String(p.countrycode).toUpperCase() : undefined,
    } satisfies SearchResult;
  });
}

export interface CaptionPlace {
  /** What to search for. */
  query: string;
  /** City or area mentioned with it, used to narrow the search. */
  area?: string;
  /** Category the caption hints at (hotel, restaurant…), if any. */
  hint?: CategoryId;
  /** How sure we are this is a place: a 📍 pin is the strongest signal. */
  from: 'pin' | 'at' | 'hashtag' | 'name';
}

// Words and emoji in a caption that say what kind of place it is.
const HINTS: [CategoryId, RegExp][] = [
  ['stay', /\b(hotel|hostel|resort|suites?|guest ?house|villa|airbnb|bnb|stay(ed|ing)?|check[- ]?in|our room|boutique hotel|pousada|riad|lodge|glamping)\b|🏨|🛏️?|🛌/iu],
  ['eat', /\b(restaurant|dinner|lunch|brunch|eat(ing)?|food|dish(es)?|menu|chef|tasting|pizza|pasta|sushi|ramen|tacos?|burgers?|seafood|steak|bistro|trattoria|tasca|taberna)\b|🍽️?|🍝|🍕|🍣|🍜|🌮|🍔|🥘|🦞|🦐/iu],
  ['coffee', /\b(coffee|caf[eé]|latte|espresso|cappuccino|bakery|pastr(y|ies)|croissants?|breakfast|pastel(is)? de nata)\b|☕|🥐|🧁/iu],
  ['drinks', /\b(bar|cocktails?|wine|winery|rooftop bar|beer|brewery|pub|speakeasy|aperitivo)\b|🍸|🍷|🍹|🍺|🥂/iu],
  ['beaches', /\b(beach|praia|playa|plage|spiaggia|cove|bay)\b|🏖️?|🏝️?/iu],
  ['views', /\b(view ?point|viewpoint|miradouro|mirador|lookout|panoram\w*|sunset spot|best view)\b|🌅|🌄/iu],
  ['museums', /\b(museum|museu|museo|gallery|exhibition)\b|🖼️?/iu],
  ['nature', /\b(hike|hiking|trail|waterfall|national park|lake|canyon|forest|mountain|garden)\b|🥾|⛰️?|🌲|🏞️?/iu],
  ['shopping', /\b(market|shop(ping)?|boutique|store|mercado|souvenirs?)\b|🛍️?/iu],
  ['experiences', /\b(tour|class|workshop|boat trip|cruise|surf(ing)? lesson|tickets?|playgrounds?|adventure parks?|theme parks?|water ?parks?|amusement parks?|zoo|aquarium|cable ?cars?|gondola|zip ?lin(e|es|ing)|climbing|ropes? course|mountain ?carts?|toboggan|summer sled\w*|rafting|canyoning|paragliding|kayak\w*|activities|activity|attractions?|for (the )?kids|kids club)\b|\berlebnis\w*|🎟️?|🚤|🎢|🎡|🛝|🚠/iu],
  ['sights', /\b(castle|palace|pal[aá]cio|church|cathedral|monastery|temple|tower|monument|old town)\b|🏰|🏛️?|⛪/iu],
];
const GENERIC_TAG = /travel|reels?|explore|fyp|viral|trip|vacation|holiday|wanderlust|food|insta|love|photo|life|gifted|ad\b|thank|family|kids?|summer|winter|weekend|happy|style|vibes?|goals/i;
// Hashtags run words together (#familyhotel), so look for the key word anywhere inside.
const TAG_HINTS: [CategoryId, RegExp][] = [
  ['stay', /hotel|resort|hostel|villa|airbnb|glamping|lodge|spa/i], ['eat', /restaurant|foodie|dinner|lunch|brunch|eats/i],
  ['coffee', /coffee|cafe|bakery/i], ['drinks', /bar|cocktail|wine/i], ['beaches', /beach|praia|playa/i],
  ['views', /viewpoint|sunset/i], ['museums', /museum|gallery/i], ['nature', /hike|hiking|waterfall|nationalpark|mountain/i],
];
export function hintFromTag(tag: string): CategoryId | undefined {
  for (const [id, re] of TAG_HINTS) if (re.test(tag)) return id;
  return undefined;
}

export function hintFrom(text: string): CategoryId | undefined {
  for (const [id, re] of HINTS) if (re.test(text)) return id;
  return undefined;
}

/** For a whole caption: the kind of place mentioned most ("hotels" once vs playgrounds, cable cars, ziplining…). */
export function hintFromMost(text: string): CategoryId | undefined {
  let best: CategoryId | undefined;
  let most = 0;
  for (const [id, re] of HINTS) {
    const n = (text.match(new RegExp(re.source, 'giu')) ?? []).length;
    if (n > most) { most = n; best = id; }
  }
  return best;
}

const PIN = /(?:📍|📌|🗺️?)/u;
const STOP_WORDS = /^(the|a|an|my|our|this|that|best|top|day|travel|reels?|explore|fyp|viral|trip|vacation|wanderlust|instagood|foodie)$/i;
const clean = (s: string) => s.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u200D]/gu, ' ').replace(/\s+/g, ' ').replace(/^[\s,.:;|–—-]+|[\s,.:;|–—-]+$/g, '').trim();

/**
 * Read a caption the way a person would: a 📍 pin marks a location; words and
 * emoji around it ("hotel", 🍝, "sunset") say what kind of place it is.
 * Weaker signals ("at X", hashtags, capitalised names) are used only when there is no pin.
 */
export function analyzeCaption(caption: string): CaptionPlace[] {
  const out: CaptionPlace[] = [];
  const seen = new Set<string>();
  const add = (p: CaptionPlace) => {
    const k = p.query.toLowerCase();
    if (p.query.length < 3 || seen.has(k) || STOP_WORDS.test(p.query)) return;
    seen.add(k); out.push(p);
  };
  const lines = caption.split(/\n+/);
  const wholeHint = hintFromMost(caption);

  lines.forEach((line, li) => {
    const m = line.split(PIN);
    if (m.length < 2) return;
    for (const seg of m.slice(1)) {
      // "📍 Hotel X, Lisbon | more text" → place "Hotel X", area "Lisbon"
      const parts = seg.split(/\s[|–—]\s|#|\s-\s|•|·/u);
      const text = clean(parts[0] ?? '');
      if (!text) continue;
      const [place, ...rest] = text.split(/,\s*/);
      // "📍 Comporta, Portugal | Sublime Comporta hotel 🏨": the pin is the area, the named place follows.
      const after = clean(parts.slice(1).join(' '));
      const named = after.match(/\b[A-Z][\p{L}'’-]+(?:[^\S\n]+(?:dos|das|del|de|da|do|di|la|le|of|[A-Z][\p{L}'’-]+|hotel|resort|restaurant|beach)\b)*/u);
      if (named && hintFrom(after) && named[0].toLowerCase() !== place.toLowerCase()) {
        add({ query: named[0], area: text, hint: hintFrom(after), from: 'pin' });
        continue;
      }
      // "📍 Erlebnisberg Spieljoch" with the area on the next line ("Zillertal, Fügen").
      const next = lines[li + 1]?.trim() ?? '';
      const nextArea = !rest.length && m.length === 2 && next.length > 2 && next.length <= 40 && !PIN.test(next) && !/[#@.!?:]/.test(next) && !hintFrom(next) && next.split(/[\s,]+/).filter(Boolean).every((w) => /^\p{Lu}/u.test(w) || /^(am|an|im|de|da|do|di|del|la|le|of|sur|sul)$/.test(w)) ? clean(next) : undefined;
      add({ query: place, area: rest.join(', ') || nextArea, hint: hintFrom(line) ?? hintFrom(place), from: 'pin' });
    }
  });
  const pins = [...out];
  // "at X" / "in X" is a strong signal even with pins ("📍 Lisbon … dinner at Taberna X").
  for (const line of lines) {
    const at = line.match(/\b(?:at|in|@)\s+([A-Z][\p{L}'’-]*(?:\s+(?:[A-Z][\p{L}'’-]*|dos|das|del|de|da|do|di|la|le|of)\b)*)/u);
    const isPinArea = at && pins.some((p) => p.area?.toLowerCase().split(/,\s*/).includes(at[1].toLowerCase()));
    if (at && !isPinArea && (!pins.length || hintFrom(line))) add({ query: at[1], hint: hintFrom(line), from: 'at' });
  }
  const ats = out.filter((p) => p.from === 'at');
  // A pin with no hint next to a named place is probably just the city: use it as the area.
  const pinCities = ats.length ? pins.filter((p) => !p.hint && !p.area) : [];
  ats.forEach((p) => { if (!p.area && pinCities[0]) p.area = pinCities[0].query; });

  const tags = (caption.match(/#[\p{L}\d_]+/gu) ?? []).map((t) => t.slice(1));
  // Weak signals (capitalised names, hashtags) only when the caption has no pin and no "at X".
  if (!out.length) {
    const caps = caption.match(/\b[A-Z][\p{L}'’-]+(?:[^\S\n]+(?:dos|das|del|de|da|do|di|la|le|of|[A-Z][\p{L}'’-]+)\b)+/gu) ?? [];
    caps.forEach((c) => add({ query: c.trim(), from: 'name' }));
    if (!out.length) {
      tags.map((t) => t.replace(/([a-z])([A-Z])/g, '$1 $2'))
        .filter((w) => w.length > 3 && !GENERIC_TAG.test(w) && !hintFromTag(w))
        .forEach((w) => add({ query: w, from: 'hashtag' }));
    }
  }
  const real = out.filter((p) => !pinCities.includes(p));
  // With one place in the caption, hints anywhere in the caption or hashtags apply to it.
  if (real.length === 1 && !real[0].hint) real[0].hint = wholeHint ?? tags.map(hintFromTag).find(Boolean);
  return real.slice(0, 6);
}

const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Words that describe a kind of place rather than name it ("Praia da Ursa" is "Ursa Beach" on the map).
const GENERIC = new Set('praia playa plage beach hotel resort restaurant restaurante cafe bar miradouro mirador viewpoint museum museu museo the and das dos del'.split(' '));
const keyWords = (t: string) => norm(t).split(/[^\p{L}\d]+/u).filter((w) => w.length > 2 && !GENERIC.has(w));
/** Every distinctive word of `words` appears in `name`. */
const nameHas = (name: string, words: string) => { const k = keyWords(words); return k.length > 0 && k.every((w) => norm(name).includes(w)); };
/** Whole-word match ("Hotel Neuhaus") ranks above a longer word that contains it ("Neuhaushof"). */
const wholeWord = (name: string, words: string) => keyWords(words).every((w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'u').test(norm(name)));

const distKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};

// The kinds of map features that match each category, used to look for "a hotel called X" rather than anything called X.
const OSM_TAGS: Partial<Record<CategoryId, string[]>> = {
  stay: ['tourism:hotel', 'tourism:guest_house', 'tourism:hostel', 'tourism:apartment', 'tourism:chalet', 'tourism:motel', 'leisure:resort', 'tourism:camp_site'],
  eat: ['amenity:restaurant', 'amenity:fast_food', 'amenity:food_court'],
  coffee: ['amenity:cafe', 'shop:bakery', 'shop:pastry'],
  drinks: ['amenity:bar', 'amenity:pub', 'amenity:nightclub'],
  beaches: ['natural:beach'],
  views: ['tourism:viewpoint'],
  museums: ['tourism:museum', 'tourism:gallery'],
  nature: ['leisure:park', 'leisure:nature_reserve', 'boundary:national_park', 'natural:peak', 'waterway:waterfall'],
  shopping: ['shop', 'amenity:marketplace'],
  sights: ['tourism:attraction', 'historic', 'tourism:artwork'],
  experiences: ['tourism:theme_park', 'leisure:playground', 'landuse:winter_sports', 'tourism:attraction', 'aerialway', 'leisure:water_park', 'tourism:zoo', 'tourism:aquarium', 'leisure:park', 'leisure:sports_centre'],
};
const tagRank = (tags: string[], osm = '') => { const i = tags.findIndex((t) => osm === t || osm.startsWith(`${t}:`)); return i < 0 ? 99 : i; };
// Streets and plain areas are rarely what a reel is about.
const NOT_A_PLACE = /^(highway|place|boundary:administrative|landuse|building|railway|waterway):?/;

/**
 * Search for a caption place. When the caption says what kind of place it is ("This hotel…", #familyhotel),
 * look only at that kind of place first; a single match of the right kind is treated as the answer.
 */
// Country names as people write them in captions, so "Österreich" filters results instead of being searched for.
const COUNTRIES: Record<string, string> = {
  austria: 'AT', osterreich: 'AT', germany: 'DE', deutschland: 'DE', switzerland: 'CH', schweiz: 'CH', suisse: 'CH',
  italy: 'IT', italia: 'IT', france: 'FR', spain: 'ES', espana: 'ES', portugal: 'PT', netherlands: 'NL', nederland: 'NL',
  greece: 'GR', croatia: 'HR', hrvatska: 'HR', belgium: 'BE', uk: 'GB', 'united kingdom': 'GB', england: 'GB', scotland: 'GB',
  ireland: 'IE', israel: 'IL', usa: 'US', 'united states': 'US', mexico: 'MX', japan: 'JP', thailand: 'TH', indonesia: 'ID', bali: 'ID',
  morocco: 'MA', turkey: 'TR', turkiye: 'TR', norway: 'NO', sweden: 'SE', denmark: 'DK', iceland: 'IS', slovenia: 'SI', czechia: 'CZ',
};
export const countryOf = (area?: string) => {
  if (!area) return undefined;
  const parts = norm(area).split(/,\s*/).map((x) => x.trim());
  for (const part of parts.reverse()) if (COUNTRIES[part]) return COUNTRIES[part];
  return undefined;
};
const withoutCountry = (area?: string) => area?.split(/,\s*/).filter((x) => !COUNTRIES[norm(x).trim()]).join(', ') || undefined;

/** How much of the caption name appears in a map name, weighted by word length (long, distinctive words count more). */
function nameScore(name: string, query: string) {
  const k = keyWords(query);
  if (!k.length) return 0;
  const n = norm(name);
  const total = k.reduce((t, w) => t + w.length, 0);
  return k.filter((w) => n.includes(w)).reduce((t, w) => t + w.length, 0) / total;
}

/**
 * Find the place a caption names. Tries, in order:
 * 1. that kind of place (hotels for "This hotel…") whose name matches the caption's name;
 * 2. any place with a matching name;
 * 3. names that add the region ("Neuhaus Zillertal") → that kind of place nearby with the shorter name.
 * `confident` means there is one clear answer, which the app puts on the map directly.
 */
export async function findCaptionPlace(p: CaptionPlace, near?: { lat: number; lng: number }): Promise<{ results: SearchResult[]; confident: boolean }> {
  const cc = countryOf(p.area);
  const area = withoutCountry(p.area);
  const q = area ? `${p.query}, ${area}` : p.query;
  const tags = p.hint ? OSM_TAGS[p.hint] : undefined;
  const inCountry = (r: SearchResult) => !cc || !r.cc || r.cc === cc;
  const label = (rs: SearchResult[]) => (p.hint ? rs.map((r) => ({ ...r, category: p.hint! })) : rs);
  // When we're sure of the place but the map has an older or longer name, use the name the creator wrote
  // (the map says "Leading Family Hotel & Resort Dachsteinkönig", the hotel is now "Familux Resort Dachsteinkönig").
  const named_ = (xs: { r: SearchResult; s: number }[], sure: boolean) => {
    const rs = label(xs.map((x) => x.r));
    if (sure && xs[0].s < 1 && p.from === 'pin') rs[0] = { ...rs[0], name: p.query };
    return rs;
  };
  const rank = (rs: SearchResult[]) => rs.filter(inCountry)
    .map((r) => ({ r, s: nameScore(r.name, p.query), t: tags ? tagRank(tags, r.osm) : 0 }))
    .filter((x) => x.s >= 0.5)
    .sort((a, b) => b.s - a.s || a.t - b.t);
  const clear = (xs: { s: number; t: number }[]) => xs.length > 0 && (xs.length === 1 || xs[0].s - xs[1].s >= 0.2 || (xs[0].s === xs[1].s && xs[0].t < xs[1].t) || (xs[0].s === 1 && xs[1].s < 1));

  // 1. The right kind of place with a matching name.
  if (tags) {
    let typed = rank(await searchPlaces(q, near, tags, 10));
    if (!typed.length && area) typed = rank(await searchPlaces(p.query, near, tags, 10));
    if (typed.length) return { results: named_(typed, clear(typed)), confident: clear(typed) };
  }
  // 2. Any place with a matching name (streets and plain buildings left out).
  let all = (await searchPlaces(q, near, [], 10)).filter(inCountry);
  if (!all.length && area) all = (await searchPlaces(p.query, near, [], 10)).filter(inCountry);
  const places = all.filter((r) => !NOT_A_PLACE.test(r.osm ?? ''));
  const named = rank(places);
  if (named.length && (!tags || named[0].t < 99)) return { results: named_(named, clear(named)), confident: clear(named) };

  // 2b. Resorts are often mapped as a site (landuse or building) whose name says what it is.
  const sites = rank(all.filter((r) => /^(landuse|building)/.test(r.osm ?? '') && p.hint && hintFrom(r.name) === p.hint));
  if (sites.length) return { results: named_(sites, clear(sites)), confident: clear(sites) };

  // 3. The name points to an area: look for that kind of place with a shorter name nearby.
  if (tags && all.length) {
    const anchor = all[0];
    const words = p.query.split(/\s+/);
    for (let n = words.length - 1; n >= 1; n--) {
      const sub = words.slice(0, n).join(' ');
      if (!keyWords(sub).length) break;
      const typed = (await searchPlaces(sub, anchor, tags, 15))
        .filter((r) => nameHas(r.name, sub) && inCountry(r))
        // Rank: whole-word name, then the main kind (a hotel before a guest house), then distance.
        .map((r) => ({ r, d: distKm(anchor, r), w: wholeWord(r.name, sub), t: tagRank(tags, r.osm) }))
        .filter((x) => x.d < 40)
        .sort((a, b) => Number(b.w) - Number(a.w) || a.t - b.t || a.d - b.d);
      if (typed.length) {
        const [best, next] = typed;
        const confident = !next || (best.w && !next.w) || best.t < next.t;
        return { results: label(typed.map((x) => x.r)), confident };
      }
    }
  }
  // 4. A word the map doesn't use ("Erlebnisberg Spieljoch" is mapped as "Spieljoch"): drop the first or last word.
  const words = p.query.split(/\s+/);
  if (!all.length && words.length >= 2) {
    for (const v of [words.slice(1).join(' '), words.slice(0, -1).join(' ')]) {
      if (!keyWords(v).some((w) => w.length >= 5)) continue;
      let rs = (await searchPlaces(area ? `${v}, ${area}` : v, near, [], 10)).filter(inCountry);
      if (!rs.length && area) rs = (await searchPlaces(v, near, [], 10)).filter(inCountry);
      const ok = rs.filter((r) => nameHas(r.name, v) && !/^(highway|place|boundary):/.test(r.osm ?? ''))
        .map((r) => ({ r, s: nameScore(r.name, p.query), t: tags ? tagRank(tags, r.osm) : 0 }))
        .sort((a, b) => a.t - b.t || b.s - a.s);
      if (ok.length) {
        const sure = ok.length === 1 || (ok[0].t < 99 && ok[0].t < ok[1].t);
        const rsOut = label(ok.map((x) => x.r));
        if (sure) rsOut[0] = { ...rsOut[0], name: p.query };
        return { results: rsOut, confident: sure };
      }
    }
  }
  return { results: label((places.length ? places : all).slice(0, 3)), confident: false };
}

/** Kept for older callers: just the search phrases. */
export function candidatesFromCaption(caption: string): string[] {
  return analyzeCaption(caption).map((p) => p.query);
}
