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

/**
 * First-version reel reading: pull likely place names out of a caption
 * (lines with a pin emoji, "at X", hashtags, capitalised phrases).
 * Voiceover and video-frame reading need a server with AI and come next.
 */
export function candidatesFromCaption(caption: string): string[] {
  const found = new Set<string>();
  for (const line of caption.split(/\n+/)) {
    const pin = line.match(/(?:📍|📌)\s*([^#\n]+)/u);
    if (pin) found.add(pin[1].trim());
    const at = line.match(/\b(?:at|in|@)\s+([A-Z][\w'’-]*(?:\s+(?:[A-Z][\w'’-]*|de|da|do|dos|das|di|del|la|le))*)/u);
    if (at) found.add(at[1].trim());
  }
  for (const tag of caption.match(/#[\p{L}\d_]+/gu) ?? []) {
    const words = tag.slice(1).replace(/([a-z])([A-Z])/g, '$1 $2');
    if (words.length > 3 && !/travel|reels?|explore|fyp|viral|trip|vacation|wanderlust/i.test(words)) found.add(words);
  }
  const caps = caption.match(/\b[A-Z][\p{L}'’-]+(?:\s+(?:de|da|do|dos|das|di|del|la|le|[A-Z][\p{L}'’-]+))+/gu) ?? [];
  caps.forEach((c) => found.add(c.trim()));
  return [...found].filter((s) => s.length > 2).slice(0, 6);
}
