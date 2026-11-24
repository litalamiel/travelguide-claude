export type CategoryId =
  | 'eat' | 'coffee' | 'drinks' | 'sights' | 'views' | 'nature'
  | 'beaches' | 'museums' | 'shopping' | 'experiences' | 'stay';

export interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: CategoryId;
  address?: string;
  note?: string;
  mustSee?: boolean;
  source: 'search' | 'reel' | 'sample';
  reelUrl?: string;
  /** User's own photos, or frames/cover from the reel. Stored as small JPEG data URLs. */
  photos?: string[];
  reel?: { author?: string; caption?: string };
  visited?: boolean;
}

/** A place the user is looking at on the map before confirming "Add to map". */
export type PendingPlace = Omit<Place, 'id'>;

export interface DayPlan {
  day: number;
  places: Place[];
  /** Estimated driving minutes between stops (straight-line based). */
  driveMinutes: number;
  overLimit: boolean;
  area: string;
}

export interface Listing {
  published: boolean;
  creatorName: string;
  description: string;
  price: number;
  currency: 'USD' | 'EUR' | 'GBP' | 'ILS';
  previewCount: number;
}

export interface TripMap {
  id: string;
  name: string;
  places: Place[];
  createdAt: string;
  listing?: Listing;
}
