"use client";

import { useFileInput } from "@/lib/hooks/useFileInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { orpc } from "@/lib/procedures/client";
import { upload } from "@/lib/uploads/client";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Form({
  game,
}: {
  game: {
    id: string;
    name: string;
    slug: string;
    year?: number | null;
    imageUrl: string | null;
    bggId: string | null;
    bggUrl: string | null;
  };
}) {
  const router = useRouter();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(game.imageUrl);
  const [isLoading, setLoading] = useState(false);

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

          const updateData: any = {
            name: formData.get("name") as string,
          };

          const yearValue = formData.get("year") as string;
          if (yearValue) {
            updateData.year = parseInt(yearValue, 10);
          }

          const bggUrlValue = formData.get("bggUrl") as string;
          if (bggUrlValue) {
            updateData.bggUrl = bggUrlValue;
          }

          if (finalImageUrl !== game.imageUrl) {
            updateData.imageUrl = finalImageUrl;
          }

          await orpc.games.update({ id: game.id, data: updateData });
          router.refresh();
        } catch (error) {
          console.error('Failed to update game:', error);
          alert('Failed to update game');
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
          defaultValue={game.name}
          placeholder="Settlers of Catan"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          type="text"
          name="slug"
          value={game.slug}
          readOnly
        />
        <p className="text-xs text-muted-foreground">Auto-generated from name</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="year">Year</Label>
        <Input
          id="year"
          type="number"
          name="year"
          defaultValue={game.year ?? ""}
          placeholder="e.g. 2020"
          min="1900"
          max="2100"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="bggUrl">BGG URL</Label>
        <Input
          id="bggUrl"
          type="text"
          name="bggUrl"
          defaultValue={game.bggUrl ?? ""}
          placeholder="e.g. https://boardgamegeek.com/boardgame/13/catan"
        />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="imageUrl">Box Art</Label>
          {imageUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={triggerFileInput}
            >
              Upload Image
            </Button>
          )}
        </div>
        <Card
          className="relative max-h-96 max-w-96 cursor-pointer group"
          onClick={!imageUrl ? triggerFileInput : undefined}
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
              </div>
            ) : (
              <div className="text-center">
                <p className="text-lg font-medium">Click to upload an image</p>
              </div>
            )}

            {/* Hover overlay */}
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
      <Button type="submit" className="mr-auto" disabled={isLoading}>
        Update Game
        {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
      </Button>
    </form>
  );
}
