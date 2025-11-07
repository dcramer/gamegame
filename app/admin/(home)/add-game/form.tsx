"use client";

import { useFileInput } from "@/lib/hooks/useFileInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { orpc } from "@/lib/procedures/client";
import { upload } from "@/lib/uploads/client";
import type { BGGSearchResult } from "@/lib/types/bgg";
import { Loader2, Search, Dices } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFlashMessages } from "@/components/flashMessages";

export default function Form() {
  const router = useRouter();
  const { flash } = useFlashMessages();
  const [mode, setMode] = useState<"bgg" | "manual">("bgg");

  // BGG search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BGGSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  // Manual form state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [gameName, setGameName] = useState("");
  const [bggUrl, setBggUrl] = useState("");

  // Image upload hook
  const { triggerFileInput } = useFileInput({
    accept: "image/*",
    multiple: false,
    onSelect: (files) => {
      const file = files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      setImageUrl(url);
      setImageFile(file);
    },
  });

  // Search function (triggered by form submission)
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setHasSearched(true);
    setSearchError(null);
    setThumbnails({}); // Clear previous thumbnails
    try {
      const results = await orpc.bgg.search({ query: searchQuery });
      setSearchResults(results);

      // Use thumbnails from already-imported games only (from gameImageUrl)
      const newThumbnails: Record<string, string> = {};
      results.forEach((result: BGGSearchResult) => {
        if (result.gameImageUrl) {
          newThumbnails[result.id] = result.gameImageUrl;
        }
      });
      setThumbnails(newThumbnails);
    } catch (error) {
      console.error("Search error:", error);
      const message = error instanceof Error ? error.message : "Failed to search BoardGameGeek";
      setSearchError(message);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectGame = async (result: BGGSearchResult) => {
    setIsCreating(true);
    setSearchResults([]);

    try {
      const game = await orpc.bgg.importGame({ bggId: result.id });
      flash(`Game "${game.name}" created successfully!`, "success");
      router.push(`/admin/games/${game.id}`);
    } catch (error) {
      console.error("Error creating game from BGG:", error);
      const message = error instanceof Error ? error.message : "Failed to create game from BoardGameGeek";
      flash(message, "error");
      setIsCreating(false);
    }
  };

  if (mode === "bgg") {
    return (
      <div className="grid gap-4">
        {/* BGG Search Form */}
        <form onSubmit={handleSearch} className="grid gap-2">
          <Label htmlFor="search">Search BoardGameGeek</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                type="text"
                placeholder="Search for a game..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                disabled={isCreating || isSearching}
                autoFocus
              />
            </div>
            <Button type="submit" disabled={isSearching || isCreating} className="min-w-[100px]">
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Search BoardGameGeek to import official game data, box art, and metadata.
          </p>
        </form>

        {/* Search Results */}
        {hasSearched && !isCreating && (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {/* Manual Creation Row - Always shown at top after search */}
                <button
                  type="button"
                  onClick={() => setMode("manual")}
                  className="flex items-center gap-4 p-4 transition-colors cursor-pointer w-full text-left hover:bg-accent border-b-2 border-primary/20"
                >
                  <div className="w-16 h-16 rounded bg-primary/10 flex items-center justify-center shrink-0">
                    <Dices className="w-8 h-8 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-lg">Add Game Manually</h4>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Can't find your game? Create it manually with basic information
                    </p>
                  </div>
                  <div className="text-sm shrink-0">
                    <span className="text-primary">Click to create →</span>
                  </div>
                </button>

                {/* BGG Search Results */}
                {searchResults.map((result) => {
                  const thumbnailUrl = thumbnails[result.id];
                  const isImported = result.isImported;

                  return (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => {
                        if (isImported && result.gameId) {
                          // Navigate to existing game
                          router.push(`/admin/games/${result.gameId}`);
                        } else {
                          // Import new game
                          handleSelectGame(result);
                        }
                      }}
                      className="flex items-center gap-4 p-4 transition-colors cursor-pointer w-full text-left hover:bg-muted/50"
                    >
                      <div className="w-16 h-16 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {thumbnailUrl ? (
                          <Image
                            src={thumbnailUrl}
                            alt={result.name}
                            width={64}
                            height={64}
                            className="object-cover"
                          />
                        ) : (
                          <Dices className="w-8 h-8 text-muted-foreground" />
                        )}
                      </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-3">
                        <h4 className="font-medium text-lg truncate">{result.name}</h4>
                        {result.yearPublished && (
                          <span className="text-sm text-muted-foreground shrink-0">
                            ({result.yearPublished})
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">
                        {result.type === "boardgameexpansion" && "Expansion • "}
                        BGG #{result.id}
                        {isImported && <span className="text-green-600 ml-2">• Already imported</span>}
                      </p>
                    </div>
                    <div className="text-sm shrink-0">
                      {isImported ? (
                        <span className="text-green-600">View game →</span>
                      ) : (
                        <span className="text-primary">Click to import →</span>
                      )}
                    </div>
                  </button>
                );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Display */}
        {searchError && hasSearched && !isCreating && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="p-4">
              <p className="text-sm text-destructive">
                <strong>Search failed:</strong> {searchError}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Creating state */}
        {isCreating && (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Creating game from BoardGameGeek...</span>
          </div>
        )}
      </div>
    );
  }

  // Manual entry mode
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setLoading(true);
        try {
          const formData = new FormData(event.currentTarget);

          let finalImageUrl = imageUrl;
          if (imageFile) {
            const newBlob = await upload(imageFile.name, imageFile, {
              access: "public",
              handleUploadUrl: "/api/images/upload",
            });
            finalImageUrl = newBlob.url;
          }

          const gameData = {
            name: formData.get("name") as string,
            imageUrl: finalImageUrl || undefined,
            bggUrl: formData.get("bggUrl") as string || undefined,
          };

          const game = await orpc.games.create(gameData);
          router.push(`/admin/games/${game.id}`);
        } catch (error) {
          console.error('Failed to create game:', error);
          flash({ type: 'error', message: 'Failed to create game' });
        } finally {
          setLoading(false);
        }
      }}
      className="grid gap-4"
    >
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          type="text"
          name="name"
          placeholder="Settlers of Catan"
          value={gameName}
          onChange={(e) => setGameName(e.target.value)}
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="bggUrl">BGG URL (optional)</Label>
        <Input
          id="bggUrl"
          type="text"
          name="bggUrl"
          placeholder="e.g. https://boardgamegeek.com/boardgame/13/catan"
          value={bggUrl}
          onChange={(e) => setBggUrl(e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="imageUrl">Box Art</Label>
        <Card
          className="relative cursor-pointer group"
          onClick={triggerFileInput}
        >
          <CardContent className="flex items-center justify-center min-h-64 p-6">
            {imageUrl ? (
              <div className="w-full aspect-[3/2] overflow-hidden relative">
                <Image
                  src={imageUrl}
                  alt="Box Art"
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  style={{
                    objectFit: "cover",
                    objectPosition: "top",
                  }}
                />
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-primary/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="text-primary-foreground text-center">
                    <div className="text-lg font-semibold">Click to upload</div>
                    <div className="text-sm">Replace box art</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-lg font-medium">Click to upload an image</p>
              </div>
            )}

            {/* Hover overlay for empty state */}
            {!imageUrl && (
              <div className="absolute inset-0 bg-primary/90 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                <div className="text-primary-foreground text-center">
                  <div className="text-lg font-semibold">Click to upload</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setMode("bgg")}
          className="flex-1"
        >
          Back to BGG Search
        </Button>
        <Button type="submit" className="flex-1" disabled={isLoading}>
          Add Game
          {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
        </Button>
      </div>
    </form>
  );
}
