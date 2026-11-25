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
  reel?: {
    /** Instagram handle, without the @. */
    author?: string;
    /** Creator's display name. */
    authorName?: string;
    /** Creator's profile picture (small data URL). */
    avatar?: string;
    /** Caption as shown in the app (English when the user saved a translation). */
    caption?: string;
    /** Original caption when it was translated. */
    captionOriginal?: string;
    captionLang?: string;
  };
  visited?: boolean;
}

/** A place the user is looking at on the map before confirming "Add to map". */
export type PendingPlace = Omit<Place, 'id'>;

export type DayKind = 'regular' | 'transition' | 'flight';

/** One day of a saved trip, stored as place ids so edits to places show up in the trip. */
export interface TripDay {
  placeIds: string[];
  /** Where you sleep that night (a place in the Hotels category). */
  stayId?: string;
  kind: DayKind;
  /** e.g. flight number, or "Lisbon → Sintra". */
  note?: string;
  /** "HH:MM" the day starts; defaults by day type. */
  startTime?: string;
  /** Times the user set for specific stops ("HH:MM" by place id). */
  times?: Record<string, string>;
  /** Flight departure "HH:MM" on flight days. */
  flightTime?: string;
}

export interface SavedTrip {
  id: string;
  name: string;
  createdAt: string;
  maxDriveHours: number;
  days: TripDay[];
}

export interface DayPlan {
  day: number;
  places: Place[];
  stay?: Place;
  kind: DayKind;
  note?: string;
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
  trips?: SavedTrip[];
}
