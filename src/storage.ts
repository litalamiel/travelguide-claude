import type { Place } from './types';
import { SAMPLE_PLACES } from './samples';

const KEY = 'travelmaps.places.v1';

export function loadPlaces(): Place[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* storage unavailable */ }
  return SAMPLE_PLACES;
}

export function savePlaces(places: Place[]) {
  try { localStorage.setItem(KEY, JSON.stringify(places)); } catch { /* ignore */ }
}
