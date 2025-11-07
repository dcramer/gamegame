"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { orpc } from "@/lib/procedures/client";

type AttachmentData = Awaited<ReturnType<typeof orpc.attachments.get>>;

export default function AttachmentForm({
  attachment: initialAttachment,
}: {
  attachment: AttachmentData;
}) {
  const router = useRouter();
  const [attachment, setAttachment] = useState<AttachmentData>(initialAttachment);
  const [description, setDescription] = useState(initialAttachment.description || "");
  const [originalFilename, setOriginalFilename] = useState(
    initialAttachment.originalFilename || ""
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    setSaving(true);
    try {
      const updated = await orpc.attachments.update({
        id: attachment.id,
        description: description.trim() || null,
        originalFilename: originalFilename.trim() || null,
      });
      setAttachment(updated);
      setDescription(updated.description || "");
      setOriginalFilename(updated.originalFilename || "");
      router.refresh();
    } catch (error) {
      console.error("Update error:", error);
      alert("Failed to save attachment details. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Image Preview */}
      <div>
        <Label className="mb-2 block">Preview</Label>
        <div className="border rounded-lg overflow-hidden max-w-2xl bg-muted">
          {attachment.type === "image" &&
          attachment.mimeType?.startsWith("image/") ? (
            <img
              src={attachment.url}
              alt={
                attachment.description ||
                attachment.originalFilename ||
                "Attachment"
              }
              className="w-full"
            />
          ) : (
            <div className="flex items-center justify-center p-12">
              <p className="text-muted-foreground">Preview not available</p>
            </div>
          )}
        </div>
        {attachment.width && attachment.height && (
          <p className="text-sm text-muted-foreground mt-2">
            {attachment.width} × {attachment.height}
          </p>
        )}
        {attachment.isGoodQuality && (
          <div className="mt-2">
            <Badge
              variant={
                attachment.isGoodQuality === "good" ? "success" : "error"
              }
            >
              {attachment.isGoodQuality === "good" ? (
                <>
                  <CheckCircle className="w-3 h-3 mr-1 inline" />
                  Good Quality
                </>
              ) : (
                <>
                  <XCircle className="w-3 h-3 mr-1 inline" />
                  Low Quality
                </>
              )}
            </Badge>
          </div>
        )}
      </div>

      {/* Edit Form */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Attachment Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="originalFilename">Filename</Label>
              <Input
                id="originalFilename"
                type="text"
                value={originalFilename}
                onChange={(e) => setOriginalFilename(e.target.value)}
                placeholder="image.png"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="AI-generated description of the image content"
              />
              <p className="text-xs text-muted-foreground">
                This description helps the AI understand what's in the image
                when answering questions.
              </p>
            </div>

            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Additional Metadata */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="font-medium text-muted-foreground">ID</dt>
              <dd className="font-mono">{attachment.id}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Type</dt>
              <dd>{attachment.type}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">MIME Type</dt>
              <dd className="font-mono">{attachment.mimeType || "N/A"}</dd>
            </div>
            {attachment.pageNumber && (
              <div>
                <dt className="font-medium text-muted-foreground">
                  Page Number
                </dt>
                <dd>{attachment.pageNumber}</dd>
              </div>
            )}
            {attachment.caption && (
              <div className="col-span-2">
                <dt className="font-medium text-muted-foreground">Caption</dt>
                <dd>{attachment.caption}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
