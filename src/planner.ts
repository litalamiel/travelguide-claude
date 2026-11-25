import type { DayPlan, Place, SavedTrip, TripDay } from './types';

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

/** How far (km) an "if you have time" place may be from a day's route to be added to it. */
const IF_TIME_RADIUS_KM = 12;

const centroid = (g: { lat: number; lng: number }[]) => ({ lat: g.reduce((s, p) => s + p.lat, 0) / g.length, lng: g.reduce((s, p) => s + p.lng, 0) / g.length });

function routeMinutes(stops: Place[], from?: { lat: number; lng: number }) {
  let mins = 0;
  if (from && stops.length) mins += driveMin(km(from, stops[0]));
  for (let j = 1; j < stops.length; j++) mins += driveMin(km(stops[j - 1], stops[j]));
  return mins;
}

export function planTrip(all: Place[], opts: PlanOptions): { days: DayPlan[]; dropped: Place[] } {
  const sights = all.filter((p) => p.category !== 'stay');
  // Must-do and unmarked places make the core of each day; "if you have time" places fill gaps later.
  const core = opts.onlyMustSee ? sights.filter((p) => p.mustSee) : sights.filter((p) => !p.ifTime || p.mustSee);
  const extras = opts.onlyMustSee ? [] : sights.filter((p) => p.ifTime && !p.mustSee);
  const days = Math.max(1, opts.nights + 1);
  const maxStops = { relaxed: 3, balanced: 5, packed: 7 }[opts.pace];
  const places = core.length ? core : extras;
  if (!places.length) return { days: [], dropped: [] };

  let groups = balance(cluster(places, Math.min(days, places.length)), maxStops);
  // Days with must-do places win when there are more groups than days.
  groups.sort((a, b) => b.filter((p) => p.mustSee).length - a.filter((p) => p.mustSee).length || b.length - a.length);
  const leftover = groups.slice(days).flat();
  groups = groups.slice(0, days);
  // A must-do is never dropped: move it into the closest day, even if that day gets fuller than the pace.
  const dropped: Place[] = [];
  for (const p of leftover) {
    if (!p.mustSee) { dropped.push(p); continue; }
    let bi = 0;
    groups.forEach((g, i) => { if (km(p, centroid(g)) < km(p, centroid(groups[bi]))) bi = i; });
    groups[bi].push(p);
  }

  // Order days as a tour, starting from the group closest to the first must-do (or first place).
  const anchor = places.find((p) => p.mustSee) ?? places[0];
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

  const routes = orderedGroups.map((g, i) => nearestOrder(g, i === 0 ? anchor : centroid(orderedGroups[i - 1])));
  const startOf = (i: number) => (i > 0 ? centroid(orderedGroups[i - 1]) : undefined);

  // "If you have time": add to the nearest day only when it is close to that day's stops,
  // the day still has room for the pace, and the extra driving stays within the limit.
  if (places !== extras) {
    const byDistance = extras
      .map((p) => {
        let best = -1, bestD = Infinity;
        routes.forEach((r, i) => r.forEach((q) => { const d = km(p, q); if (d < bestD) { bestD = d; best = i; } }));
        return { p, day: best, d: bestD };
      })
      .sort((a, b) => a.d - b.d);
    for (const { p, day, d } of byDistance) {
      const r = routes[day];
      if (day < 0 || d > IF_TIME_RADIUS_KM || r.length >= maxStops) { dropped.push(p); continue; }
      const next = nearestOrder([...r, p], startOf(day) ?? anchor);
      if (routeMinutes(next, startOf(day)) > opts.maxDriveHours * 60) { dropped.push(p); continue; }
      routes[day] = next;
    }
  }

  const plans: DayPlan[] = routes.map((ordered, i) => {
    const mins = routeMinutes(ordered, startOf(i));
    return {
      day: i + 1,
      places: ordered,
      kind: 'regular' as const,
      driveMinutes: mins,
      overLimit: mins > opts.maxDriveHours * 60,
      area: ordered[0].name,
    };
  });
  return { days: plans, dropped };
}

