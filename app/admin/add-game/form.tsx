"use client";

import ResourceDropzone from "@/components/resource-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createGameForm } from "@/lib/actions/forms";
import { upload } from "@vercel/blob/client";
import Image from "next/image";
import { useState } from "react";

export default function Form() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  return (
    <form
      action={async (formData) => {
        setIsLoading(true);
        if (imageFile) {
          const newBlob = await upload(imageFile.name, imageFile, {
            access: "public",
            handleUploadUrl: "/api/images/upload",
          });
          formData.set("imageUrl", newBlob.url);
        }

        await createGameForm(formData);
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
          required
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
          <Card className="relative">
            <CardContent className="flex flex-col items-center">
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
      <Button type="submit" className="w-full" disabled={isLoading}>
        Add Game
      </Button>
    </form>
  );
}
