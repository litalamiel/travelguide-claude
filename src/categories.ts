import type { CategoryId } from './types';

export interface Category {
  id: CategoryId;
  label: string;
  color: string; // pin + accent (white text passes contrast)
  tint: string;  // light background
  icon: string;  // SVG path data, 24x24 stroke icon
}

export const CATEGORIES: Category[] = [
  { id: 'eat', label: 'Restaurant', color: '#b91c1c', tint: '#fee2e2', icon: 'M3 3v7a3 3 0 0 0 6 0V3M6 3v18M17 3c-2.5 1-3 5-3 8h3v10' },
  { id: 'coffee', label: 'Coffee', color: '#92400e', tint: '#fef3c7', icon: 'M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1a3 3 0 0 1 0 6h-1M8 3v3M12 3v3' },
  { id: 'drinks', label: 'Bar', color: '#6d28d9', tint: '#ede9fe', icon: 'M5 4h14l-7 8zM12 12v8M8 20h8M15 7l3-3' },
  { id: 'sights', label: 'Sights', color: '#1d4ed8', tint: '#dbeafe', icon: 'M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6' },
  { id: 'views', label: 'Views', color: '#0e7490', tint: '#cffafe', icon: 'M4 18l4-6 3 4 3-5 6 7M2 12s4-7 10-7 10 7 10 7' },
  { id: 'nature', label: 'Outdoor', color: '#15803d', tint: '#dcfce7', icon: 'M3 20l6-11 4 6 3-4 5 9zM9 9l1.5-4' },
  { id: 'beaches', label: 'Beaches', color: '#a16207', tint: '#fef9c3', icon: 'M2 20c3-2 5-2 8 0s5 2 8 0M12 4a6 6 0 0 1 6 6H6a6 6 0 0 1 6-6zM12 10v7' },
  { id: 'museums', label: 'Museums', color: '#be185d', tint: '#fce7f3', icon: 'M3 9l9-5 9 5M5 9v9M10 9v9M14 9v9M19 9v9M3 20h18' },
  { id: 'shopping', label: 'Shopping', color: '#475569', tint: '#e2e8f0', icon: 'M6 7h12l-1 13H7zM9 7a3 3 0 0 1 6 0' },
  { id: 'experiences', label: 'Activity', color: '#c2410c', tint: '#ffedd5', icon: 'M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM15 7v10' },
  { id: 'stay', label: 'Hotels', color: '#0f172a', tint: '#e2e8f0', icon: 'M3 18V8M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6M7 11a1.5 1.5 0 1 0 0 .01' },
];

/** Kids friendly is a tag that can sit on a place of any category. */
export const KIDS = { label: 'Kids friendly', color: '#b45309', tint: '#fef3c7', badge: '#f59e0b', icon: 'M12 3a5 5 0 0 1 5 5c0 3.5-3 6-5 6s-5-2.5-5-6a5 5 0 0 1 5-5zM12 14v2M12 16c-1.5 2 1.5 3 0 5' };
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
