import { useState, useEffect, useRef } from 'react';
import { useParams, useOutletContext } from 'react-router';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { SaveButton } from '../components/ui/save-button';
import { useFlashNotifications } from '../hooks/useFlashNotifications';
import { Card, CardContent } from '../components/ui/card';
import { apiClient } from '../../load-context';
import { useNotifications, type JobNotification } from '../contexts/NotificationContext';
import { resourceSchema, type Resource } from '../lib/schemas';
import { z } from 'zod';

// Extended Resource schema with additional UI fields
const extendedResourceSchema = resourceSchema.extend({
  originalFilename: z.string().optional(),
  description: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  attributionUrl: z.string().nullable().optional(),
  content: z.string().optional(),
});

export default function ResourceDetailsTab() {
  const { resourceId } = useParams<{ resourceId: string }>();
  const { resource: initialResource } = useOutletContext<{ resource: Resource }>();
  const [resource, setResource] = useState<Resource>(initialResource);

  // Form state
  const [name, setName] = useState(initialResource.name || '');
  const [content, setContent] = useState(initialResource.content || '');
  const [description, setDescription] = useState(initialResource.description || '');
  const [author, setAuthor] = useState(initialResource.author || '');
  const [attributionUrl, setAttributionUrl] = useState(initialResource.attributionUrl || '');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const { addToast } = useFlashNotifications();
  const { notifications } = useNotifications();
  const completedJobsRef = useRef<Set<string>>(new Set());

  // Reload resource data when a processing job completes
  useEffect(() => {
    const jobNotifications = notifications.filter(
      (n): n is JobNotification => n.type === 'job'
    );

    for (const job of jobNotifications) {
      // Check if this is a newly completed job that we haven't processed yet
      if (
        job.status === 'completed' &&
        !completedJobsRef.current.has(job.jobId)
      ) {
        completedJobsRef.current.add(job.jobId);

        // Reload resource data from the API
        const reloadResource = async () => {
          try {
            const response = await apiClient.fetch(`/resources/${resourceId}`);
            if (response.ok) {
              const updatedResource = extendedResourceSchema.parse(await response.json());
              setResource(updatedResource);
              setName(updatedResource.name || '');
              setContent(updatedResource.content || '');
              setDescription(updatedResource.description || '');
              setAuthor(updatedResource.author || '');
              setAttributionUrl(updatedResource.attributionUrl || '');
              console.log('Resource data reloaded after job completion');
            }
          } catch (error) {
            console.error('Failed to reload resource after job completion:', error);
          }
        };

        reloadResource();
      }
    }
  }, [notifications, resourceId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    setSaving(true);
    setSaveStatus('idle');
    try {
      const payload = {
        name,
        // Note: content is managed by the processing pipeline and cannot be updated directly
        description: description.trim() ? description : null,
        author: author.trim() ? author : null,
        attributionUrl: attributionUrl.trim() ? attributionUrl : null,
      };

      const response = await apiClient.fetch(`/resources/${resource.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const updatedResource = extendedResourceSchema.parse(await response.json());
        setResource((prev) => (prev ? { ...prev, ...updatedResource } : updatedResource));
        setName(updatedResource.name || '');
        setContent(updatedResource.content || '');
        setDescription(updatedResource.description || '');
        setAuthor(updatedResource.author || '');
        setAttributionUrl(updatedResource.attributionUrl || '');
        setSaveStatus('success');
        addToast('success', 'Resource details saved successfully!');
      } else {
        setSaveStatus('error');
        addToast('error', 'Failed to save resource details. Please try again.');
      }
    } catch (error) {
      console.error('Update error:', error);
      setSaveStatus('error');
      addToast('error', 'Failed to save resource details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Card className="max-w-2xl">
        <CardContent className="pt-6">
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Document Title</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Game Manual"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Short description of this resource"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="author">Author / Creator</Label>
            <Input
              id="author"
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g. Fantasy Flight Games"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="attributionUrl">Attribution URL</Label>
            <Input
              id="attributionUrl"
              type="url"
              value={attributionUrl}
              onChange={(e) => setAttributionUrl(e.target.value)}
              placeholder="https://publisher.com/rulebook"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="originalFilename">Original Filename</Label>
            <Input
              id="originalFilename"
              type="text"
              value={resource.originalFilename || ''}
              readOnly
              className="font-mono bg-muted cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground">
              This field is read-only and cannot be edited.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="createdAt">Created</Label>
              <Input
                id="createdAt"
                type="text"
                value={resource.createdAt ? new Date(resource.createdAt).toLocaleString() : 'N/A'}
                readOnly
                className="bg-muted cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="updatedAt">Last Updated</Label>
              <Input
                id="updatedAt"
                type="text"
                value={resource.updatedAt ? new Date(resource.updatedAt).toLocaleString() : 'N/A'}
                readOnly
                className="bg-muted cursor-not-allowed"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Markdown Content</Label>
            <textarea
              id="content"
              value={content}
              readOnly
              rows={16}
              placeholder="Markdown Content"
              className="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground font-mono cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground">
              Content is managed by the processing pipeline. Use the "Advanced Reprocessing" panel to regenerate content.
            </p>
          </div>

          <SaveButton
            type="submit"
            status={saveStatus}
            isLoading={saving}
            onStatusTimeout={() => setSaveStatus('idle')}
          />
        </form>
      </CardContent>
    </Card>
    </div>
  );
}
