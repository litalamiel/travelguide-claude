import type { DayPlan, Place } from './types';

const R = 6371;
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Rough drive estimate: road distance ≈ 1.3 × straight line, average 50 km/h. Short hops are walking. */
export const driveMin = (d: number) => (d < 1.5 ? 0 : Math.round(((d * 1.3) / 50) * 60));

function nearestOrder(points: Place[], start: { lat: number; lng: number }): Place[] {
  const left = [...points];
  const out: Place[] = [];
  let cur = start;
  while (left.length) {
    let bi = 0;
    left.forEach((p, i) => { if (km(cur, p) < km(cur, left[bi])) bi = i; });
    cur = left[bi];
    out.push(left.splice(bi, 1)[0]);
  }
  return out;
}

/** Group places into `days` geographic clusters (k-means with farthest-point start). */
function cluster(places: Place[], k: number): Place[][] {
  if (places.length <= k) return places.map((p) => [p]);
  const centers = [places[0]].map((p) => ({ lat: p.lat, lng: p.lng }));
  while (centers.length < k) {
    let best = places[0], bestD = -1;
    for (const p of places) {
      const d = Math.min(...centers.map((c) => km(c, p)));
      if (d > bestD) { bestD = d; best = p; }
    }
    centers.push({ lat: best.lat, lng: best.lng });
  }
  let groups: Place[][] = [];
  for (let iter = 0; iter < 20; iter++) {
    groups = centers.map(() => []);
    for (const p of places) {
      let bi = 0;
      centers.forEach((c, i) => { if (km(c, p) < km(centers[bi], p)) bi = i; });
      groups[bi].push(p);
    }
    groups.forEach((g, i) => {
      if (g.length) centers[i] = { lat: g.reduce((s, p) => s + p.lat, 0) / g.length, lng: g.reduce((s, p) => s + p.lng, 0) / g.length };
    });
  }
  return groups.filter((g) => g.length);
}

/** Split a big cluster in two when a day has too many stops for the pace. */
function balance(groups: Place[][], maxStops: number): Place[][] {
  const out: Place[][] = [];
  for (const g of groups) {
    if (g.length <= maxStops) { out.push(g); continue; }
    const ordered = nearestOrder(g, g[0]);
    for (let i = 0; i < ordered.length; i += maxStops) out.push(ordered.slice(i, i + maxStops));
  }
  return out;
}

export interface PlanOptions {
  nights: number;
  maxDriveHours: number;
  pace: 'relaxed' | 'balanced' | 'packed';
  onlyMustSee?: boolean;
}

export function planTrip(all: Place[], opts: PlanOptions): { days: DayPlan[]; dropped: Place[] } {
  const places = opts.onlyMustSee ? all.filter((p) => p.mustSee) : all.filter((p) => p.category !== 'stay');
  const days = Math.max(1, opts.nights + 1);
  const maxStops = { relaxed: 3, balanced: 5, packed: 7 }[opts.pace];
  if (!places.length) return { days: [], dropped: [] };

  let groups = balance(cluster(places, Math.min(days, places.length)), maxStops);
  // Must-see first when there are more groups than days.
  groups.sort((a, b) => b.filter((p) => p.mustSee).length - a.filter((p) => p.mustSee).length || b.length - a.length);
  const dropped = groups.slice(days).flat();
  groups = groups.slice(0, days);

  // Order days as a tour, starting from the group closest to the first must-see (or first place).
  const anchor = places.find((p) => p.mustSee) ?? places[0];
  const centroid = (g: Place[]) => ({ lat: g.reduce((s, p) => s + p.lat, 0) / g.length, lng: g.reduce((s, p) => s + p.lng, 0) / g.length });
  const remaining = [...groups];
  const orderedGroups: Place[][] = [];
  let cur: { lat: number; lng: number } = anchor;
  while (remaining.length) {
    let bi = 0;
    remaining.forEach((g, i) => { if (km(cur, centroid(g)) < km(cur, centroid(remaining[bi]))) bi = i; });
    const g = remaining.splice(bi, 1)[0];
    orderedGroups.push(g);
    cur = centroid(g);
  }

  const plans: DayPlan[] = orderedGroups.map((g, i) => {
    const ordered = nearestOrder(g, i === 0 ? anchor : centroid(orderedGroups[i - 1]));
    let mins = 0;
    if (i > 0) mins += driveMin(km(centroid(orderedGroups[i - 1]), ordered[0]));
    for (let j = 1; j < ordered.length; j++) mins += driveMin(km(ordered[j - 1], ordered[j]));
    return {
      day: i + 1,
      places: ordered,
      driveMinutes: mins,
      overLimit: mins > opts.maxDriveHours * 60,
      area: ordered[0].name,
    };
  });
  return { days: plans, dropped };
}

export const fmtMinutes = (m: number) => (m === 0 ? 'No driving' : m < 60 ? `${m} min drive` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} drive`);
