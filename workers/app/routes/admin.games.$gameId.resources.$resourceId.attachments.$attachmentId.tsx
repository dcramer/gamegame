import { useState } from 'react';
import { useParams, useLoaderData } from 'react-router';
import { RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { useFlashNotifications } from '../hooks/useFlashNotifications';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Spinner } from '../components/ui/spinner';
import { SaveButton } from '../components/ui/save-button';
import { PageHeader } from '../components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { attachmentSchema } from '../lib/schemas';
import { z } from 'zod';
import { apiClient } from '../../load-context';
import type { Route } from './+types/admin.games.$gameId.resources.$resourceId.attachments.$attachmentId';
import { createMeta, createAdminTitle } from '../lib/meta';

export const meta = ({ data }: Route.MetaArgs) => {
  if (!data?.attachment) {
    return createMeta({
      title: createAdminTitle('Attachment Not Found'),
      noIndex: true,
    });
  }

  const attachmentName = data.attachment.originalFilename ||
                         data.attachment.description ||
                         `Attachment ${data.attachment.id}`;

  return createMeta({
    title: createAdminTitle(attachmentName, data.resource.name, data.game.name),
    description: `Edit attachment from ${data.resource.name}.`,
    noIndex: true,
  });
};

// Extended Attachment schema with additional UI fields
const extendedAttachmentSchema = attachmentSchema.extend({
  description: z.string().nullable().optional(),
  isGoodQuality: z.boolean().nullable().optional(),
});

type Attachment = z.infer<typeof extendedAttachmentSchema>;

export async function loader({ params, context }: Route.LoaderArgs) {
  const { requireAdmin } = await import('../lib/auth');
  await requireAdmin(context.api);

  const [attachmentRes, resourceRes, gameRes] = await Promise.all([
    context.api.fetch(`/attachments/${params.attachmentId}`),
    context.api.fetch(`/resources/${params.resourceId}`),
    context.api.fetch(`/games/${params.gameId}`),
  ]);

  if (!attachmentRes.ok) throw new Error('Attachment not found');
  if (!resourceRes.ok) throw new Error('Resource not found');
  if (!gameRes.ok) throw new Error('Game not found');

  const [attachmentJson, resourceJson, gameJson] = await Promise.all([
    attachmentRes.json(),
    resourceRes.json(),
    gameRes.json(),
  ]);

  const attachment = extendedAttachmentSchema.parse(attachmentJson);
  const resource = resourceJson as { name: string };
  const game = gameJson as { name: string };

  return { attachment, resource, game };
}

export default function AdminEditAttachment() {
  const { gameId, resourceId } = useParams<{
    gameId: string;
    resourceId: string;
  }>();
  const { attachment: initialAttachment, resource, game } = useLoaderData<typeof loader>();
  const [attachment, setAttachment] = useState<Attachment>(initialAttachment);

  // Form state
  const [description, setDescription] = useState(initialAttachment.description || '');
  const [originalFilename, setOriginalFilename] = useState(initialAttachment.originalFilename || '');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [reprocessing, setReprocessing] = useState(false);

  const { addToast } = useFlashNotifications();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    setSaving(true);
    setSaveStatus('idle');
    try {
      const payload = {
        description: description.trim() ? description : null,
        originalFilename: originalFilename.trim() ? originalFilename : null,
      };

      const response = await apiClient.fetch(`/attachments/${attachment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const updatedAttachment = extendedAttachmentSchema.parse(await response.json());
        setAttachment(updatedAttachment);
        setDescription(updatedAttachment.description || '');
        setOriginalFilename(updatedAttachment.originalFilename || '');
        setSaveStatus('success');
        addToast('success', 'Attachment details saved successfully!');
      } else {
        setSaveStatus('error');
        addToast('error', 'Failed to save attachment details. Please try again.');
      }
    } catch (error) {
      console.error('Update error:', error);
      setSaveStatus('error');
      addToast('error', 'Failed to save attachment details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReprocess = async () => {
    setReprocessing(true);
    try {
      const response = await apiClient.fetch(`/attachments/${attachment.id}/reprocess`, {
        method: 'POST',
      });

      if (response.ok) {
        const updatedAttachment = extendedAttachmentSchema.parse(await response.json());
        setAttachment(updatedAttachment);
        setDescription(updatedAttachment.description || '');
        addToast('success', 'Vision analysis completed successfully!');
      } else {
        const errorJson = await response.json();
        const errorMsg = (errorJson as { error?: string }).error || 'Unknown error';
        addToast('error', `Reprocessing failed: ${errorMsg}`);
      }
    } catch (error) {
      console.error('Reprocess error:', error);
      addToast('error', 'Failed to reprocess attachment');
    } finally {
      setReprocessing(false);
    }
  };

  return (
    <AdminLayout>
      <PageHeader
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Games', href: '/admin' },
          { label: game.name, href: `/admin/games/${gameId}` },
          { label: resource.name, href: `/admin/games/${gameId}/resources/${resourceId}` },
          { label: 'Edit Attachment' },
        ]}
        title="Edit Attachment"
        stats={attachment.pageNumber ? `Page ${attachment.pageNumber}` : undefined}
      />

      <div className="space-y-12">
      {/* Image Preview */}
      <div>
        <Label className="mb-2 block">Preview</Label>
        <div className="border rounded-lg overflow-hidden max-w-2xl bg-muted">
          {attachment.type === 'image' && attachment.mimeType?.startsWith('image/') ? (
            <img
              src={attachment.url}
              alt={attachment.description || attachment.originalFilename || 'Attachment'}
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
        {attachment.isGoodQuality !== null && (
          <div className="mt-2">
            <Badge variant={attachment.isGoodQuality ? 'success' : 'error'}>
              {attachment.isGoodQuality ? (
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
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="AI-generated description of the image content"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <p className="text-xs text-muted-foreground">
            This description helps the AI understand what's in the image when answering questions.
          </p>
        </div>

        <div className="flex gap-4">
          <SaveButton
            type="submit"
            status={saveStatus}
            isLoading={saving}
            onStatusTimeout={() => setSaveStatus('idle')}
          />

          <Button
            type="button"
            variant="outline"
            onClick={handleReprocess}
            disabled={reprocessing}
          >
            {reprocessing ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Reprocessing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reprocess with Vision
              </>
            )}
          </Button>
        </div>
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
            <dd className="font-mono">{attachment.mimeType || 'N/A'}</dd>
          </div>
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
    </AdminLayout>
  );
}