export const fmtMinutes = (m: number) => (m === 0 ? 'No driving' : m < 60 ? `${m} min drive` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} drive`);

/** Hotels farther than this from a day's places are never picked for that night. */
const HOTEL_MAX_KM = 60;
/** Moving hotels must save at least this much distance (km, summed over the nights) to be worth it. */
const SWITCH_COST_KM = 25;
/** Never move to a hotel for fewer nights than this (unless the whole trip is shorter). */
const MIN_NIGHTS = 2;

/** Typical distance from a hotel to a day's places: the median, so one far stop doesn't decide it. */
function medianKm(h: { lat: number; lng: number }, places: Place[]) {
  if (!places.length) return 0;
  const d = places.map((p) => km(h, p)).sort((a, b) => a - b);
  const m = Math.floor(d.length / 2);
  return d.length % 2 ? d[m] : (d[m - 1] + d[m]) / 2;
}

/**
 * Pick a hotel for each night (night i follows day i).
 * Each night prefers the hotel closest to most of that day's places (and, at half weight, the next morning's).
 * The plan only moves hotels when a group of days is far enough from the current hotel that the move
 * clearly saves driving, and every stay is at least two nights in a row.
 */
export function pickHotels(dayPlaces: Place[][], hotels: Place[], nights: number): (string | undefined)[] {
  if (nights <= 0) return [];
  if (!hotels.length) return Array(nights).fill(undefined);
  const NONE = hotels.length; // "no saved hotel nearby"
  const cost = (h: number, n: number) => {
    const today = dayPlaces[n] ?? [], tomorrow = dayPlaces[n + 1] ?? [];
    if (h === NONE) return today.length || tomorrow.length ? HOTEL_MAX_KM : 0;
    const a = medianKm(hotels[h], today), b = medianKm(hotels[h], tomorrow);
    if ((today.length && a > HOTEL_MAX_KM) || (!today.length && tomorrow.length && b > HOTEL_MAX_KM)) return Infinity;
    return a + 0.5 * b;
  };
  const minRun = nights < MIN_NIGHTS ? 1 : MIN_NIGHTS;
  const H = hotels.length + 1;
  // best[n][h][r]: lowest cost for nights 0..n, staying at h on night n, r = nights in a row so far (capped at minRun).
  type Cell = { c: number; prev?: [number, number] };
  const best: Cell[][][] = Array.from({ length: nights }, () => Array.from({ length: H }, () => Array.from({ length: minRun + 1 }, () => ({ c: Infinity }))));
  for (let h = 0; h < H; h++) best[0][h][1] = { c: cost(h, 0) };
  for (let n = 1; n < nights; n++) {
    for (let h = 0; h < H; h++) {
      const c = cost(h, n);
      if (c === Infinity) continue;
      for (let r = 1; r <= minRun; r++) {
        // Stay another night.
        const p = best[n - 1][h][r];
        const nr = Math.min(minRun, r + 1);
        if (p.c + c < best[n][h][nr].c) best[n][h][nr] = { c: p.c + c, prev: [h, r] };
      }
      // Move here from another hotel, only after a full minimum stay there.
      for (let g = 0; g < H; g++) {
        if (g === h) continue;
        const p = best[n - 1][g][minRun];
        const total = p.c + c + SWITCH_COST_KM;
        if (total < best[n][h][1].c) best[n][h][1] = { c: total, prev: [g, minRun] };
      }
    }
  }
  let end: [number, number] = [NONE, minRun], endC = Infinity;
  for (let h = 0; h < H; h++) if (best[nights - 1][h][minRun].c < endC) { endC = best[nights - 1][h][minRun].c; end = [h, minRun]; }
  if (endC === Infinity) return Array(nights).fill(undefined);
  const out: (string | undefined)[] = Array(nights);
  let cell: [number, number] | undefined = end;
  for (let n = nights - 1; n >= 0 && cell; n--) {
    out[n] = cell[0] === NONE ? undefined : hotels[cell[0]].id;
    cell = best[n][cell[0]][cell[1]].prev;
  }
  return out;
}

/** Turn a fresh plan into saved days, with a hotel for each night picked by `pickHotels`. */
export function toTripDays(days: DayPlan[], all: Place[], totalDays = days.length): TripDay[] {
  const hotels = all.filter((p) => p.category === 'stay');
  const dayPlaces = Array.from({ length: totalDays }, (_, i) => days[i]?.places ?? []);
  const stays = pickHotels(dayPlaces, hotels, totalDays - 1);
  return dayPlaces.map((places, i) => ({ placeIds: places.map((p) => p.id), stayId: stays[i], kind: 'regular' as const }));
}

/** Rebuild day plans (with drive estimates) from a saved trip and the map's current places. */
export function daysFromTrip(trip: SavedTrip, all: Place[]): DayPlan[] {
  const byId = new Map(all.map((p) => [p.id, p]));
  let prevNight: Place | undefined;
  return trip.days.map((d, i) => {
    const places = d.placeIds.map((id) => byId.get(id)).filter((p): p is Place => !!p);
    const stay = d.stayId ? byId.get(d.stayId) : undefined;
    const pts = [prevNight, ...places, stay].filter((p): p is Place => !!p);
    let mins = 0;
    for (let j = 1; j < pts.length; j++) mins += driveMin(km(pts[j - 1], pts[j]));
    prevNight = stay ?? places[places.length - 1] ?? prevNight;
    return {
      day: i + 1,
      places,
      stay,
      kind: d.kind,
      note: d.note,
      driveMinutes: mins,
      overLimit: d.kind === 'regular' && mins > trip.maxDriveHours * 60,
      area: places[0]?.name ?? stay?.name ?? '',
    };
  });
}
