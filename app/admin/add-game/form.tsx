"use client";

import ResourceDropzone from "@/components/resource-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createGameForm } from "@/lib/actions/forms";
import { upload } from "@/lib/uploads/client";
import { searchBGG, createGameFromBGG } from "@/lib/actions/bgg";
import type { BGGSearchResult } from "@/lib/types/bgg";
import { Loader2, Search, ExternalLink } from "lucide-react";
import Image from "next/image";
import { useState, useCallback, useEffect, useMemo } from "react";
import { debounce } from "@/lib/utils";
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

  // Manual form state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [gameName, setGameName] = useState("");
  const [bggUrl, setBggUrl] = useState("");

  // Debounced search
  const debouncedSearch = useMemo(
    () => debounce(async (query: string) => {
      if (query.length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const results = await searchBGG(query);
        setSearchResults(results);
      } catch (error) {
        console.error("Search error:", error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500),
    []
  );

  useEffect(() => {
    if (mode === "bgg") {
      debouncedSearch(searchQuery);
    }
  }, [searchQuery, debouncedSearch, mode]);

  const handleSelectGame = async (result: BGGSearchResult) => {
    setIsCreating(true);
    setSearchResults([]);

    try {
      const game = await createGameFromBGG(result.id);
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
        {/* BGG Search Mode */}
        <div className="grid gap-2">
          <Label htmlFor="search">Search BoardGameGeek</Label>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              id="search"
              type="text"
              placeholder="Search for a game..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              disabled={isCreating}
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin" />
            )}
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && !isCreating && (
            <Card>
              <CardContent className="p-2">
                <div className="max-h-96 overflow-y-auto">
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => handleSelectGame(result)}
                      className="w-full p-3 text-left hover:bg-accent rounded-md flex justify-between items-center"
                    >
                      <div>
                        <div className="font-medium">{result.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {result.yearPublished || "Unknown year"}
                          {result.type === "boardgameexpansion" && " (Expansion)"}
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Creating state */}
        {isCreating && (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Creating game from BoardGameGeek...</span>
          </div>
        )}

        {/* Switch to manual mode */}
        {!isCreating && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setMode("manual")}
            className="w-full"
          >
            Add Game Manually
          </Button>
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
        const formData = new FormData(event.currentTarget);
        if (imageFile) {
          const newBlob = await upload(imageFile.name, imageFile, {
            access: "public",
            handleUploadUrl: "/api/images/upload",
          });
          formData.set("imageUrl", newBlob.url);
        } else if (imageUrl && !imageFile) {
          formData.set("imageUrl", imageUrl);
        }

        await createGameForm(formData);
        setLoading(false);
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
        <ResourceDropzone
          onAddFiles={(files) => {
            const file = files[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            setImageUrl(url);
            setImageFile(file);
          }}
        >
          <Card className="relative cursor-pointer group">
            <CardContent className="flex flex-col items-center p-0">
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
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="text-white text-center">
                      <div className="text-lg font-semibold">Click or drag to upload</div>
                      <div className="text-sm">Replace box art</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6">Drag an image to upload</div>
              )}
            </CardContent>
          </Card>
        </ResourceDropzone>
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
