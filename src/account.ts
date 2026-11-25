import type { AccountMode } from './types';

const MODE_KEY = 'travelmaps.mode.v1';

export function loadMode(): AccountMode {
  try { return localStorage.getItem(MODE_KEY) === 'creator' ? 'creator' : 'traveler'; } catch { return 'traveler'; }
}
export function saveMode(m: AccountMode) { try { localStorage.setItem(MODE_KEY, m); } catch { /* storage unavailable */ } }
