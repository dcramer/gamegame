"use client";

import ResourceDropzone from "@/components/resource-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateGameForm } from "@/lib/actions/forms";
import { upload } from "@/lib/uploads/client";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

export default function Form({
  game,
}: {
  game: {
    id: string;
    name: string;
    imageUrl: string | null;
    bggUrl: string | null;
  };
}) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(game.imageUrl);
  const [isLoading, setLoading] = useState(false);

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
        }

        await updateGameForm(game.id, formData);
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
          defaultValue={game.name}
          placeholder="Settlers of Catan"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="bggUrl">BGG Url</Label>
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
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/*";
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  const url = URL.createObjectURL(file);
                  setImageUrl(url);
                  setImageFile(file);
                };
                input.click();
              }}
            >
              Upload Image
            </Button>
          )}
        </div>
        <ResourceDropzone
          onAddFiles={(files) => {
            const file = files[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            setImageUrl(url);
            setImageFile(file);
          }}
        >
          <Card className="relative max-h-96 max-w-96" onClick={imageUrl ? (e) => e.stopPropagation() : undefined}>
            <CardContent className="flex flex-col items-center" style={imageUrl ? { pointerEvents: 'none' } : undefined}>
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
                <div className="p-6">Drag an image to upload</div>
              )}
            </CardContent>
          </Card>
        </ResourceDropzone>
      </div>
      <Button type="submit" className="mr-auto" disabled={isLoading}>
        Update Game
        {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
      </Button>
    </form>
  );
}
