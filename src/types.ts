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
}

export interface DayPlan {
  day: number;
  places: Place[];
  /** Estimated driving minutes between stops (straight-line based). */
  driveMinutes: number;
  overLimit: boolean;
  area: string;
}
