// BGG API Types
export interface BGGSearchResult {
  id: string;
  name: string;
  yearPublished: number | null;
  type: "boardgame" | "boardgameexpansion";
  thumbnailUrl?: string | null; // Optional, fetched with additional API call
  isImported?: boolean;
  gameId?: string | null;
  gameImageUrl?: string | null;
}

export interface BGGGameDetails {
  id: string;
  name: string;
  description: string | null;
  yearPublished: number | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  playingTime: number | null;
  minPlayTime: number | null;
  maxPlayTime: number | null;
  minAge: number | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  publishers: string[] | null;
  designers: string[] | null;
  artists: string[] | null;
  categories: string[] | null;
  mechanics: string[] | null;
}
