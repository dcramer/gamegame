import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { AlertMessage } from '../components/AlertMessage';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Spinner } from '../components/ui/spinner';
import { SaveButton } from '../components/ui/save-button';
import Heading from '../components/Heading';
import { attachmentSchema } from '../lib/schemas';
import { z } from 'zod';

// Extended Attachment schema with additional UI fields
const extendedAttachmentSchema = attachmentSchema.extend({
  description: z.string().nullable().optional(),
  isGoodQuality: z.boolean().nullable().optional(),
});

type Attachment = z.infer<typeof extendedAttachmentSchema>;

export default function AdminEditAttachment() {
  const { gameId, resourceId, attachmentId } = useParams<{
    gameId: string;
    resourceId: string;
    attachmentId: string;
  }>();
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [description, setDescription] = useState('');
  const [originalFilename, setOriginalFilename] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessStatus, setReprocessStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!attachmentId) return;

    const loadAttachment = async () => {
      try {
        const res = await fetch(`/api/attachments/${attachmentId}`);
        if (!res.ok) throw new Error('Attachment not found');
        const json = await res.json();
        const data = extendedAttachmentSchema.parse(json);
        setAttachment(data);
        setDescription(data.description || '');
        setOriginalFilename(data.originalFilename || '');
        setLoading(false);
      } catch (err) {
        console.error('Failed to load attachment:', err);
        setAttachment(null);
        setLoading(false);
      }
    };

    loadAttachment();
  }, [attachmentId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attachmentId) return;

    setSaving(true);
    setSaveStatus('idle');
    try {
      const payload = {
        description: description.trim() ? description : null,
        originalFilename: originalFilename.trim() ? originalFilename : null,
      };

      const response = await fetch(`/api/attachments/${attachmentId}`, {
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
      } else {
        setSaveStatus('error');
      }
    } catch (error) {
      console.error('Update error:', error);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const handleReprocess = async () => {
    if (!attachmentId) return;

    setReprocessing(true);
    setReprocessStatus(null);
    try {
      const response = await fetch(`/api/attachments/${attachmentId}/reprocess`, {
        method: 'POST',
      });

      if (response.ok) {
        const updatedAttachment = extendedAttachmentSchema.parse(await response.json());
        setAttachment(updatedAttachment);
        setDescription(updatedAttachment.description || '');
        setReprocessStatus({ type: 'success', message: 'Vision analysis completed successfully!' });
      } else {
        const errorJson = await response.json();
        const errorMsg = (errorJson as { error?: string }).error || 'Unknown error';
        setReprocessStatus({ type: 'error', message: `Reprocessing failed: ${errorMsg}` });
      }
    } catch (error) {
      console.error('Reprocess error:', error);
      setReprocessStatus({ type: 'error', message: 'Failed to reprocess attachment' });
    } finally {
      setReprocessing(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </AdminLayout>
    );
  }

  if (!attachment) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-xl mb-4">Attachment not found</p>
          <Button asChild>
            <Link to={`/admin/games/${gameId}/resources/${resourceId}`}>Back to Resource</Link>
          </Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to={`/admin/games/${gameId}/resources/${resourceId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Resource
          </Link>
        </Button>

        <div className="flex items-center gap-4 mb-2">
          <Heading className="mb-0">Edit Attachment</Heading>
        </div>
        {attachment.pageNumber && (
          <p className="text-muted-foreground text-sm">Page {attachment.pageNumber}</p>
        )}
      </div>

      {/* Image Preview */}
      <div className="mb-8">
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
          <p className="text-sm text-muted-foreground mt-1">
            Quality: {attachment.isGoodQuality ? '✓ Good' : '✗ Bad'}
          </p>
        )}
      </div>

      {/* Reprocess Status */}
      {reprocessStatus && (
        <AlertMessage
          variant={reprocessStatus.type}
          message={reprocessStatus.message}
          onDismiss={() => setReprocessStatus(null)}
        />
      )}

      {/* Edit Form */}
      <form onSubmit={handleSave} className="grid gap-4 mb-8">
        <div className="grid gap-2">
          <Label htmlFor="originalFilename">Filename</Label>
          <Input
            id="originalFilename"
            type="text"
            value={originalFilename}
            onChange={(e) => setOriginalFilename(e.target.value)}
            placeholder="image.png"
          />
        </div>

        <div className="grid gap-2">
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
            successText="Changes saved."
            errorText="Failed to save changes. Please try again."
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

      {/* Additional Metadata */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold mb-4">Metadata</h3>
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
      </div>
    </AdminLayout>
  );
}
