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
}

// Photon (by Komoot) is a free, keyless OpenStreetMap geocoder. It is fine for a
// prototype; for production we swap this for Google Places (see README).
export async function searchPlaces(query: string, near?: { lat: number; lng: number }, osmTags: string[] = [], limit = 6): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit), lang: 'en' });
  osmTags.forEach((t) => params.append('osm_tag', t));
  if (near) {
    params.set('lat', String(near.lat));
    params.set('lon', String(near.lng));
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`);
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
  ['experiences', /\b(tour|class|workshop|boat trip|cruise|surf(ing)? lesson|tickets?)\b|🎟️?|🚤/iu],
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

const PIN = /(?:📍|📌|🗺️?)/u;
const STOP_WORDS = /^(the|a|an|my|our|this|that|best|top|day|travel|reels?|explore|fyp|viral|trip|vacation|wanderlust|instagood|foodie)$/i;
const clean = (s: string) => s.replace(/[\p{Extended_Pictographic}️]/gu, ' ').replace(/\s+/g, ' ').replace(/^[\s,.:;|–—-]+|[\s,.:;|–—-]+$/g, '').trim();

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
  const wholeHint = hintFrom(caption);

  for (const line of lines) {
    const m = line.split(PIN);
    if (m.length < 2) continue;
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
      add({ query: place, area: rest.join(', ') || undefined, hint: hintFrom(line) ?? hintFrom(place), from: 'pin' });
    }
  }
  const pins = [...out];
  // "at X" / "in X" is a strong signal even with pins ("📍 Lisbon … dinner at Taberna X").
  for (const line of lines) {
    const at = line.match(/\b(?:at|in|@)\s+([A-Z][\p{L}'’-]*(?:\s+(?:[A-Z][\p{L}'’-]*|dos|das|del|de|da|do|di|la|le|of)\b)*)/u);
    if (at && (!pins.length || hintFrom(line))) add({ query: at[1], hint: hintFrom(line), from: 'at' });
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
  experiences: ['tourism:theme_park', 'tourism:zoo', 'leisure:water_park'],
};
const tagRank = (tags: string[], osm = '') => { const i = tags.findIndex((t) => osm === t || osm.startsWith(`${t}:`)); return i < 0 ? 99 : i; };
// Streets and plain areas are rarely what a reel is about.
const NOT_A_PLACE = /^(highway|place|boundary:administrative|landuse|building:(yes|house|residential)):?/;

/**
 * Search for a caption place. When the caption says what kind of place it is ("This hotel…", #familyhotel),
 * look only at that kind of place first; a single match of the right kind is treated as the answer.
 */
export async function findCaptionPlace(p: CaptionPlace, near?: { lat: number; lng: number }): Promise<{ results: SearchResult[]; confident: boolean }> {
  const q = p.area ? `${p.query}, ${p.area}` : p.query;
  const tags = p.hint ? OSM_TAGS[p.hint] : undefined;
  if (tags) {
    // Only trust a typed match whose name really contains the caption's words (search is fuzzy).
    let typed = (await searchPlaces(q, undefined, tags)).filter((r) => nameHas(r.name, p.query));
    if (!typed.length && p.area) typed = (await searchPlaces(p.query, undefined, tags)).filter((r) => nameHas(r.name, p.query));
    if (typed.length) return { results: typed.map((r) => ({ ...r, category: p.hint! })), confident: true };
  }
  let results = await searchPlaces(q, near);
  if (tags && results.length) {
    // Names in captions often add the region ("📍 Neuhaus Zillertal" is Hotel Neuhaus in the Zillertal valley).
    // Find where the name points, then look for that kind of place with a shorter name nearby.
    const anchor = results[0];
    const words = p.query.split(/\s+/);
    for (let n = words.length - 1; n >= 1; n--) {
      const sub = words.slice(0, n).join(' ');
      if (!keyWords(sub).length) break;
      const typed = (await searchPlaces(sub, anchor, tags, 15))
        .filter((r) => nameHas(r.name, sub))
        // Rank: whole-word name, then the main kind (a hotel before a guest house), then distance.
        .map((r) => ({ r, d: distKm(anchor, r), w: wholeWord(r.name, sub), t: tagRank(tags, r.osm) }))
        .filter((x) => x.d < 40)
        .sort((a, b) => Number(b.w) - Number(a.w) || a.t - b.t || a.d - b.d);
      if (typed.length) {
        const [best, next] = typed;
        const confident = !next || (best.w && !next.w) || best.t < next.t;
        return { results: typed.map((x) => ({ ...x.r, category: p.hint! })), confident };
      }
    }
  }
  if (!results.length && p.area) results = await searchPlaces(p.query, near);
  const real = results.filter((r) => !NOT_A_PLACE.test(r.osm ?? ''));
  results = real.length ? real : results;
  if (p.hint) results = results.map((r) => ({ ...r, category: p.hint! }));
  return { results, confident: false };
}

/** Kept for older callers: just the search phrases. */
export function candidatesFromCaption(caption: string): string[] {
  return analyzeCaption(caption).map((p) => p.query);
}
