"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { updateResourceForm } from "@/lib/actions/forms";
import { Loader2 } from "lucide-react";
import { useState } from "react";

export default function ResourceForm({
  resourceId,
  initialData = {},
}: {
  resourceId: string;
  initialData?: {
    name?: string;
    content?: string;
    description?: string | null;
    author?: string | null;
    attributionUrl?: string | null;
    originalFilename?: string | null;
    createdAt?: number;
    updatedAt?: number;
  };
}) {
  const [isLoading, setLoading] = useState(false);

  return (
    <Card className="max-w-2xl">
      <CardContent className="pt-6">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setLoading(true);
            try {
              const formData = new FormData(event.currentTarget);
              await updateResourceForm(resourceId, formData);
              setLoading(false);
            } catch (error) {
              setLoading(false);
              throw error;
            }
          }}
          className="grid gap-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="name">Document Title</Label>
            <Input
              id="name"
              type="text"
              name="name"
              defaultValue={initialData?.name}
              placeholder="Game Manual"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={initialData?.description ?? ""}
              rows={4}
              placeholder="Short description of this resource"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="author">Author / Creator</Label>
            <Input
              id="author"
              type="text"
              name="author"
              defaultValue={initialData?.author ?? ""}
              placeholder="e.g. Fantasy Flight Games"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="attributionUrl">Attribution URL</Label>
            <Input
              id="attributionUrl"
              type="url"
              name="attributionUrl"
              defaultValue={initialData?.attributionUrl ?? ""}
              placeholder="https://publisher.com/rulebook"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="originalFilename">Original Filename</Label>
            <Input
              id="originalFilename"
              type="text"
              value={initialData?.originalFilename ?? ""}
              readOnly
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              This field is read-only and cannot be edited.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="createdAt">Created</Label>
              <Input
                id="createdAt"
                type="text"
                value={initialData?.createdAt ? new Date(initialData.createdAt).toLocaleString() : "N/A"}
                readOnly
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="updatedAt">Last Updated</Label>
              <Input
                id="updatedAt"
                type="text"
                value={initialData?.updatedAt ? new Date(initialData.updatedAt).toLocaleString() : "N/A"}
                readOnly
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="content">Markdown Content</Label>
            <Textarea
              id="content"
              value={initialData?.content ?? ""}
              readOnly
              rows={16}
              placeholder="Markdown Content"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Content is managed by the processing pipeline. Use the "Reprocess" button to regenerate content.
            </p>
          </div>

          <Button type="submit" className="mr-auto" disabled={isLoading}>
            Save Changes
            {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
