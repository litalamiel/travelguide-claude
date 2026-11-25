import { km } from './planner';
import type { CategoryId, DayPlan, Place, TripDay } from './types';

/** How long people usually spend at each kind of place, in minutes. */
const STAY_MIN: Record<CategoryId, number> = {
  eat: 75, coffee: 40, drinks: 60, sights: 90, views: 30, nature: 120,
  beaches: 150, museums: 120, shopping: 75, experiences: 120, stay: 0,
};
const dwell = (p: Place) => STAY_MIN[p.category] + (p.mustSee && p.category === 'sights' ? 30 : 0);

/** Walk under 1.5 km (about 5 km/h), otherwise drive (about 50 km/h); roads are ~1.3× straight line. */
export function leg(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const d = km(a, b) * 1.3;
  if (d < 1.5) return { mode: 'walk' as const, min: Math.max(3, Math.round((d / 5) * 60)) };
  return { mode: 'drive' as const, min: Math.max(5, Math.round((d / 50) * 60)) };
}

export const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
export const toTime = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const roundUp = (m: number, step = 15) => Math.ceil(m / step) * step;

export type Row =
  | { kind: 'stop'; time: string; place: Place; index: number; minutes: number; meal?: 'Breakfast' | 'Lunch' | 'Dinner' | 'Coffee break'; fixed: boolean }
  | { kind: 'leg'; mode: 'walk' | 'drive'; min: number }
  | { kind: 'meal'; time: string; meal: 'Lunch' | 'Dinner' }
  | { kind: 'milestone'; time: string; icon: 'checkout' | 'checkin' | 'drive' | 'flight'; title: string; sub?: string }
  | { kind: 'night'; time: string; stay?: Place; nightNo: number; last: boolean };

type Meal = 'Breakfast' | 'Lunch' | 'Dinner' | 'Coffee break';
function mealFor(p: Place, t: number): Meal | undefined {
  if (p.category === 'coffee') return t < 11 * 60 ? 'Breakfast' : 'Coffee break';
  if (p.category !== 'eat') return undefined;
  if (t < 11 * 60) return 'Breakfast';
  if (t < 16 * 60 + 30) return 'Lunch';
  return 'Dinner';
}

/** Build the day as a timeline: start, stops with times and travel between, meal gaps, the night. */
export function buildTimeline(day: DayPlan, raw: TripDay, prevStay: Place | undefined, dayIndex: number, last: boolean): Row[] {
  const rows: Row[] = [];
  const defaultStart = raw.kind === 'flight' ? '07:30' : raw.kind === 'transition' ? '10:00' : '09:00';
  let t = toMin(raw.startTime ?? defaultStart);
  let here: { lat: number; lng: number } | undefined = prevStay;

  if (prevStay && raw.kind !== 'regular') {
    rows.push({ kind: 'milestone', time: toTime(t), icon: 'checkout', title: `Check out · ${prevStay.name}` });
    t += 15;
  }
  if (raw.kind === 'flight') {
    const dep = toMin(raw.flightTime ?? '10:40');
    const toAirport = Math.max(t, dep - 120);
    rows.push({ kind: 'milestone', time: toTime(toAirport), icon: 'drive', title: 'Head to the airport', sub: 'Be there about 2 hours before' });
    rows.push({ kind: 'milestone', time: toTime(dep), icon: 'flight', title: raw.note?.trim() ? `Flight ${raw.note.trim()}` : 'Flight', sub: 'Add the flight number and time below' });
    t = dep + 150; // flight plus getting out of the airport, rough
    here = undefined;
  }

  // If a restaurant is already in the day, don't suggest a separate lunch slot.
  let hadLunch = day.places.some((p) => p.category === 'eat');
  let hadDinner = false;
  day.places.forEach((p, i) => {
    if (here) {
      const l = leg(here, p);
      rows.push({ kind: 'leg', mode: l.mode, min: l.min });
      t += l.min;
    }
    t = roundUp(t);
    // Leave room for lunch if we pass 13:00 without having eaten.
    if (!hadLunch && t >= 13 * 60 + 30 && p.category !== 'eat' && t < 16 * 60) {
      rows.push({ kind: 'meal', time: '13:00', meal: 'Lunch' });
      hadLunch = true;
    }
    const fixed = raw.times?.[p.id];
    if (fixed) t = toMin(fixed);
    const meal = mealFor(p, t);
    if (meal === 'Lunch') hadLunch = true;
    if (meal === 'Dinner') hadDinner = true;
    const minutes = dwell(p);
    rows.push({ kind: 'stop', time: toTime(t), place: p, index: i, minutes, meal, fixed: !!fixed });
    t += minutes;
    here = p;
  });

  if (!hadLunch && t > 12 * 60 && raw.kind === 'regular') rows.push({ kind: 'meal', time: toTime(Math.max(roundUp(t), 13 * 60)), meal: 'Lunch' });
  if (raw.kind === 'transition' && day.stay) {
    if (here) { const l = leg(here, day.stay); rows.push({ kind: 'leg', mode: l.mode, min: l.min }); t += l.min; }
    rows.push({ kind: 'milestone', time: toTime(Math.max(roundUp(t), 15 * 60)), icon: 'checkin', title: `Check in · ${day.stay.name}` });
    here = day.stay;
  }
  if (raw.kind === 'flight' && day.stay) {
    rows.push({ kind: 'milestone', time: toTime(Math.max(roundUp(t), 15 * 60)), icon: 'checkin', title: `Check in · ${day.stay.name}` });
  }
  if (!hadDinner) rows.push({ kind: 'meal', time: toTime(Math.max(roundUp(t), 20 * 60)), meal: 'Dinner' });
  rows.push({ kind: 'night', time: '22:00', stay: day.stay, nightNo: dayIndex + 1, last });
  return rows;
}

/** For a fresh plan: put the day's first restaurant around lunchtime instead of wherever the route put it. */
export function arrangeMeals(places: Place[], start = 9 * 60): Place[] {
  const eatIdx = places.findIndex((p) => p.category === 'eat');
  if (eatIdx < 0) return places;
  const rest = places.filter((_, k) => k !== eatIdx);
  let t = start; let here: Place | undefined;
  let at = rest.length;
  for (let k = 0; k < rest.length; k++) {
    if (here) t += leg(here, rest[k]).min;
    if (t >= 12 * 60) { at = k; break; }
    t += dwell(rest[k]); here = rest[k];
    if (t >= 12 * 60) { at = k + 1; break; }
  }
  return [...rest.slice(0, at), places[eatIdx], ...rest.slice(at)];
}
