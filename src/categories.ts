import type { CategoryId } from './types';

export interface Category {
  id: CategoryId;
  label: string;
  color: string; // pin + accent (white text passes contrast)
  tint: string;  // light background
  icon: string;  // SVG path data, 24x24 stroke icon
}

export const CATEGORIES: Category[] = [
  { id: 'eat', label: 'Restaurant', color: '#A3533E', tint: '#f2e7e4', icon: 'M3 3v7a3 3 0 0 0 6 0V3M6 3v18M17 3c-2.5 1-3 5-3 8h3v10' },
  { id: 'coffee', label: 'Coffee', color: '#7A5A44', tint: '#ece8e5', icon: 'M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1a3 3 0 0 1 0 6h-1M8 3v3M12 3v3' },
  { id: 'drinks', label: 'Bar', color: '#6B4C66', tint: '#eae6ea', icon: 'M5 4h14l-7 8zM12 12v8M8 20h8M15 7l3-3' },
  { id: 'sights', label: 'Sights', color: '#3F5E70', tint: '#e4e8eb', icon: 'M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6' },
  { id: 'views', label: 'Views', color: '#4B7E7E', tint: '#e6eded', icon: 'M4 18l4-6 3 4 3-5 6 7M2 12s4-7 10-7 10 7 10 7' },
  { id: 'nature', label: 'Outdoor', color: '#3E6B4C', tint: '#e4eae6', icon: 'M3 20l6-11 4 6 3-4 5 9zM9 9l1.5-4' },
  { id: 'beaches', label: 'Beaches', color: '#BC955A', tint: '#f6f0e8', icon: 'M2 20c3-2 5-2 8 0s5 2 8 0M12 4a6 6 0 0 1 6 6H6a6 6 0 0 1 6-6zM12 10v7' },
  { id: 'museums', label: 'Museums', color: '#965A6C', tint: '#f0e8ea', icon: 'M3 9l9-5 9 5M5 9v9M10 9v9M14 9v9M19 9v9M3 20h18' },
  { id: 'shopping', label: 'Shopping', color: '#736D63', tint: '#e0e1e0', icon: 'M6 7h12l-1 13H7zM9 7a3 3 0 0 1 6 0' },
  { id: 'experiences', label: 'Activity', color: '#B0703C', tint: '#f4ebe4', icon: 'M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM15 7v10' },
  { id: 'stay', label: 'Hotels', color: '#1F2A24', tint: '#e0e1e0', icon: 'M3 18V8M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6M7 11a1.5 1.5 0 1 0 0 .01' },
];

/** Kids friendly is a tag that can sit on a place of any category. */
/** Shown as a "KIDS" text badge (Lital's pick 6), not an icon. */
export const KIDS = { label: 'Kids friendly', text: 'KIDS', color: '#B0894C', ink: '#ffffff' };
export const STAR = 'M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z';

export const categoryById = (id: CategoryId) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[3];

/** Guess a category from OpenStreetMap tags returned by the geocoder. */
export function guessCategory(osmKey = '', osmValue = ''): CategoryId {
  const v = `${osmKey}:${osmValue}`;
  if (/cafe|bakery|coffee|ice_cream|pastry/.test(v)) return 'coffee';
  if (/restaurant|fast_food|food_court|eat/.test(v)) return 'eat';
  if (/bar|pub|nightclub|biergarten|wine/.test(v)) return 'drinks';
  if (/viewpoint/.test(v)) return 'views';
  if (/museum|gallery|theatre|arts_centre/.test(v)) return 'museums';
  if (/beach|bay/.test(v)) return 'beaches';
  if (/park|garden|nature|peak|forest|natural|waterfall/.test(v)) return 'nature';
  if (/hotel|hostel|guest_house|apartment|camp/.test(v)) return 'stay';
  if (/shop|mall|marketplace|market/.test(v)) return 'shopping';
  if (/zoo|theme_park|aquarium|tour|activity/.test(v)) return 'experiences';
  return 'sights';
}
