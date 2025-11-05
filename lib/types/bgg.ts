// BGG API Types
export interface BGGSearchResult {
  id: string;
  name: string;
  yearPublished: number | null;
  type: "boardgame" | "boardgameexpansion";
  thumbnailUrl?: string | null; // Optional, fetched with additional API call
}

export interface BGGGameDetails {
  id: string;
  name: string;
  description: string;
  yearPublished: number | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  playingTime: number | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  publishers: string[];
  designers: string[];
}
