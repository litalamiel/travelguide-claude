import type { Place, TripMap } from './types';
import { SAMPLE_PLACES } from './samples';

const KEY = 'travelmaps.maps.v2';
const OLD_KEY = 'travelmaps.places.v1';

export const newId = () => Math.random().toString(36).slice(2, 10);

export function newMap(name: string, places: Place[] = []): TripMap {
  return { id: newId(), name, places, createdAt: new Date().toISOString() };
}

export function loadMaps(): TripMap[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const maps = JSON.parse(raw) as TripMap[];
      if (Array.isArray(maps) && maps.length) return maps;
    }
    // Bring over places saved by the first version.
    const old = localStorage.getItem(OLD_KEY);
    if (old) return [newMap('My first map', JSON.parse(old))];
  } catch { /* storage unavailable */ }
  return [newMap('Lisbon (sample)', SAMPLE_PLACES)];
}

export function saveMaps(maps: TripMap[]) {
  try { localStorage.setItem(KEY, JSON.stringify(maps)); } catch { /* ignore */ }
}
