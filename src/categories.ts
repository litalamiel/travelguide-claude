import type { CategoryId } from './types';

export interface Category {
  id: CategoryId;
  label: string;
  color: string; // pin + accent (white text passes contrast)
  tint: string;  // light background
  icon: string;  // SVG path data, 24x24 stroke icon
}

export const CATEGORIES: Category[] = [
  { id: 'eat', label: 'Eat', color: '#b91c1c', tint: '#fee2e2', icon: 'M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-2 6 0 8v10' },
  { id: 'coffee', label: 'Coffee', color: '#92400e', tint: '#fef3c7', icon: 'M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1a3 3 0 0 1 0 6h-1' },
  { id: 'drinks', label: 'Drinks', color: '#6d28d9', tint: '#ede9fe', icon: 'M5 4h14l-7 8zM12 12v8M8 20h8' },
  { id: 'sights', label: 'Sights', color: '#1d4ed8', tint: '#dbeafe', icon: 'M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6' },
  { id: 'views', label: 'Views', color: '#0e7490', tint: '#cffafe', icon: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z' },
  { id: 'nature', label: 'Nature', color: '#15803d', tint: '#dcfce7', icon: 'M12 3l7 12H5zM12 15v6' },
  { id: 'beaches', label: 'Beaches', color: '#a16207', tint: '#fef9c3', icon: 'M2 20c3-2 5-2 8 0s5 2 8 0M12 4a6 6 0 0 1 6 6H6a6 6 0 0 1 6-6zM12 10v7' },
  { id: 'museums', label: 'Museums', color: '#be185d', tint: '#fce7f3', icon: 'M3 9l9-5 9 5M5 9v9M10 9v9M14 9v9M19 9v9M3 20h18' },
  { id: 'shopping', label: 'Shopping', color: '#475569', tint: '#e2e8f0', icon: 'M6 7h12l-1 13H7zM9 7a3 3 0 0 1 6 0' },
  { id: 'experiences', label: 'Do', color: '#c2410c', tint: '#ffedd5', icon: 'M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z' },
  { id: 'stay', label: 'Stay', color: '#0f172a', tint: '#e2e8f0', icon: 'M3 18V8M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6M7 11a1.5 1.5 0 1 0 0 .01' },
];

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
