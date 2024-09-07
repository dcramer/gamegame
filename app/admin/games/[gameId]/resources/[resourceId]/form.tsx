"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateResourceForm } from "@/lib/actions/forms";
import { Loader2 } from "lucide-react";
import { FormEvent, useState } from "react";

export default function ResourceForm({
  resourceId,
  initialData = {},
}: {
  resourceId: string;
  initialData?: {
    name?: string;
    content?: string;
  };
}) {
  const [isLoading, setLoading] = useState(false);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setLoading(true);
        const formData = new FormData(event.currentTarget); //get formData from event
        await updateResourceForm(resourceId, formData);
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
          defaultValue={initialData?.name}
          placeholder="Game Manual.pdf"
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="name">Content</Label>
        <Textarea
          id="content"
          name="content"
          defaultValue={initialData?.content}
          rows={16}
          placeholder="Markdown Content"
          required
        />
      </div>

      <Button type="submit" className="mr-auto" disabled={isLoading}>
        Save Changes
        {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
      </Button>
    </form>
  );
}
