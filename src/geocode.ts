import { guessCategory } from './categories';
import type { CategoryId } from './types';

export interface SearchResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: CategoryId;
}

// Photon (by Komoot) is a free, keyless OpenStreetMap geocoder. It is fine for a
// prototype; for production we swap this for Google Places (see README).
export async function searchPlaces(query: string, near?: { lat: number; lng: number }): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: '6', lang: 'en' });
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
  // A pin with only a city ("📍 Lisbon") is the area for the other names.
  const pinAreas = out.filter((p) => !p.area && p.from === 'pin' && !p.hint).map((p) => p.query);

  if (!out.length || out.every((p) => pinAreas.includes(p.query))) {
    const area = pinAreas[0];
    for (const line of lines) {
      const at = line.match(/\b(?:at|in|@)\s+([A-Z][\p{L}'’-]*(?:\s+(?:[A-Z][\p{L}'’-]*|dos|das|del|de|da|do|di|la|le|of)\b)*)/u);
      if (at) add({ query: at[1], area, hint: hintFrom(line), from: 'at' });
    }
    const tags = (caption.match(/#[\p{L}\d_]+/gu) ?? [])
      .map((t) => t.slice(1).replace(/([a-z])([A-Z])/g, '$1 $2'))
      .filter((w) => w.length > 3 && !/travel|reels?|explore|fyp|viral|trip|vacation|wanderlust|food|insta|love|photo|life/i.test(w));
    const before = out.length;
    const caps = caption.match(/\b[A-Z][\p{L}'’-]+(?:[^\S\n]+(?:dos|das|del|de|da|do|di|la|le|of|[A-Z][\p{L}'’-]+)\b)+/gu) ?? [];
    caps.forEach((c) => add({ query: c.trim(), area, from: 'name' }));
    // Hashtags are usually the city or country: use them as the area, or as places only when nothing else was found.
    const tagArea = tags[0];
    if (out.length > before || out.length) out.forEach((p) => { if (!p.area && tagArea) p.area = tagArea; });
    else tags.forEach((w) => add({ query: w, area, from: 'hashtag' }));
  }
  // With one place in the caption, hints anywhere in the caption apply to it.
  const real = out.filter((p) => !pinAreas.includes(p.query) || out.length === 1);
  if (real.length === 1 && !real[0].hint) real[0].hint = wholeHint;
  return real.slice(0, 6);
}

/** Search for a caption place and use the caption's hint to pick the category and the best match. */
export async function findCaptionPlace(p: CaptionPlace, near?: { lat: number; lng: number }): Promise<SearchResult[]> {
  let results = await searchPlaces(p.area ? `${p.query}, ${p.area}` : p.query, near);
  if (!results.length && p.area) results = await searchPlaces(p.query, near);
  if (p.hint) {
    // Prefer matches that already look like the hinted kind of place, then label them with the hint.
    results = [...results].sort((a, b) => Number(b.category === p.hint) - Number(a.category === p.hint));
    results = results.map((r) => ({ ...r, category: p.hint! }));
  }
  return results;
}

/** Kept for older callers: just the search phrases. */
export function candidatesFromCaption(caption: string): string[] {
  return analyzeCaption(caption).map((p) => p.query);
}
